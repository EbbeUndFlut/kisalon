// Lädt .env und stellt alle Einstellungen an einer Stelle bereit.
// Fehlende Pflichtwerte führen beim Start zu einer klaren Fehlermeldung.
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });

function pflicht(name) {
  const wert = process.env[name];
  if (wert === undefined || wert === '') {
    throw new Error(`Umgebungsvariable ${name} fehlt. Bitte .env anlegen (Vorlage: .env.example).`);
  }
  return wert;
}

function zahl(name, standard) {
  const wert = process.env[name];
  if (wert === undefined || wert === '') return standard;
  const n = Number(wert);
  if (!Number.isFinite(n)) throw new Error(`Umgebungsvariable ${name} muss eine Zahl sein.`);
  return n;
}

const config = {
  port: zahl('PORT', 3000),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: zahl('DB_PORT', 3306),
    user: pflicht('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'schnittpunkt',
  },

  salon: {
    // Format: scrypt$<salt hex>$<hash hex>  – erzeugen mit: npm run passwort-hash -- "<passwort>"
    passwortHash: pflicht('SALON_PASSWORT_HASH'),
    sitzungStunden: zahl('SALON_SITZUNG_STUNDEN', 10),
  },

  // Zeitzone des Salons; alle Zeiten in der Datenbank sind lokale Salonzeit.
  zeitzone: process.env.SALON_ZEITZONE || 'Europe/Berlin',

  // Buchungsregeln aus dem Gespräch (siehe docs/anforderungen.md)
  regeln: {
    rasterMin: 15,         // R-03 Viertelstundentakt
    minVorlaufMin: 120,    // R-06 mindestens zwei Stunden vorher
    maxVorausMonate: 3,    // R-07 drei Monate reichen
    stornoFristStd: 24,    // R-10 bis 24 Stunden vorher
    maxLeistungen: 3,      // W-02 Schnitt + Bart (+ Waschen)
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: zahl('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    absender: process.env.MAIL_ABSENDER || 'Friseursalon Schnittpunkt <termine@schnittpunkt.example>',
  },

  // Basis-URL für Links in der Bestätigungs-E-Mail
  oeffentlicheUrl: process.env.OEFFENTLICHE_URL || `http://localhost:${zahl('PORT', 3000)}`,
};

export default config;
