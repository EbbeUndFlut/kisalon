// Öffentliche REST-Routen für die Buchungs- und Stornoseite.
// Keine dieser Routen liefert Daten anderer Kundinnen und Kunden (N-02).
import express from 'express';
import * as v from '../utils/validierung.js';
import * as zeit from '../utils/zeit.js';
import config from '../config.js';
import * as stammdaten from '../services/stammdaten.js';
import * as verfuegbarkeit from '../services/verfuegbarkeit.js';
import * as buchung from '../services/buchung.js';
import * as regeln from '../services/regeln.js';
import * as mail from '../services/mail.js';

const router = express.Router();

// GET /api/leistungen – aktive Leistungen mit Dauer und Preis
router.get('/leistungen', async (req, res) => {
  res.json(await stammdaten.ladeLeistungenOeffentlich());
});

// GET /api/mitarbeiter – aktive Personen mit den Leistungen, die sie anbieten
router.get('/mitarbeiter', async (req, res) => {
  res.json(await stammdaten.ladeMitarbeiterOeffentlich());
});

// GET /api/einstellungen – Öffnungszeiten und Buchungsgrenzen für die Oberfläche
router.get('/einstellungen', async (req, res) => {
  const jetzt = zeit.jetzt();
  res.json({
    heute: jetzt.datum,
    letztesDatum: regeln.letztesBuchbaresDatum(jetzt.datum),
    oeffnungszeiten: await stammdaten.ladeAlleOeffnungszeiten(),
    maxLeistungen: config.regeln.maxLeistungen,
    minVorlaufStd: config.regeln.minVorlaufMin / 60,
    stornoFristStd: config.regeln.stornoFristStd,
  });
});

// GET /api/verfuegbarkeit?datum=2026-11-17&leistungen=1,5&mitarbeiter=2|egal
// → { datum, dauerMin, zeiten: ["09:00", …], hinweis }
router.get('/verfuegbarkeit', async (req, res) => {
  const ergebnis = await verfuegbarkeit.freieZeiten({
    datum: v.datum(req.query.datum),
    leistungIds: v.leistungIds(req.query.leistungen),
    mitarbeiterId: v.mitarbeiterWahl(req.query.mitarbeiter),
  });
  res.json(ergebnis);
});

// POST /api/termine – Termin buchen → 201 mit Bestätigung und Stornocode
router.post('/termine', async (req, res) => {
  const b = v.body(req);
  const eingabe = {
    leistungIds: v.leistungIds(b.leistungIds),
    mitarbeiterId: v.mitarbeiterWahl(b.mitarbeiterId),
    datum: v.datum(b.datum),
    uhrzeit: v.uhrzeit(b.uhrzeit),
    name: v.name(b.name),
    telefon: v.telefon(b.telefon),
    email: v.email(b.email),
  };
  const termin = await buchung.bucheTermin(eingabe);
  // E-Mail nach dem Commit; ein Versandfehler ändert nichts an der Buchung
  mail.sendeBestaetigung(termin, { name: eingabe.name, email: eingabe.email });
  res.status(201).location(`/api/termine/code/${termin.stornoCode}`).json(termin);
});

// GET /api/termine/code/:code – eigenen Termin über den Stornocode anzeigen
router.get('/termine/code/:code', async (req, res) => {
  res.json(await buchung.ladeTerminNachCode(v.stornoCode(req.params.code)));
});

// POST /api/termine/code/:code/stornierung – eigenen Termin stornieren.
// POST statt DELETE: Der Termin wird nicht gelöscht, sondern storniert (F-09).
router.post('/termine/code/:code/stornierung', async (req, res) => {
  res.json(await buchung.storniereNachCode(v.stornoCode(req.params.code)));
});

export default router;
