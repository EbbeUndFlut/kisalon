/*
 * Datum und Uhrzeit – durchgehendes Format:
 *   Datum      "YYYY-MM-DD"            (z. B. "2026-11-17")
 *   Uhrzeit    "HH:MM"                 (z. B. "09:15")
 *   DATETIME   "YYYY-MM-DD HH:MM:SS"   (lokale Salonzeit, wie in MySQL gespeichert)
 *
 * Gerechnet wird mit "Minuten seit 1970 in Salon-Wandzeit" (ohne Zeitzone).
 * Dadurch gibt es keine Verschiebungen durch die Zeitzone des Servers.
 * Hinweis: Bei der Zeitumstellung (So 2–3 Uhr) weicht eine Wandzeit-Differenz
 * um eine Stunde von der echten Dauer ab. Weil der Salon sonntags und
 * montags geschlossen ist, betrifft das keine der Fristen (2 h, 24 h).
 */

import config from '../config.js';

const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UHRZEIT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Prüft "YYYY-MM-DD" auf ein echtes Kalenderdatum. */
function istDatum(text) {
  if (typeof text !== 'string') return false;
  const m = DATUM_RE.exec(text);
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

function istUhrzeit(text) {
  return typeof text === 'string' && UHRZEIT_RE.test(text);
}

/** "HH:MM" oder "HH:MM:SS" → Minuten seit Mitternacht */
function zuMinuten(uhrzeit) {
  const [h, m] = uhrzeit.split(':').map(Number);
  return h * 60 + m;
}

/** Minuten seit Mitternacht → "HH:MM" */
function alsUhrzeit(minuten) {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Datum + Minuten des Tages → Zeitstempel in Minuten (Wandzeit) */
function stempel(datum, minuten = 0) {
  const [j, mo, t] = datum.split('-').map(Number);
  return Date.UTC(j, mo - 1, t) / 60000 + minuten;
}

/** "YYYY-MM-DD HH:MM:SS" → Zeitstempel in Minuten */
function stempelAusDatetime(datetime) {
  const [datum, uhrzeit] = datetime.split(' ');
  return stempel(datum, zuMinuten(uhrzeit));
}

/** Zeitstempel in Minuten → "YYYY-MM-DD HH:MM:SS" */
function alsDatetime(stempelMin) {
  const d = new Date(stempelMin * 60000);
  return `${alsDatumUtc(d)} ${alsUhrzeit(d.getUTCHours() * 60 + d.getUTCMinutes())}:00`;
}

function alsDatumUtc(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** ISO-Wochentag (1 = Montag … 7 = Sonntag) */
function wochentag(datum) {
  const [j, mo, t] = datum.split('-').map(Number);
  const tag = new Date(Date.UTC(j, mo - 1, t)).getUTCDay();
  return tag === 0 ? 7 : tag;
}

function plusTage(datum, tage) {
  const [j, mo, t] = datum.split('-').map(Number);
  return alsDatumUtc(new Date(Date.UTC(j, mo - 1, t + tage)));
}

/** Gleicher Kalendertag n Monate später, am Monatsende gekürzt (30.11. + 3 → 28.02.). */
function plusMonate(datum, monate) {
  const [j, mo, t] = datum.split('-').map(Number);
  const letzterTag = new Date(Date.UTC(j, mo - 1 + monate + 1, 0)).getUTCDate();
  return alsDatumUtc(new Date(Date.UTC(j, mo - 1 + monate, Math.min(t, letzterTag))));
}

/** Montag der Woche, in der datum liegt */
function wochenbeginn(datum) {
  return plusTage(datum, 1 - wochentag(datum));
}

/**
 * Aktuelle Salonzeit. In Tests kann die Zeit über JETZT_UEBERSCHREIBEN
 * ("YYYY-MM-DD HH:MM") fest eingestellt werden.
 */
function jetzt() {
  const fest = process.env.JETZT_UEBERSCHREIBEN;
  if (fest) {
    const [datum, uhrzeit] = fest.split(' ');
    return { datum, minuten: zuMinuten(uhrzeit), stempel: stempel(datum, zuMinuten(uhrzeit)) };
  }
  // sv-SE liefert das Format "2026-11-17 09:05:00"
  const text = new Intl.DateTimeFormat('sv-SE', {
    timeZone: config.zeitzone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  const [datum, uhrzeit] = text.split(' ');
  const minuten = zuMinuten(uhrzeit);
  return { datum, minuten, stempel: stempel(datum, minuten) };
}

export {
  istDatum, istUhrzeit, zuMinuten, alsUhrzeit, stempel, stempelAusDatetime,
  alsDatetime, wochentag, plusTage, plusMonate, wochenbeginn, jetzt,
};
