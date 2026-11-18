// REST-Routen für den Salon-Bereich. Alles außer Login/Sitzung erfordert
// eine gültige Anmeldung (Middleware nurSalon).
import express from 'express';
import * as v from '../utils/validierung.js';
import * as zeit from '../utils/zeit.js';
import { fehler } from '../utils/fehler.js';
import { anmelden, abmelden, nurSalon } from '../middleware/auth.js';
import * as salon from '../services/salon.js';

const router = express.Router();

// ---------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------

// POST /api/salon/login { passwort } → 204 + Cookie, 401 bei falschem Passwort
router.post('/login', (req, res) => {
  anmelden(req, res, v.body(req).passwort);
  res.status(204).end();
});

// POST /api/salon/logout → 204
router.post('/logout', (req, res) => {
  abmelden(req, res);
  res.status(204).end();
});

// GET /api/salon/sitzung → 204 wenn angemeldet, sonst 401
router.get('/sitzung', nurSalon, (req, res) => {
  res.status(204).end();
});

router.use(nurSalon);

// ---------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------

/** Zeitraum aus ?datum= (ein Tag) oder ?von=&bis= (höchstens 92 Tage) */
function zeitraum(query) {
  if (query.datum !== undefined) {
    const datum = v.datum(query.datum);
    return { von: datum, bis: datum };
  }
  const von = v.datum(query.von, 'von');
  const bis = v.datum(query.bis, 'bis');
  if (bis < von) throw fehler.ungueltig('„bis“ darf nicht vor „von“ liegen.');
  if (zeit.stempel(bis) - zeit.stempel(von) > 92 * 24 * 60) throw fehler.ungueltig('Der Zeitraum darf höchstens 92 Tage umfassen.');
  return { von, bis };
}

// GET /api/salon/termine?datum=YYYY-MM-DD  oder  ?von=…&bis=…
router.get('/termine', async (req, res) => {
  const { von, bis } = zeitraum(req.query);
  const [termine, mitarbeiter, freieTage] = await Promise.all([
    salon.ladeTermine(von, bis),
    salon.ladeMitarbeiter(),
    salon.ladeFreieTage(von, bis),
  ]);
  res.json({ von, bis, mitarbeiter, freieTage, termine });
});

// PATCH /api/salon/termine/:id { status } – erledigt, nicht erschienen, storniert, gebucht
router.patch('/termine/:id', async (req, res) => {
  const id = v.id(req.params.id, 'Termin');
  const status = v.auswahl(v.body(req).status, ['gebucht', 'erledigt', 'nicht_erschienen', 'storniert'], 'Status');
  await salon.setzeStatus(id, status);
  res.status(204).end();
});

// ---------------------------------------------------------------------
// Mitarbeiter (nur lesend)
// ---------------------------------------------------------------------

router.get('/mitarbeiter', async (req, res) => {
  res.json(await salon.ladeMitarbeiter());
});

// ---------------------------------------------------------------------
// Leistungen: anlegen und ändern; Löschen gibt es bewusst nicht (deaktivieren)
// ---------------------------------------------------------------------

function leistungEingabe(body) {
  return {
    name: v.text(body.name, 'Name', { min: 2, max: 60 }),
    dauerMin: v.dauer(body.dauerMin),
    preis: v.preis(body.preis),
    aktiv: body.aktiv === undefined ? true : v.wahrheitswert(body.aktiv, 'aktiv'),
    mitarbeiterIds: v.idListe(body.mitarbeiterIds ?? [], 'Mitarbeiter', { min: 0 }),
  };
}

router.get('/leistungen', async (req, res) => {
  res.json(await salon.ladeLeistungen());
});

// POST /api/salon/leistungen → 201
router.post('/leistungen', async (req, res) => {
  const id = await salon.legeLeistungAn(leistungEingabe(v.body(req)));
  res.status(201).location(`/api/salon/leistungen/${id}`).json({ id });
});

// PUT /api/salon/leistungen/:id → 204
router.put('/leistungen/:id', async (req, res) => {
  await salon.aendereLeistung(v.id(req.params.id, 'Leistung'), leistungEingabe(v.body(req)));
  res.status(204).end();
});

// ---------------------------------------------------------------------
// Freie Tage (Bonus W-03)
// ---------------------------------------------------------------------

router.get('/freie-tage', async (req, res) => {
  const { von, bis } = zeitraum(req.query);
  res.json(await salon.ladeFreieTage(von, bis));
});

router.post('/freie-tage', async (req, res) => {
  const b = v.body(req);
  const grund = b.grund === undefined || b.grund === null || String(b.grund).trim() === ''
    ? null
    : v.text(b.grund, 'Grund', { min: 1, max: 100 });
  const id = await salon.legeFreienTagAn({
    mitarbeiterId: v.id(b.mitarbeiterId, 'Mitarbeiter'),
    datum: v.datum(b.datum),
    grund,
  });
  res.status(201).json({ id });
});

router.delete('/freie-tage/:id', async (req, res) => {
  await salon.loescheFreienTag(v.id(req.params.id, 'Freier Tag'));
  res.status(204).end();
});

// ---------------------------------------------------------------------
// Auswertung (Bonus): GET /api/salon/auswertung?von=…&bis=…
// ---------------------------------------------------------------------

router.get('/auswertung', async (req, res) => {
  const { von, bis } = zeitraum(req.query);
  res.json(await salon.auswertung(von, bis));
});

export default router;
