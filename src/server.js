// Einstiegspunkt: Express-Server mit REST-API und statischem Frontend.
// Frontend und API laufen auf demselben Server, daher ist kein CORS nötig.
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import config from './config.js';
import { pool } from './db.js';
import oeffentlicheRouten from './routes/oeffentlich.js';
import salonRouten from './routes/salon.js';
import { nichtGefunden, fehlerbehandlung } from './middleware/fehlerbehandlung.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '20kb' }));

// API-Antworten nie zwischenspeichern (freie Zeiten ändern sich laufend)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', oeffentlicheRouten);
app.use('/api/salon', salonRouten);
app.use('/api', nichtGefunden);

app.use(express.static(path.join(import.meta.dirname, '..', 'public'), { extensions: ['html'] }));
app.use(nichtGefunden);
app.use(fehlerbehandlung);

// Datenbankverbindung beim Start prüfen, damit Fehler sofort auffallen
try {
  await pool.query('SELECT 1 FROM termin LIMIT 1');
} catch (err) {
  console.error(`Keine Verbindung zur Datenbank "${config.db.database}" auf ${config.db.host}:${config.db.port}.`);
  console.error(`Grund: ${err.message}`);
  console.error('Bitte .env prüfen und die Datenbank mit "npm run db:init" anlegen.');
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Schnittpunkt läuft auf http://localhost:${config.port}`);
  console.log(`  Buchung:      http://localhost:${config.port}/`);
  console.log(`  Stornieren:   http://localhost:${config.port}/storno`);
  console.log(`  Salon-Bereich: http://localhost:${config.port}/salon`);
});
