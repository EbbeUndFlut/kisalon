// Lesende Abfragen auf Leistungen, Mitarbeiter und Öffnungszeiten,
// die von Verfügbarkeit, Buchung und Salon-Bereich gemeinsam genutzt werden.
import { pool } from '../db.js';
import { fehler } from '../utils/fehler.js';
import * as zeit from '../utils/zeit.js';

/** "?, ?, ?" für eine IN-Liste mit n Platzhaltern (Werte bleiben Parameter) */
function platzhalter(n) {
  return Array.from({ length: n }, () => '?').join(', ');
}

/**
 * Lädt die gewählten Leistungen in der gewünschten Reihenfolge.
 * Wirft 422, wenn eine Leistung nicht existiert oder nicht mehr angeboten wird.
 */
async function ladeBuchbareLeistungen(db, leistungIds) {
  const [zeilen] = await db.execute(
    `SELECT leistung_id, name, dauer_min, preis
       FROM leistung
      WHERE aktiv = TRUE AND leistung_id IN (${platzhalter(leistungIds.length)})`,
    leistungIds,
  );
  const nachId = new Map(zeilen.map((z) => [z.leistung_id, z]));
  const fehlend = leistungIds.filter((lid) => !nachId.has(lid));
  if (fehlend.length > 0) {
    throw fehler.regel('Mindestens eine gewählte Leistung wird nicht (mehr) angeboten. Bitte die Seite neu laden.', 'LEISTUNG_UNBEKANNT');
  }
  return leistungIds.map((lid) => nachId.get(lid));
}

/** Öffnungszeit für einen Tag in Minuten oder null, wenn geschlossen */
async function ladeOeffnungszeit(db, datum) {
  const [zeilen] = await db.execute(
    'SELECT oeffnet, schliesst FROM oeffnungszeit WHERE wochentag = ?',
    [zeit.wochentag(datum)],
  );
  if (zeilen.length === 0) return null;
  return { von: zeit.zuMinuten(zeilen[0].oeffnet), bis: zeit.zuMinuten(zeilen[0].schliesst) };
}

async function ladeAlleOeffnungszeiten() {
  const [zeilen] = await pool.execute(
    'SELECT wochentag, oeffnet, schliesst FROM oeffnungszeit ORDER BY wochentag',
  );
  return zeilen.map((z) => ({
    wochentag: z.wochentag,
    von: z.oeffnet.slice(0, 5),
    bis: z.schliesst.slice(0, 5),
  }));
}

/**
 * Aktive Mitarbeiter, die ALLE gewählten Leistungen anbieten und an diesem
 * Tag keinen freien Tag haben (R-08, W-03). Sortiert nach ID.
 */
async function ladeKandidaten(db, leistungIds, datum) {
  const [zeilen] = await db.execute(
    `SELECT m.mitarbeiter_id, m.name
       FROM mitarbeiter m
       JOIN mitarbeiter_leistung ml ON ml.mitarbeiter_id = m.mitarbeiter_id
      WHERE m.aktiv = TRUE
        AND ml.leistung_id IN (${platzhalter(leistungIds.length)})
        AND NOT EXISTS (SELECT 1 FROM freier_tag f
                         WHERE f.mitarbeiter_id = m.mitarbeiter_id AND f.datum = ?)
      GROUP BY m.mitarbeiter_id, m.name
     HAVING COUNT(*) = ?
      ORDER BY m.mitarbeiter_id`,
    [...leistungIds, datum, leistungIds.length],
  );
  return zeilen;
}

/**
 * Erklärt, warum eine gewünschte Person nicht in der Kandidatenliste steht.
 * Liefert { freierTag: boolean, meldung }.
 */
async function grundNichtVerfuegbar(db, mitarbeiterId, leistungIds, datum) {
  const [personen] = await db.execute(
    'SELECT name, aktiv FROM mitarbeiter WHERE mitarbeiter_id = ?',
    [mitarbeiterId],
  );
  if (personen.length === 0 || !personen[0].aktiv) {
    return { freierTag: false, meldung: 'Die gewählte Person ist nicht buchbar.' };
  }
  const name = personen[0].name;
  const [kann] = await db.execute(
    `SELECT COUNT(*) AS anzahl FROM mitarbeiter_leistung
      WHERE mitarbeiter_id = ? AND leistung_id IN (${platzhalter(leistungIds.length)})`,
    [mitarbeiterId, ...leistungIds],
  );
  if (kann[0].anzahl < leistungIds.length) {
    return {
      freierTag: false,
      meldung: `${name} bietet ${leistungIds.length > 1 ? 'nicht alle gewählten Leistungen' : 'diese Leistung'} nicht an. Bitte eine andere Person oder „egal“ wählen.`,
    };
  }
  return { freierTag: true, meldung: `${name} hat an diesem Tag frei. Bitte einen anderen Tag, eine andere Person oder „egal“ wählen.` };
}

/** Öffentliche Mitarbeiterliste: nur Name und angebotene Leistungen */
async function ladeMitarbeiterOeffentlich() {
  const [zeilen] = await pool.execute(
    `SELECT m.mitarbeiter_id, m.name, ml.leistung_id
       FROM mitarbeiter m
       LEFT JOIN mitarbeiter_leistung ml ON ml.mitarbeiter_id = m.mitarbeiter_id
      WHERE m.aktiv = TRUE
      ORDER BY m.mitarbeiter_id, ml.leistung_id`,
  );
  const liste = new Map();
  for (const z of zeilen) {
    if (!liste.has(z.mitarbeiter_id)) {
      liste.set(z.mitarbeiter_id, { id: z.mitarbeiter_id, name: z.name, leistungIds: [] });
    }
    if (z.leistung_id !== null) liste.get(z.mitarbeiter_id).leistungIds.push(z.leistung_id);
  }
  return [...liste.values()];
}

async function ladeLeistungenOeffentlich() {
  const [zeilen] = await pool.execute(
    `SELECT leistung_id AS id, name, dauer_min AS dauerMin, preis
       FROM leistung WHERE aktiv = TRUE ORDER BY leistung_id`,
  );
  return zeilen;
}

export {
  platzhalter, ladeBuchbareLeistungen, ladeOeffnungszeit, ladeAlleOeffnungszeiten,
  ladeKandidaten, grundNichtVerfuegbar, ladeMitarbeiterOeffentlich, ladeLeistungenOeffentlich,
};
