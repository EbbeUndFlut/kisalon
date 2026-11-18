// Integrationstests der REST-API gegen eine eigene Test-Datenbank.
// - legt "schnittpunkt_test" aus db/schema.sql an (die Entwicklungsdatenbank bleibt unberührt)
// - startet den Server auf Port 3999 mit fest eingestellter Uhrzeit:
//   "jetzt" = Montag 10:00 vor dem ersten Beispieltag (Dienstag, @tag1)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import config from '../src/config.js';
import * as zeit from '../src/utils/zeit.js';

const TEST_DB = 'schnittpunkt_test';
const PORT = 3999;
const BASIS = `http://localhost:${PORT}/api`;
const PASSWORT = process.env.TEST_SALON_PASSWORT || 'schnittpunkt-salon';

// Gleiche Rechnung wie im SQL-Skript: nächster Dienstag (oder heute, falls Dienstag)
const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: config.zeitzone }).format(new Date());
const TAG1 = zeit.plusTage(heute, (2 - zeit.wochentag(heute) + 7) % 7);
const TAG2 = zeit.plusTage(TAG1, 1);
const MONTAG = zeit.plusTage(TAG1, -1);
const FREITAG = zeit.plusTage(TAG1, 3);

let server;
let db;

async function warteAufServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASIS}/leistungen`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Testserver startet nicht');
}

before(async () => {
  const skript = (await fs.readFile(path.join(import.meta.dirname, '..', 'db', 'schema.sql'), 'utf8'))
    .replace('DROP DATABASE IF EXISTS schnittpunkt;', `DROP DATABASE IF EXISTS ${TEST_DB};`)
    .replace('CREATE DATABASE schnittpunkt', `CREATE DATABASE ${TEST_DB}`)
    .replace('USE schnittpunkt;', `USE ${TEST_DB};`);
  const verbindung = await mysql.createConnection({ ...config.db, database: undefined, multipleStatements: true });
  await verbindung.query(skript);
  await verbindung.end();
  db = await mysql.createConnection({ ...config.db, database: TEST_DB, dateStrings: true });

  server = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_NAME: TEST_DB, JETZT_UEBERSCHREIBEN: `${MONTAG} 10:00` },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await warteAufServer();
});

after(async () => {
  server?.kill();
  await db?.end();
});

async function api(methode, pfad, daten, cookie) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: daten === undefined ? undefined : JSON.stringify(daten),
  });
  const text = await antwort.text();
  return { status: antwort.status, daten: text ? JSON.parse(text) : null, kopf: antwort.headers };
}

const kunde = (nr) => ({ name: `Test Person ${nr}`, telefon: '0151 1234567', email: `test${nr}@example.org` });
const buche = (eingabe) => api('POST', '/termine', eingabe);

async function salonCookie() {
  const r = await api('POST', '/salon/login', { passwort: PASSWORT });
  assert.equal(r.status, 204, 'Login mit Demo-Passwort fehlgeschlagen (TEST_SALON_PASSWORT setzen?)');
  return r.kopf.get('set-cookie').split(';')[0];
}

// ---------------------------------------------------------------------

test('Leistungen und Mitarbeiter sind öffentlich abrufbar', async () => {
  const leistungen = await api('GET', '/leistungen');
  assert.equal(leistungen.status, 200);
  assert.equal(leistungen.daten.length, 6);
  const mitarbeiter = await api('GET', '/mitarbeiter');
  assert.deepEqual(mitarbeiter.daten.find((m) => m.name === 'Jonas').leistungIds, [1, 3, 4, 5]);
});

test('F-02/N-02: freie Zeiten sind nur Uhrzeiten, ohne Kundendaten', async () => {
  const r = await api('GET', `/verfuegbarkeit?datum=${TAG1}&leistungen=6&mitarbeiter=egal`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.daten).sort(), ['datum', 'dauerMin', 'hinweis', 'zeiten']);
  assert.ok(r.daten.zeiten.every((z) => /^\d{2}:\d{2}$/.test(z)));
  // Sabine 09:30–10:15 und Mara 09:00–12:00 belegt → Färben frühestens 10:15 (Sabine)
  assert.equal(r.daten.zeiten[0], '10:15');
  assert.equal(r.daten.zeiten.at(-1), '16:30');           // R-05: letzte Färbung
  assert.ok(!r.daten.zeiten.includes('12:45'));           // Mara ab 14:00, Sabine ab 13:00 belegt
  assert.ok(!JSON.stringify(r.daten).includes('Berger'));
});

test('R-08: Färben bei Jonas ist nicht buchbar (422)', async () => {
  const frei = await api('GET', `/verfuegbarkeit?datum=${TAG1}&leistungen=6&mitarbeiter=3`);
  assert.equal(frei.status, 422);
  const r = await buche({ leistungIds: [6], mitarbeiterId: 3, datum: TAG2, uhrzeit: '12:00', ...kunde(1) });
  assert.equal(r.status, 422);
  assert.match(r.daten.fehler, /Jonas bietet/);
});

test('R-04: Montag geschlossen', async () => {
  const r = await api('GET', `/verfuegbarkeit?datum=${zeit.plusTage(MONTAG, 7)}&leistungen=1`);
  assert.deepEqual(r.daten.zeiten, []);
  assert.match(r.daten.hinweis, /geschlossen/);
  const b = await buche({ leistungIds: [1], datum: zeit.plusTage(MONTAG, 7), uhrzeit: '10:00', ...kunde(1) });
  assert.equal(b.status, 422);
});

test('Validierung: ungültige Eingaben → 400 mit Meldung', async () => {
  const faelle = [
    { leistungIds: [1], datum: TAG2, uhrzeit: '10:10', ...kunde(1) },
    { leistungIds: [1], datum: '2026-02-30', uhrzeit: '10:00', ...kunde(1) },
    { leistungIds: [1], datum: TAG2, uhrzeit: '10:00', ...kunde(1), email: 'kein-mail' },
    { leistungIds: [], datum: TAG2, uhrzeit: '10:00', ...kunde(1) },
    { leistungIds: ['1; DROP TABLE termin'], datum: TAG2, uhrzeit: '10:00', ...kunde(1) },
  ];
  for (const fall of faelle) {
    const r = await buche(fall);
    assert.equal(r.status, 400, JSON.stringify(fall));
    assert.equal(typeof r.daten.fehler, 'string');
  }
  const kaputt = await fetch(`${BASIS}/termine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{kaputt' });
  assert.equal(kaputt.status, 400);
});

