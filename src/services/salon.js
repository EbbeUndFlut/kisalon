// Abfragen und Änderungen für den geschützten Salon-Bereich.
import { pool, transaktion } from '../db.js';
import * as zeit from '../utils/zeit.js';
import { fehler } from '../utils/fehler.js';
import { platzhalter } from './stammdaten.js';

// ---------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------

/** Termine im Zeitraum [von, bis] (Datum inklusive) mit Kundendaten (F-12) */
async function ladeTermine(von, bis) {
  const [zeilen] = await pool.execute(
    `SELECT t.termin_id, t.beginn, t.ende, t.status, t.storniert_am, t.storniert_von,
            m.mitarbeiter_id, m.name AS mitarbeiter,
            k.name AS kunde, k.telefon, k.email,
            GROUP_CONCAT(l.name ORDER BY tl.position SEPARATOR ' + ') AS leistungen,
            SUM(tl.preis) AS preis
       FROM termin t
       JOIN mitarbeiter m      ON m.mitarbeiter_id = t.mitarbeiter_id
       JOIN kunde k            ON k.kunde_id = t.kunde_id
       JOIN termin_leistung tl ON tl.termin_id = t.termin_id
       JOIN leistung l         ON l.leistung_id = tl.leistung_id
      WHERE t.beginn >= ? AND t.beginn < ?
      GROUP BY t.termin_id
      ORDER BY t.beginn, m.mitarbeiter_id`,
    [`${von} 00:00:00`, `${zeit.plusTage(bis, 1)} 00:00:00`],
  );
  return zeilen.map((z) => ({
    id: z.termin_id,
    datum: z.beginn.slice(0, 10),
    beginn: z.beginn.slice(11, 16),
    ende: z.ende.slice(11, 16),
    status: z.status,
    storniertAm: z.storniert_am,
    storniertVon: z.storniert_von,
    mitarbeiterId: z.mitarbeiter_id,
    mitarbeiter: z.mitarbeiter,
    kunde: z.kunde,
    telefon: z.telefon,
    email: z.email,
    leistungen: z.leistungen,
    preis: Number(z.preis),
  }));
}

/** Alle Mitarbeiter (auch inaktive mit Terminen) und freie Tage im Zeitraum */
async function ladeMitarbeiter() {
  const [zeilen] = await pool.execute(
    `SELECT m.mitarbeiter_id AS id, m.name, m.aktiv,
            GROUP_CONCAT(ml.leistung_id ORDER BY ml.leistung_id) AS leistung_ids
       FROM mitarbeiter m
       LEFT JOIN mitarbeiter_leistung ml ON ml.mitarbeiter_id = m.mitarbeiter_id
      GROUP BY m.mitarbeiter_id, m.name, m.aktiv
      ORDER BY m.mitarbeiter_id`,
  );
  return zeilen.map((z) => ({
    id: z.id,
    name: z.name,
    aktiv: Boolean(z.aktiv),
    leistungIds: z.leistung_ids ? z.leistung_ids.split(',').map(Number) : [],
  }));
}

/*
 * Erlaubte Statuswechsel im Salon:
 *   gebucht          → erledigt, nicht_erschienen, storniert
 *   erledigt         → gebucht (Fehlklick), nicht_erschienen
 *   nicht_erschienen → gebucht (Fehlklick), erledigt
 *   storniert        → (endgültig, der Platz kann neu vergeben sein)
 */
const UEBERGAENGE = {
  gebucht: ['erledigt', 'nicht_erschienen', 'storniert'],
  erledigt: ['gebucht', 'nicht_erschienen'],
  nicht_erschienen: ['gebucht', 'erledigt'],
  storniert: [],
};

const STATUS_TEXT = {
  gebucht: 'gebucht',
  erledigt: 'erledigt',
  nicht_erschienen: 'nicht erschienen',
  storniert: 'storniert',
};

async function setzeStatus(terminId, neuerStatus) {
  await transaktion(async (conn) => {
    const [zeilen] = await conn.execute(
      'SELECT termin_id, beginn, status FROM termin WHERE termin_id = ? FOR UPDATE',
      [terminId],
    );
    if (zeilen.length === 0) throw fehler.nichtGefunden('Termin nicht gefunden.');
    const termin = zeilen[0];
    if (termin.status === neuerStatus) return;
    if (!UEBERGAENGE[termin.status].includes(neuerStatus)) {
      throw fehler.konflikt(
        termin.status === 'storniert'
          ? 'Ein stornierter Termin kann nicht wieder aktiviert werden. Bitte einen neuen Termin anlegen.'
          : `Der Status kann nicht von „${STATUS_TEXT[termin.status]}“ auf „${STATUS_TEXT[neuerStatus]}“ geändert werden.`,
        'STATUS',
      );
    }
    const jetzt = zeit.jetzt();
    if ((neuerStatus === 'erledigt' || neuerStatus === 'nicht_erschienen') && termin.beginn.slice(0, 10) > jetzt.datum) {
      throw fehler.regel('Ein Termin in der Zukunft kann noch nicht als erledigt oder nicht erschienen markiert werden.');
    }
    if (neuerStatus === 'storniert') {
      await conn.execute(
        `UPDATE termin SET status = 'storniert', storniert_am = ?, storniert_von = 'salon'
          WHERE termin_id = ?`,
        [zeit.alsDatetime(jetzt.stempel), terminId],
      );
    } else {
      await conn.execute('UPDATE termin SET status = ? WHERE termin_id = ?', [neuerStatus, terminId]);
    }
  });
}

