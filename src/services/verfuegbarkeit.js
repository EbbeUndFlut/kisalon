// Berechnet freie Uhrzeiten im Backend (F-02, N-02). Das Frontend erhält nur
// eine Liste von Uhrzeiten, keine Termine und keine Kundendaten.
import { pool } from '../db.js';
import config from '../config.js';
import * as zeit from '../utils/zeit.js';
import * as regeln from './regeln.js';
import * as stammdaten from './stammdaten.js';
import { fehler } from '../utils/fehler.js';

/**
 * Belegte Zeiträume (nicht stornierte Termine) der Personen an einem Tag.
 * Liefert Map mitarbeiterId → [{ beginn, ende }] (Minuten-Stempel).
 */
async function ladeBelegungen(db, mitarbeiterIds, datum) {
  const belegungen = new Map(mitarbeiterIds.map((mid) => [mid, []]));
  if (mitarbeiterIds.length === 0) return belegungen;
  const tagBeginn = `${datum} 00:00:00`;
  const tagEnde = `${zeit.plusTage(datum, 1)} 00:00:00`;
  const [zeilen] = await db.execute(
    `SELECT mitarbeiter_id, beginn, ende
       FROM termin
      WHERE mitarbeiter_id IN (${stammdaten.platzhalter(mitarbeiterIds.length)})
        AND status <> 'storniert'
        AND beginn < ? AND ende > ?
      ORDER BY beginn`,
    [...mitarbeiterIds, tagEnde, tagBeginn],
  );
  for (const z of zeilen) {
    belegungen.get(z.mitarbeiter_id).push({
      beginn: zeit.stempelAusDatetime(z.beginn),
      ende: zeit.stempelAusDatetime(z.ende),
    });
  }
  return belegungen;
}

/**
 * Freie Startzeiten für Leistungen, Person (oder null = egal) und Datum.
 * Liefert { datum, dauerMin, zeiten: ["09:00", …], hinweis }.
 */
async function freieZeiten({ datum, leistungIds, mitarbeiterId }) {
  const jetzt = zeit.jetzt();
  const leistungen = await stammdaten.ladeBuchbareLeistungen(pool, leistungIds);
  const dauerMin = leistungen.reduce((summe, l) => summe + l.dauer_min, 0);
  const oeffnung = await stammdaten.ladeOeffnungszeit(pool, datum);
  const antwort = { datum, dauerMin, zeiten: [], hinweis: null };

  const tagProblem = regeln.tagVerstoss(datum, oeffnung, jetzt);
  if (tagProblem) {
    antwort.hinweis = tagProblem;
    return antwort;
  }

  let kandidaten = await stammdaten.ladeKandidaten(pool, leistungIds, datum);
  if (mitarbeiterId !== null) {
    if (!kandidaten.some((k) => k.mitarbeiter_id === mitarbeiterId)) {
      const grund = await stammdaten.grundNichtVerfuegbar(pool, mitarbeiterId, leistungIds, datum);
      if (!grund.freierTag) throw fehler.regel(grund.meldung, 'PERSON_NICHT_MOEGLICH');
      antwort.hinweis = grund.meldung;
      return antwort;
    }
    kandidaten = kandidaten.filter((k) => k.mitarbeiter_id === mitarbeiterId);
  }
  if (kandidaten.length === 0) {
    antwort.hinweis = 'An diesem Tag ist niemand für diese Leistung im Salon. Bitte einen anderen Tag wählen.';
    return antwort;
  }

  const belegungen = await ladeBelegungen(pool, kandidaten.map((k) => k.mitarbeiter_id), datum);
  for (let start = oeffnung.von; start + dauerMin <= oeffnung.bis; start += config.regeln.rasterMin) {
    if (regeln.zeitVerstoss(datum, start, dauerMin, oeffnung, jetzt)) continue;
    const beginn = zeit.stempel(datum, start);
    const ende = beginn + dauerMin;
    const jemandFrei = kandidaten.some((k) => regeln.istFrei(belegungen.get(k.mitarbeiter_id), beginn, ende));
    if (jemandFrei) antwort.zeiten.push(zeit.alsUhrzeit(start));
  }
  if (antwort.zeiten.length === 0) {
    antwort.hinweis = 'An diesem Tag ist leider keine passende Zeit mehr frei. Bitte einen anderen Tag wählen.';
  }
  return antwort;
}

export { freieZeiten, ladeBelegungen };