test('Buchung erfolgreich: 201, Stornocode, Zeit danach nicht mehr frei', async () => {
  const r = await buche({ leistungIds: [1, 5], mitarbeiterId: 3, datum: FREITAG, uhrzeit: '11:00', ...kunde(2) });
  assert.equal(r.status, 201);
  assert.match(r.daten.stornoCode, /^[0-9a-f-]{36}$/);
  assert.equal(r.daten.ende, '11:45');                    // R-02: Dauer = 30 + 15
  assert.equal(r.daten.preis, 40);
  assert.equal(r.daten.mitarbeiter, 'Jonas');
  const frei = await api('GET', `/verfuegbarkeit?datum=${FREITAG}&leistungen=1&mitarbeiter=3`);
  for (const belegt of ['10:45', '11:00', '11:15', '11:30']) assert.ok(!frei.daten.zeiten.includes(belegt), belegt);
  assert.ok(frei.daten.zeiten.includes('10:30') && frei.daten.zeiten.includes('11:45'));
});

test('R-01: Doppelbuchung wird abgelehnt (409)', async () => {
  const eingabe = { leistungIds: [2], mitarbeiterId: 1, datum: FREITAG, uhrzeit: '14:00' };
  assert.equal((await buche({ ...eingabe, ...kunde(3) })).status, 201);
  const zweite = await buche({ ...eingabe, uhrzeit: '14:30', ...kunde(4) });     // überschneidet 14:00–14:45
  assert.equal(zweite.status, 409);
  assert.equal(zweite.daten.code, 'ZEIT_BELEGT');
  assert.equal((await buche({ ...eingabe, uhrzeit: '14:45', ...kunde(4) })).status, 201); // direkt danach ok
});

test('R-02: parallele Buchungen für denselben Platz – genau eine gewinnt', async () => {
  const anfragen = Array.from({ length: 12 }, (_, i) =>
    buche({ leistungIds: [1], mitarbeiterId: 2, datum: FREITAG, uhrzeit: '16:00', ...kunde(100 + i) }));
  const status = (await Promise.all(anfragen)).map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, status.join(','));
  assert.equal(status.filter((s) => s === 409).length, 11, status.join(','));
});

test('F-04: „egal“ verteilt parallele Buchungen auf alle passenden Personen', async () => {
  const anfragen = Array.from({ length: 5 }, (_, i) =>
    buche({ leistungIds: [4], datum: zeit.plusTage(FREITAG, 1), uhrzeit: '09:00', ...kunde(200 + i) }));
  const ergebnisse = await Promise.all(anfragen);
  const personen = ergebnisse.filter((r) => r.status === 201).map((r) => r.daten.mitarbeiter).sort();
  assert.deepEqual(personen, ['Jonas', 'Mara', 'Sabine']);  // Kinderschnitt können alle drei
  assert.equal(ergebnisse.filter((r) => r.status === 409).length, 2);
});