// ---------------------------------------------------------------------
// Leistungen (F-14, F-15)
// ---------------------------------------------------------------------

async function ladeLeistungen() {
  const [zeilen] = await pool.execute(
    `SELECT l.leistung_id AS id, l.name, l.dauer_min AS dauerMin, l.preis, l.aktiv,
            GROUP_CONCAT(ml.mitarbeiter_id ORDER BY ml.mitarbeiter_id) AS mitarbeiter_ids,
            (SELECT COUNT(*) FROM termin_leistung tl WHERE tl.leistung_id = l.leistung_id) AS gebucht
       FROM leistung l
       LEFT JOIN mitarbeiter_leistung ml ON ml.leistung_id = l.leistung_id
      GROUP BY l.leistung_id
      ORDER BY l.aktiv DESC, l.leistung_id`,
  );
  return zeilen.map((z) => ({
    id: z.id,
    name: z.name,
    dauerMin: z.dauerMin,
    preis: z.preis,
    aktiv: Boolean(z.aktiv),
    mitarbeiterIds: z.mitarbeiter_ids ? z.mitarbeiter_ids.split(',').map(Number) : [],
    anzahlGebucht: Number(z.gebucht),
  }));
}

async function pruefeMitarbeiterIds(conn, ids) {
  if (ids.length === 0) return;
  const [zeilen] = await conn.execute(
    `SELECT COUNT(*) AS anzahl FROM mitarbeiter WHERE mitarbeiter_id IN (${platzhalter(ids.length)})`,
    ids,
  );
  if (zeilen[0].anzahl !== ids.length) throw fehler.ungueltig('Mindestens eine gewählte Person existiert nicht.');
}

async function speichereZuordnung(conn, leistungId, mitarbeiterIds) {
  await conn.execute('DELETE FROM mitarbeiter_leistung WHERE leistung_id = ?', [leistungId]);
  for (const mid of mitarbeiterIds) {
    await conn.execute(
      'INSERT INTO mitarbeiter_leistung (mitarbeiter_id, leistung_id) VALUES (?, ?)',
      [mid, leistungId],
    );
  }
}

function alsDoppelterName(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return fehler.konflikt('Eine Leistung mit diesem Namen gibt es bereits.', 'NAME_VERGEBEN');
  }
  return err;
}

async function legeLeistungAn({ name, dauerMin, preis, aktiv, mitarbeiterIds }) {
  try {
    return await transaktion(async (conn) => {
      await pruefeMitarbeiterIds(conn, mitarbeiterIds);
      const [neu] = await conn.execute(
        'INSERT INTO leistung (name, dauer_min, preis, aktiv) VALUES (?, ?, ?, ?)',
        [name, dauerMin, preis, aktiv],
      );
      await speichereZuordnung(conn, neu.insertId, mitarbeiterIds);
      return neu.insertId;
    });
  } catch (err) {
    throw alsDoppelterName(err);
  }
}

/**
 * Ändert eine Leistung. Bereits gebuchte Termine behalten Preis und Dauer
 * zum Buchungszeitpunkt (gespeichert in termin_leistung).
 */
async function aendereLeistung(id, { name, dauerMin, preis, aktiv, mitarbeiterIds }) {
  try {
    await transaktion(async (conn) => {
      const [vorhanden] = await conn.execute(
        'SELECT leistung_id FROM leistung WHERE leistung_id = ? FOR UPDATE',
        [id],
      );
      if (vorhanden.length === 0) throw fehler.nichtGefunden('Leistung nicht gefunden.');
      await pruefeMitarbeiterIds(conn, mitarbeiterIds);
      await conn.execute(
        'UPDATE leistung SET name = ?, dauer_min = ?, preis = ?, aktiv = ? WHERE leistung_id = ?',
        [name, dauerMin, preis, aktiv, id],
      );
      await speichereZuordnung(conn, id, mitarbeiterIds);
    });
  } catch (err) {
    throw alsDoppelterName(err);
  }
}

// ---------------------------------------------------------------------
// Freie Tage (W-03)
// ---------------------------------------------------------------------

