// Einfacher Passwortschutz für den Salon-Bereich (N-01).
// - Das Passwort steht nur als scrypt-Hash in .env (SALON_PASSWORT_HASH).
// - Nach dem Login gibt es eine zufällige Sitzungs-ID in einem HttpOnly-Cookie
//   (für JavaScript unsichtbar, SameSite=Strict gegen fremde Seiten).
// - Sitzungen liegen im Speicher: Nach einem Neustart muss man sich neu anmelden.
// - Nach 5 Fehlversuchen pro IP ist das Login 15 Minuten gesperrt.
import crypto from 'node:crypto';
import config from '../config.js';
import { fehler } from '../utils/fehler.js';

const COOKIE = 'salon_sitzung';
const sitzungen = new Map();      // id → ablauf (ms)
const fehlversuche = new Map();   // ip → { anzahl, bis }
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MS = 15 * 60 * 1000;

/** Prüft ein Passwort gegen "scrypt$<salt>$<hash>" in konstanter Zeit */
function passwortPasst(passwort, gespeichert) {
  const [verfahren, saltHex, hashHex] = String(gespeichert).split('$');
  if (verfahren !== 'scrypt' || !saltHex || !hashHex) {
    throw new Error('SALON_PASSWORT_HASH hat ein ungültiges Format. Neu erzeugen mit: npm run passwort-hash -- "<passwort>"');
  }
  const erwartet = Buffer.from(hashHex, 'hex');
  const berechnet = crypto.scryptSync(passwort, Buffer.from(saltHex, 'hex'), erwartet.length);
  return crypto.timingSafeEqual(berechnet, erwartet);
}

function leseCookie(req, name) {
  const kopf = req.headers.cookie;
  if (!kopf) return null;
  for (const teil of kopf.split(';')) {
    const [schluessel, ...wert] = teil.trim().split('=');
    if (schluessel === name) return decodeURIComponent(wert.join('='));
  }
  return null;
}

function cookieSetzen(res, wert, maxAlterSek, sicher) {
  const teile = [
    `${COOKIE}=${encodeURIComponent(wert)}`,
    'Path=/api/salon',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAlterSek}`,
  ];
  if (sicher) teile.push('Secure');
  res.setHeader('Set-Cookie', teile.join('; '));
}

function sitzungGueltig(id) {
  if (!id) return false;
  const ablauf = sitzungen.get(id);
  if (!ablauf) return false;
  if (ablauf < Date.now()) {
    sitzungen.delete(id);
    return false;
  }
  return true;
}

function pruefeSperre(ip) {
  const eintrag = fehlversuche.get(ip);
  if (eintrag && eintrag.bis > Date.now() && eintrag.anzahl >= MAX_FEHLVERSUCHE) {
    const minuten = Math.ceil((eintrag.bis - Date.now()) / 60000);
    throw fehler.zuVieleVersuche(`Zu viele Fehlversuche. Bitte in ${minuten} Minute(n) erneut versuchen.`);
  }
}

function merkeFehlversuch(ip) {
  const eintrag = fehlversuche.get(ip);
  if (!eintrag || eintrag.bis < Date.now()) {
    fehlversuche.set(ip, { anzahl: 1, bis: Date.now() + SPERRE_MS });
  } else {
    eintrag.anzahl += 1;
  }
}

/** Login: liefert true und setzt das Cookie, wirft 401/429 bei Fehler */
function anmelden(req, res, passwort) {
  const ip = req.ip;
  pruefeSperre(ip);
  if (typeof passwort !== 'string' || passwort.length === 0 || passwort.length > 200
      || !passwortPasst(passwort, config.salon.passwortHash)) {
    merkeFehlversuch(ip);
    throw fehler.nichtAngemeldet('Das Passwort ist falsch.');
  }
  fehlversuche.delete(ip);
  const id = crypto.randomBytes(32).toString('hex');
  const dauerSek = config.salon.sitzungStunden * 3600;
  sitzungen.set(id, Date.now() + dauerSek * 1000);
  cookieSetzen(res, id, dauerSek, req.secure);
}

function abmelden(req, res) {
  sitzungen.delete(leseCookie(req, COOKIE));
  cookieSetzen(res, '', 0, req.secure);
}

/** Middleware: lässt nur angemeldete Anfragen durch */
function nurSalon(req, res, next) {
  if (!sitzungGueltig(leseCookie(req, COOKIE))) {
    next(fehler.nichtAngemeldet());
    return;
  }
  next();
}

export { anmelden, abmelden, nurSalon, passwortPasst };