test('F-06: gleiche E-Mail → derselbe Kunde, Daten werden aktualisiert', async () => {
  const a = await buche({ leistungIds: [3], datum: TAG2, uhrzeit: '15:00', name: 'Maxi Muster', telefon: '0151 111111', email: 'maxi@example.org' });
  const b = await buche({ leistungIds: [3], datum: TAG2, uhrzeit: '16:00', name: 'Maxi Muster', telefon: '0151 222222', email: 'MAXI@example.org' });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const [zeilen] = await db.execute('SELECT kunde_id, telefon FROM kunde WHERE email = ?', ['maxi@example.org']);
  assert.equal(zeilen.length, 1);
  assert.equal(zeilen[0].telefon, '0151 222222');
  const [termine] = await db.execute('SELECT COUNT(*) AS n FROM termin WHERE kunde_id = ?', [zeilen[0].kunde_id]);
  assert.equal(termine[0].n, 2);
});

test('F-08/R-10: Storno per Code, nur bis 24 h vorher, Termin bleibt gespeichert', async () => {
  const termin = (await buche({ leistungIds: [1], datum: TAG2, uhrzeit: '17:00', ...kunde(5) })).daten;
  const anzeigen = await api('GET', `/termine/code/${termin.stornoCode}`);
  assert.equal(anzeigen.daten.stornierbar, true);
  assert.equal(anzeigen.daten.name, undefined);            // keine Kundendaten
  const storno = await api('POST', `/termine/code/${termin.stornoCode}/stornierung`);
  assert.equal(storno.status, 200);
  assert.equal(storno.daten.status, 'storniert');
  assert.equal((await api('POST', `/termine/code/${termin.stornoCode}/stornierung`)).status, 409);

  const [zeilen] = await db.execute('SELECT status, storniert_von FROM termin WHERE storno_code = ?', [termin.stornoCode]);
  assert.deepEqual(zeilen[0], { status: 'storniert', storniert_von: 'kunde' });

  // Platz ist wieder frei
  const frei = await api('GET', `/verfuegbarkeit?datum=${TAG2}&leistungen=1&mitarbeiter=egal`);
  assert.ok(frei.daten.zeiten.includes('17:00'));

  // Demo-Termin beginnt morgen 09:00, jetzt ist 10:00 → 23 h → zu spät
  const spaet = await api('POST', '/termine/code/00000000-0000-4000-8000-000000000001/stornierung');
  assert.equal(spaet.status, 422);
  assert.equal(spaet.daten.code, 'STORNOFRIST');

  assert.equal((await api('GET', '/termine/code/00000000-0000-4000-8000-00000000ffff')).status, 404);
  assert.equal((await api('GET', '/termine/code/kein-code')).status, 400);
});

test('N-01: Salon-Bereich nur mit Passwort', async () => {
  assert.equal((await api('GET', `/salon/termine?datum=${TAG1}`)).status, 401);
  assert.equal((await api('POST', '/salon/login', { passwort: 'falsch' })).status, 401);
  const cookie = await salonCookie();
  const r = await api('GET', `/salon/termine?datum=${TAG1}`, undefined, cookie);
  assert.equal(r.status, 200);
  const berger = r.daten.termine.find((t) => t.kunde === 'Katrin Berger');
  assert.equal(berger.telefon, '0151 234 5555');
  assert.equal(berger.mitarbeiter, 'Mara');
  assert.equal(berger.leistungen, 'Färben');
  // nach Beginn sortiert
  const zeiten = r.daten.termine.map((t) => t.beginn);
  assert.deepEqual(zeiten, [...zeiten].sort());
  assert.equal((await api('POST', '/salon/logout', undefined, cookie)).status, 204);
  assert.equal((await api('GET', `/salon/termine?datum=${TAG1}`, undefined, cookie)).status, 401);
});

