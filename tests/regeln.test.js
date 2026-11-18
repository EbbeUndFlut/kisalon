// Unit-Tests für Zeitrechnung, Buchungsregeln und Validierung (ohne Datenbank).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as zeit from '../src/utils/zeit.js';
import * as regeln from '../src/services/regeln.js';
import * as v from '../src/utils/validierung.js';

const oeffnung = { von: 9 * 60, bis: 18 * 60 };
const jetztAm = (datum, uhrzeit) => {
  const minuten = zeit.zuMinuten(uhrzeit);
  return { datum, minuten, stempel: zeit.stempel(datum, minuten) };
};

test('Datum: gültige und ungültige Kalendertage', () => {
  assert.equal(zeit.istDatum('2026-11-17'), true);
  assert.equal(zeit.istDatum('2026-02-29'), false);
  assert.equal(zeit.istDatum('2028-02-29'), true);
  assert.equal(zeit.istDatum('17.11.2026'), false);
});

test('Wochentag nach ISO (Mo = 1, So = 7)', () => {
  assert.equal(zeit.wochentag('2026-11-16'), 1);
  assert.equal(zeit.wochentag('2026-11-17'), 2);
  assert.equal(zeit.wochentag('2026-11-22'), 7);
});

test('plus 3 Monate wird am Monatsende gekürzt', () => {
  assert.equal(zeit.plusMonate('2026-11-16', 3), '2027-02-16');
  assert.equal(zeit.plusMonate('2026-11-30', 3), '2027-02-28');
  assert.equal(zeit.plusMonate('2027-11-30', 3), '2028-02-29');
});

test('DATETIME hin und zurück', () => {
  const s = zeit.stempelAusDatetime('2026-12-31 23:45:00');
  assert.equal(zeit.alsDatetime(s + 30), '2027-01-01 00:15:00');
});

test('Überschneidung: Ende = Beginn des nächsten ist keine Überschneidung', () => {
  assert.equal(regeln.ueberschneiden(0, 30, 30, 60), false);
  assert.equal(regeln.ueberschneiden(0, 31, 30, 60), true);
  assert.equal(regeln.ueberschneiden(10, 20, 0, 60), true);   // komplett innerhalb
  assert.equal(regeln.ueberschneiden(0, 60, 10, 20), true);   // umschließt
});

test('R-05: Termin muss komplett in die Öffnungszeit passen (Färben 17:45 geht nicht)', () => {
  const jetzt = jetztAm('2026-11-16', '10:00');
  assert.match(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('17:45'), 90, oeffnung, jetzt), /Öffnungszeit/);
  assert.match(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('16:45'), 90, oeffnung, jetzt), /späteste Beginn 16:30/);
  assert.equal(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('16:30'), 90, oeffnung, jetzt), null);
  assert.match(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('08:45'), 30, oeffnung, jetzt), /Öffnungszeit/);
});

test('R-06: nicht in der Vergangenheit, mindestens 2 Stunden Vorlauf', () => {
  const jetzt = jetztAm('2026-11-17', '10:00');
  assert.match(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('09:30'), 30, oeffnung, jetzt), /Vergangenheit/);
  assert.match(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('11:45'), 30, oeffnung, jetzt), /2 Stunden/);
  assert.equal(regeln.zeitVerstoss('2026-11-17', zeit.zuMinuten('12:00'), 30, oeffnung, jetzt), null);
  assert.match(regeln.zeitVerstoss('2026-11-16', zeit.zuMinuten('12:00'), 30, oeffnung, jetzt), /Vergangenheit/);
});

test('R-07: höchstens 3 Monate im Voraus', () => {
  const jetzt = jetztAm('2026-11-16', '10:00');
  assert.equal(regeln.tagVerstoss('2027-02-16', oeffnung, jetzt), null);
  assert.match(regeln.tagVerstoss('2027-02-17', oeffnung, jetzt), /3 Monate/);
});

test('R-04: geschlossener Tag', () => {
  assert.match(regeln.tagVerstoss('2026-11-23', null, jetztAm('2026-11-16', '10:00')), /geschlossen/);
});

test('R-03: Viertelstundentakt bei der Validierung', () => {
  assert.equal(v.uhrzeit('09:45'), '09:45');
  assert.throws(() => v.uhrzeit('09:40'), /Viertelstunde/);
  assert.throws(() => v.uhrzeit('9:00'), /HH:MM/);
});

test('Validierung von Kontaktdaten', () => {
  assert.equal(v.email('  Anna.Roth@Example.org '), 'anna.roth@example.org');
  assert.throws(() => v.email('anna@'), /E-Mail/);
  assert.equal(v.telefon('+49 (0)151 / 123-456'), '+49 (0)151 / 123-456');
  assert.throws(() => v.telefon('0151 abc'), /Telefonnummer/);
  assert.equal(v.name('  Anna   Roth '), 'Anna Roth');
  assert.throws(() => v.name('A'), /zu kurz/);
  assert.throws(() => v.name(42), /fehlt/);
});

test('Validierung von Leistungsauswahl, Preis und Stornocode', () => {
  assert.deepEqual(v.leistungIds('1,5'), [1, 5]);
  assert.deepEqual(v.leistungIds([2]), [2]);
  assert.throws(() => v.leistungIds([1, 1]), /doppelte/);
  assert.throws(() => v.leistungIds([1, 2, 3, 4]), /höchstens 3/);
  assert.throws(() => v.leistungIds([]), /mindestens eine/);
  assert.equal(v.mitarbeiterWahl('egal'), null);
  assert.equal(v.mitarbeiterWahl('2'), 2);
  assert.equal(v.preis('28,50'), 28.5);
  assert.throws(() => v.preis('1,234'), /zwei Nachkommastellen/);
  assert.throws(() => v.preis(-1), /zwischen 0/);
  assert.throws(() => v.stornoCode("1' OR '1'='1"), /ungültig/);
});