async function ladeFreieTage(von, bis) {
  const [zeilen] = await pool.execute(
    `SELECT f.freier_tag_id AS id, f.mitarbeiter_id AS mitarbeiterId, m.name AS mitarbeiter,
            f.datum, f.grund
       FROM freier_tag f
       JOIN mitarbeiter m ON m.mitarbeiter_id = f.mitarbeiter_id
      WHERE f.datum BETWEEN ? AND ?
      ORDER BY f.datum, m.name`,
    [von, bis],
  );
  return zeilen;
}

async function legeFreienTagAn({ mitarbeiterId, datum, grund }) {
  return transaktion(async (conn) => {
    const [person] = await conn.execute(
      'SELECT name FROM mitarbeiter WHERE mitarbeiter_id = ? FOR UPDATE',
      [mitarbeiterId],
    );
    if (person.length === 0) throw fehler.ungueltig('Diese Person existiert nicht.');
    const [termine] = await conn.execute(
      `SELECT COUNT(*) AS anzahl FROM termin
        WHERE mitarbeiter_id = ? AND status = 'gebucht' AND beginn >= ? AND beginn < ?`,
      [mitarbeiterId, `${datum} 00:00:00`, `${zeit.plusTage(datum, 1)} 00:00:00`],
    );
    if (termine[0].anzahl > 0) {
      throw fehler.konflikt(
        `${person[0].name} hat an diesem Tag noch ${termine[0].anzahl} gebuchte(n) Termin(e). Bitte diese zuerst stornieren oder umbuchen.`,
        'TERMINE_VORHANDEN',
      );
    }
    try {
      const [neu] = await conn.execute(
        'INSERT INTO freier_tag (mitarbeiter_id, datum, grund) VALUES (?, ?, ?)',
        [mitarbeiterId, datum, grund],
      );
      return neu.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw fehler.konflikt(`${person[0].name} hat an diesem Tag bereits frei.`, 'DOPPELT');
      throw err;
    }
  });
}

async function loescheFreienTag(id) {
  const [ergebnis] = await pool.execute('DELETE FROM freier_tag WHERE freier_tag_id = ?', [id]);
  if (ergebnis.affectedRows === 0) throw fehler.nichtGefunden('Freier Tag nicht gefunden.');
}

// ---------------------------------------------------------------------
// Auswertung (Bonus): Termine pro Woche, Umsatz je Leistung
// ---------------------------------------------------------------------

async function auswertung(von, bis) {
  const grenzen = [`${von} 00:00:00`, `${zeit.plusTage(bis, 1)} 00:00:00`];

  // Kalenderwoche nach ISO (Modus 3), Wochenbeginn Montag
  const [wochen] = await pool.execute(
    `SELECT YEARWEEK(t.beginn, 3) AS jahr_woche,
            DATE_FORMAT(MIN(DATE(t.beginn) - INTERVAL WEEKDAY(t.beginn) DAY), '%Y-%m-%d') AS montag,
            COUNT(*) AS gesamt,
            SUM(t.status = 'erledigt') AS erledigt,
            SUM(t.status = 'nicht_erschienen') AS nicht_erschienen,
            SUM(t.status = 'storniert') AS storniert,
            SUM(t.status = 'gebucht') AS offen
       FROM termin t
      WHERE t.beginn >= ? AND t.beginn < ?
      GROUP BY jahr_woche
      ORDER BY jahr_woche`,
    grenzen,
  );

  // Umsatz nur aus erledigten Terminen, mit dem Preis zum Buchungszeitpunkt
  const [umsatz] = await pool.execute(
    `SELECT l.leistung_id AS id, l.name, COUNT(*) AS anzahl, SUM(tl.preis) AS umsatz
       FROM termin_leistung tl
       JOIN termin t   ON t.termin_id = tl.termin_id
       JOIN leistung l ON l.leistung_id = tl.leistung_id
      WHERE t.status = 'erledigt' AND t.beginn >= ? AND t.beginn < ?
      GROUP BY l.leistung_id, l.name
      ORDER BY umsatz DESC, l.name`,
    grenzen,
  );

  return {
    von,
    bis,
    wochen: wochen.map((w) => ({
      kw: Number(String(w.jahr_woche).slice(4)),
      montag: w.montag,
      gesamt: Number(w.gesamt),
      erledigt: Number(w.erledigt),
      nichtErschienen: Number(w.nicht_erschienen),
      storniert: Number(w.storniert),
      offen: Number(w.offen),
    })),
    umsatzJeLeistung: umsatz.map((u) => ({
      id: u.id, name: u.name, anzahl: Number(u.anzahl), umsatz: Number(u.umsatz),
    })),
    umsatzGesamt: umsatz.reduce((s, u) => s + Number(u.umsatz), 0),
  };
}

export {
  ladeTermine, ladeMitarbeiter, setzeStatus, ladeLeistungen, legeLeistungAn, aendereLeistung,
  ladeFreieTage, legeFreienTagAn, loescheFreienTag, auswertung,
};
