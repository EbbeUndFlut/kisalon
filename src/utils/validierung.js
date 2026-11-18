// Serverseitige Validierung aller Eingaben. Jede Funktion liefert den
// bereinigten Wert oder wirft einen 400-Fehler mit verständlicher Meldung.
import { fehler } from './fehler.js';
import * as zeit from './zeit.js';
import config from '../config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFON_RE = /^\+?[0-9 ()\/-]{6,30}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(wert, feld, { min = 1, max }) {
  if (typeof wert !== 'string') throw fehler.ungueltig(`${feld} fehlt.`);
  const t = wert.trim().replace(/\s+/g, ' ');
  if (t.length < min) throw fehler.ungueltig(`${feld} ist zu kurz (mindestens ${min} Zeichen).`);
  if (t.length > max) throw fehler.ungueltig(`${feld} ist zu lang (höchstens ${max} Zeichen).`);
  return t;
}

function name(wert) {
  return text(wert, 'Name', { min: 2, max: 100 });
}

function telefon(wert) {
  const t = text(wert, 'Telefonnummer', { min: 6, max: 30 });
  const ziffern = t.replace(/\D/g, '').length;
  if (!TELEFON_RE.test(t) || ziffern < 6) {
    throw fehler.ungueltig('Bitte eine gültige Telefonnummer angeben (nur Ziffern, Leerzeichen, +, -, /, Klammern).');
  }
  return t;
}

function email(wert) {
  const t = text(wert, 'E-Mail', { min: 3, max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(t)) throw fehler.ungueltig('Bitte eine gültige E-Mail-Adresse angeben.');
  return t;
}

function datum(wert, feld = 'Datum') {
  if (!zeit.istDatum(wert)) throw fehler.ungueltig(`${feld} muss im Format JJJJ-MM-TT angegeben werden.`);
  return wert;
}

function uhrzeit(wert) {
  if (!zeit.istUhrzeit(wert)) throw fehler.ungueltig('Uhrzeit muss im Format HH:MM angegeben werden.');
  if (zeit.zuMinuten(wert) % config.regeln.rasterMin !== 0) {
    throw fehler.ungueltig('Termine beginnen nur zur vollen Viertelstunde (z. B. 9:00, 9:15, 9:30).');
  }
  return wert;
}

/** Positive Ganzzahl (ID); akzeptiert Zahl oder Ziffern-String */
function id(wert, feld = 'ID') {
  const n = typeof wert === 'string' && /^\d+$/.test(wert) ? Number(wert) : wert;
  if (!Number.isSafeInteger(n) || n < 1) throw fehler.ungueltig(`${feld} ist ungültig.`);
  return n;
}

/** Liste von IDs, ohne Duplikate, Reihenfolge bleibt erhalten */
function idListe(wert, feld, { min = 1, max = 50 } = {}) {
  let liste = wert;
  if (typeof wert === 'string') liste = wert.split(',').filter((s) => s !== '');
  if (!Array.isArray(liste)) throw fehler.ungueltig(`${feld} fehlt.`);
  const ids = liste.map((x) => id(x, feld));
  if (new Set(ids).size !== ids.length) throw fehler.ungueltig(`${feld} enthält doppelte Einträge.`);
  if (ids.length < min) throw fehler.ungueltig(min === 1 ? `Bitte mindestens eine Auswahl bei ${feld} treffen.` : `${feld}: mindestens ${min} Einträge.`);
  if (ids.length > max) throw fehler.ungueltig(`${feld}: höchstens ${max} Einträge.`);
  return ids;
}

/** Leistungen für eine Buchung: 1 bis maxLeistungen IDs */
function leistungIds(wert) {
  return idListe(wert, 'Leistungen', { min: 1, max: config.regeln.maxLeistungen });
}

/** "egal" / leer → null, sonst Mitarbeiter-ID */
function mitarbeiterWahl(wert) {
  if (wert === undefined || wert === null || wert === '' || wert === 'egal') return null;
  return id(wert, 'Mitarbeiter');
}

function stornoCode(wert) {
  if (typeof wert !== 'string' || !UUID_RE.test(wert.trim())) {
    throw fehler.ungueltig('Der Stornocode ist ungültig. Er hat die Form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.');
  }
  return wert.trim().toLowerCase();
}

function preis(wert) {
  const n = typeof wert === 'string' ? Number(wert.replace(',', '.')) : wert;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 9999.99) {
    throw fehler.ungueltig('Preis muss eine Zahl zwischen 0 und 9999,99 sein.');
  }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    throw fehler.ungueltig('Preis darf höchstens zwei Nachkommastellen haben.');
  }
  return Math.round(n * 100) / 100;
}

function dauer(wert) {
  const n = typeof wert === 'string' && /^\d+$/.test(wert) ? Number(wert) : wert;
  if (!Number.isInteger(n) || n < 5 || n > 480) {
    throw fehler.ungueltig('Dauer muss eine ganze Zahl zwischen 5 und 480 Minuten sein.');
  }
  return n;
}

function wahrheitswert(wert, feld) {
  if (typeof wert !== 'boolean') throw fehler.ungueltig(`${feld} muss true oder false sein.`);
  return wert;
}

/** Wert muss in der erlaubten Liste stehen */
function auswahl(wert, erlaubt, feld) {
  if (!erlaubt.includes(wert)) throw fehler.ungueltig(`${feld} muss einer der Werte ${erlaubt.join(', ')} sein.`);
  return wert;
}

/** Stellt sicher, dass der Request-Body ein Objekt ist */
function body(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw fehler.ungueltig('Die Anfrage enthält keine gültigen JSON-Daten.');
  }
  return req.body;
}

export {
  text, name, telefon, email, datum, uhrzeit, id, idListe, leistungIds,
  mitarbeiterWahl, stornoCode, preis, dauer, wahrheitswert, auswahl, body,
};