test('F-10/F-11: Salon storniert jederzeit, erledigt erst ab Termintag', async () => {
  const cookie = await salonCookie();
  // Termin 8 (Demo, morgen 09:00) – Kundschaft darf nicht mehr, Salon schon
  assert.equal((await api('PATCH', '/salon/termine/8', { status: 'erledigt' }, cookie)).status, 422);
  assert.equal((await api('PATCH', '/salon/termine/8', { status: 'storniert' }, cookie)).status, 204);
  assert.equal((await api('PATCH', '/salon/termine/8', { status: 'gebucht' }, cookie)).status, 409);
  // Termin 1 lag in der Vorwoche und ist erledigt → zurücksetzen und wieder abhaken
  assert.equal((await api('PATCH', '/salon/termine/1', { status: 'gebucht' }, cookie)).status, 204);
  assert.equal((await api('PATCH', '/salon/termine/1', { status: 'erledigt' }, cookie)).status, 204);
  assert.equal((await api('PATCH', '/salon/termine/1', { status: 'quatsch' }, cookie)).status, 400);
  assert.equal((await api('PATCH', '/salon/termine/99999', { status: 'erledigt' }, cookie)).status, 404);
});

test('F-14/F-15: Leistung anlegen, Preis ändern – gebuchte Termine behalten ihren Preis', async () => {
  const cookie = await salonCookie();
  const neu = await api('POST', '/salon/leistungen', { name: 'Augenbrauen', dauerMin: 15, preis: '9,50', mitarbeiterIds: [1, 2] }, cookie);
  assert.equal(neu.status, 201);
  assert.equal((await api('POST', '/salon/leistungen', { name: 'Augenbrauen', dauerMin: 15, preis: 9.5, mitarbeiterIds: [1] }, cookie)).status, 409);
  assert.ok((await api('GET', '/leistungen')).daten.some((l) => l.name === 'Augenbrauen'));

  const gebucht = await buche({ leistungIds: [1], mitarbeiterId: 1, datum: TAG2, uhrzeit: '13:00', ...kunde(6) });
  assert.equal(gebucht.daten.preis, 28);
  assert.equal((await api('PUT', '/salon/leistungen/1', { name: 'Herrenschnitt', dauerMin: 30, preis: 30, mitarbeiterIds: [1, 2, 3] }, cookie)).status, 204);
  assert.equal((await api('GET', `/termine/code/${gebucht.daten.stornoCode}`)).daten.preis, 28);
  assert.equal((await buche({ leistungIds: [1], mitarbeiterId: 1, datum: TAG2, uhrzeit: '14:00', ...kunde(7) })).daten.preis, 30);

  // deaktivieren statt löschen
  assert.equal((await api('PUT', `/salon/leistungen/${neu.daten.id}`, { name: 'Augenbrauen', dauerMin: 15, preis: 9.5, aktiv: false, mitarbeiterIds: [1] }, cookie)).status, 204);
  assert.equal((await buche({ leistungIds: [neu.daten.id], datum: TAG2, uhrzeit: '15:00', ...kunde(8) })).status, 422);
});

test('W-03: freier Tag sperrt die Person für Buchungen', async () => {
  const cookie = await salonCookie();
  const tag = zeit.plusTage(TAG1, 9); // Donnerstag der Folgewoche
  assert.equal((await api('POST', '/salon/freie-tage', { mitarbeiterId: 3, datum: tag, grund: 'Urlaub' }, cookie)).status, 201);
  const frei = await api('GET', `/verfuegbarkeit?datum=${tag}&leistungen=1&mitarbeiter=3`);
  assert.deepEqual(frei.daten.zeiten, []);
  assert.match(frei.daten.hinweis, /frei/);
  assert.equal((await buche({ leistungIds: [1], mitarbeiterId: 3, datum: tag, uhrzeit: '10:00', ...kunde(9) })).status, 422);
  const egal = await buche({ leistungIds: [1], datum: tag, uhrzeit: '10:00', ...kunde(9) });
  assert.notEqual(egal.daten.mitarbeiter, 'Jonas');
  // Freier Tag mit gebuchten Terminen wird abgelehnt
  assert.equal((await api('POST', '/salon/freie-tage', { mitarbeiterId: 1, datum: TAG1, grund: 'krank' }, cookie)).status, 409);
});

test('Auswertung: Umsatz nur aus erledigten Terminen', async () => {
  const cookie = await salonCookie();
  const r = await api('GET', `/salon/auswertung?von=${zeit.plusTage(TAG1, -14)}&bis=${TAG1}`, undefined, cookie);
  assert.equal(r.status, 200);
  const [summe] = await db.execute(
    `SELECT SUM(tl.preis) AS s FROM termin_leistung tl JOIN termin t USING (termin_id)
      WHERE t.status = 'erledigt' AND t.beginn >= ? AND t.beginn < ?`,
    [`${zeit.plusTage(TAG1, -14)} 00:00:00`, `${zeit.plusTage(TAG1, 1)} 00:00:00`],
  );
  assert.equal(r.daten.umsatzGesamt, Number(summe[0].s));
  assert.ok(r.daten.wochen.length >= 1);
});
