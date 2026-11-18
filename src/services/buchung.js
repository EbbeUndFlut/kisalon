// Buchen und Stornieren durch Kundinnen und Kunden.
// Prüfen und Speichern laufen in EINER Transaktion; die Zeilen der infrage
// kommenden Mitarbeiter werden mit SELECT … FOR UPDATE gesperrt. Eine zweite,
// gleichzeitige Buchung für dieselbe Person wartet dadurch, bis die erste
// fertig ist, und sieht deren Termin bei ihrer eigenen Prüfung (R-01, R-02).
import crypto from 'node:crypto';
import { transaktion, pool } from '../db.js';
import config from '../config.js';
import * as zeit from '../utils/zeit.js';
import * as regeln from './regeln.js';
import * as stammdaten from './stammdaten.js';
import { ladeBelegungen } from './verfuegbarkeit.js';
import { fehler } from '../utils/fehler.js';

/**
 * „egal“: Unter den freien Personen wird die mit den wenigsten Terminen an
 * diesem Tag gewählt (gleichmäßige Auslastung), bei Gleichstand die kleinere ID.
 */
function waehlePerson(kandidaten, belegungen, beginn, ende) {
  const frei = kandidaten.filter((k) => regeln.istFrei(belegungen.get(k.mitarbeiter_id), beginn, ende));
  frei.sort((a, b) =>
    belegungen.get(a.mitarbeiter_id).length - belegungen.get(b.mitarbeiter_id).length
    || a.mitarbeiter_id - b.mitarbeiter_id);
  return frei[0] || null;
}

/**
 * Bucht einen Termin. eingabe ist bereits validiert:
 * { leistungIds, mitarbeiterId|null, datum, uhrzeit, name, telefon, email }
 */
async function bucheTermin(eingabe) {
  const { leistungIds, mitarbeiterId, datum, uhrzeit } = eingabe;
  const startMin = zeit.zuMinuten(uhrzeit);

  const termin = await transaktion(async (conn) => {
    const jetzt = zeit.jetzt();
    const leistungen = await stammdaten.ladeBuchbareLeistungen(conn, leistungIds);
    const dauerMin = leistungen.reduce((summe, l) => summe + l.dauer_min, 0);

    const oeffnung = await stammdaten.ladeOeffnungszeit(conn, datum);
    const verstoss = regeln.zeitVerstoss(datum, startMin, dauerMin, oeffnung, jetzt);
    if (verstoss) throw fehler.regel(verstoss, 'BUCHUNGSREGEL');

    let kandidaten = await stammdaten.ladeKandidaten(conn, leistungIds, datum);
    if (mitarbeiterId !== null) {
      kandidaten = kandidaten.filter((k) => k.mitarbeiter_id === mitarbeiterId);
      if (kandidaten.length === 0) {
        const grund = await stammdaten.grundNichtVerfuegbar(conn, mitarbeiterId, leistungIds, datum);
        throw fehler.regel(grund.meldung, 'PERSON_NICHT_MOEGLICH');
      }
    }
    if (kandidaten.length === 0) {
      throw fehler.regel('An diesem Tag ist niemand für diese Leistung im Salon.', 'PERSON_NICHT_MOEGLICH');
    }

    // Sperre in fester Reihenfolge (nach ID), damit keine Deadlocks entstehen
    const ids = kandidaten.map((k) => k.mitarbeiter_id);
    await conn.execute(
      `SELECT mitarbeiter_id FROM mitarbeiter
        WHERE mitarbeiter_id IN (${stammdaten.platzhalter(ids.length)})
        ORDER BY mitarbeiter_id
          FOR UPDATE`,
      ids,
    );

    const belegungen = await ladeBelegungen(conn, ids, datum);
    const beginn = zeit.stempel(datum, startMin);
    const ende = beginn + dauerMin;
    const person = waehlePerson(kandidaten, belegungen, beginn, ende);
    if (!person) {
      throw fehler.konflikt(
        mitarbeiterId !== null
          ? 'Diese Uhrzeit wurde gerade vergeben. Bitte wählen Sie eine andere freie Zeit.'
          : 'Zu dieser Uhrzeit ist leider niemand mehr frei. Bitte wählen Sie eine andere Zeit.',
        'ZEIT_BELEGT',
      );
    }

    // Kunde über E-Mail wiedererkennen (F-06); Name/Telefon aktualisieren.
    // LAST_INSERT_ID(kunde_id) liefert auch bei bestehendem Kunden dessen ID.
    const [kunde] = await conn.execute(
      `INSERT INTO kunde (name, telefon, email) VALUES (?, ?, ?) AS neu
       ON DUPLICATE KEY UPDATE name = neu.name, telefon = neu.telefon,
                               kunde_id = LAST_INSERT_ID(kunde.kunde_id)`,
      [eingabe.name, eingabe.telefon, eingabe.email],
    );

    const stornoCode = crypto.randomUUID();
    const [neu] = await conn.execute(
      `INSERT INTO termin (kunde_id, mitarbeiter_id, beginn, ende, storno_code)
       VALUES (?, ?, ?, ?, ?)`,
      [kunde.insertId, person.mitarbeiter_id, zeit.alsDatetime(beginn), zeit.alsDatetime(ende), stornoCode],
    );

    let position = 1;
    for (const l of leistungen) {
      await conn.execute(
        `INSERT INTO termin_leistung (termin_id, leistung_id, position, dauer_min, preis)
         VALUES (?, ?, ?, ?, ?)`,
        [neu.insertId, l.leistung_id, position++, l.dauer_min, l.preis],
      );
    }

    return {
      id: neu.insertId,
      stornoCode,
      datum,
      beginn: uhrzeit,
      ende: zeit.alsUhrzeit(startMin + dauerMin),
      dauerMin,
      mitarbeiter: person.name,
      leistungen: leistungen.map((l) => ({ name: l.name, dauerMin: l.dauer_min, preis: l.preis })),
      preis: summePreis(leistungen.map((l) => l.preis)),
      status: 'gebucht',
    };
  });

  return termin;
}

