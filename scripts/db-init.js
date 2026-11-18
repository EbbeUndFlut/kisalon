// Legt Datenbank, Tabellen und Beispieldaten aus db/schema.sql an.
// Nutzt die Zugangsdaten aus .env. ACHTUNG: löscht eine vorhandene Datenbank.
// Aufruf: npm run db:init
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import config from '../src/config.js';

const skript = await fs.readFile(path.join(import.meta.dirname, '..', 'db', 'schema.sql'), 'utf8');

let verbindung;
try {
  verbindung = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true, // nur hier, für das Einspielen des eigenen SQL-Skripts
    charset: 'utf8mb4',
  });
  await verbindung.query(skript);
  const [[{ anzahl }]] = await verbindung.query('SELECT COUNT(*) AS anzahl FROM schnittpunkt.termin');
  console.log(`Datenbank "schnittpunkt" angelegt (${anzahl} Beispieltermine).`);
} catch (err) {
  console.error('Datenbank konnte nicht angelegt werden:', err.message);
  process.exitCode = 1;
} finally {
  await verbindung?.end();
}