function summePreis(preise) {
  return Math.round(preise.reduce((s, p) => s + p * 100, 0)) / 100;
}

/** Termin für die Stornoseite – nur Daten des eigenen Termins, ohne Kundendaten */
async function ladeTerminNachCode(code) {
  const [zeilen] = await pool.execute(
    `SELECT t.termin_id, t.beginn, t.ende, t.status, m.name AS mitarbeiter,
            l.name AS leistung, tl.dauer_min, tl.preis
       FROM termin t
       JOIN mitarbeiter m      ON m.mitarbeiter_id = t.mitarbeiter_id
       JOIN termin_leistung tl ON tl.termin_id = t.termin_id
       JOIN leistung l         ON l.leistung_id = tl.leistung_id
      WHERE t.storno_code = ?
      ORDER BY tl.position`,
    [code],
  );
  if (zeilen.length === 0) {
    throw fehler.nichtGefunden('Zu diesem Stornocode wurde kein Termin gefunden. Bitte prüfen Sie den Code.');
  }
  const t = zeilen[0];
  const pruefung = stornoPruefung(t);
  return {
    datum: t.beginn.slice(0, 10),
    beginn: t.beginn.slice(11, 16),
    ende: t.ende.slice(11, 16),
    mitarbeiter: t.mitarbeiter,
    leistungen: zeilen.map((z) => ({ name: z.leistung, dauerMin: z.dauer_min, preis: z.preis })),
    preis: summePreis(zeilen.map((z) => z.preis)),
    status: t.status,
    stornierbar: pruefung === null,
    hinweis: pruefung,
  };
}

/** null, wenn die Kundschaft selbst stornieren darf, sonst der Grund (R-10) */
function stornoPruefung(termin) {
  if (termin.status === 'storniert') return 'Dieser Termin ist bereits storniert.';
  if (termin.status !== 'gebucht') return 'Dieser Termin ist bereits abgeschlossen.';
  const minutenBisBeginn = zeit.stempelAusDatetime(termin.beginn) - zeit.jetzt().stempel;
  if (minutenBisBeginn < config.regeln.stornoFristStd * 60) {
    return `Eine Online-Stornierung ist nur bis ${config.regeln.stornoFristStd} Stunden vor dem Termin möglich. Bitte rufen Sie uns an.`;
  }
  return null;
}

/** Stornierung durch die Kundschaft per Code (F-08, R-10). Termin bleibt gespeichert (F-09). */
async function storniereNachCode(code) {
  await transaktion(async (conn) => {
    const [zeilen] = await conn.execute(
      'SELECT termin_id, beginn, status FROM termin WHERE storno_code = ? FOR UPDATE',
      [code],
    );
    if (zeilen.length === 0) {
      throw fehler.nichtGefunden('Zu diesem Stornocode wurde kein Termin gefunden. Bitte prüfen Sie den Code.');
    }
    const termin = zeilen[0];
    const grund = stornoPruefung(termin);
    if (grund) {
      if (termin.status !== 'gebucht') throw fehler.konflikt(grund, 'STATUS');
      throw fehler.regel(grund, 'STORNOFRIST');
    }
    await conn.execute(
      `UPDATE termin SET status = 'storniert', storniert_am = ?, storniert_von = 'kunde'
        WHERE termin_id = ?`,
      [zeit.alsDatetime(zeit.jetzt().stempel), termin.termin_id],
    );
  });
  return ladeTerminNachCode(code);
}

export { bucheTermin, ladeTerminNachCode, storniereNachCode, waehlePerson, summePreis };
