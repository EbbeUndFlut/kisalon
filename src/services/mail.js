// Bestätigungs-E-Mail (W-01). Ohne SMTP-Konfiguration wird die E-Mail in der
// Konsole ausgegeben; mit SMTP_HOST in .env wird sie wirklich versendet.
// Ein Fehler beim Versand macht die Buchung nicht rückgängig.
import nodemailer from 'nodemailer';
import config from '../config.js';
import { formatDatum } from './regeln.js';

let transporter = null;
if (config.mail.host) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

function euro(betrag) {
  return `${betrag.toFixed(2).replace('.', ',')} €`;
}

function bestaetigungsText(termin, name) {
  const leistungen = termin.leistungen.map((l) => `  - ${l.name} (${l.dauerMin} Min., ${euro(l.preis)})`).join('\n');
  const stornoLink = `${config.oeffentlicheUrl}/storno.html?code=${termin.stornoCode}`;
  return [
    `Hallo ${name},`,
    '',
    'vielen Dank für Ihre Buchung im Friseursalon Schnittpunkt.',
    '',
    `Termin:   ${formatDatum(termin.datum)}, ${termin.beginn}–${termin.ende} Uhr`,
    `Bei:      ${termin.mitarbeiter}`,
    'Leistung:',
    leistungen,
    `Preis:    ${euro(termin.preis)} (Zahlung im Salon)`,
    '',
    `Ihr Stornocode: ${termin.stornoCode}`,
    `Stornieren (bis 24 Stunden vorher): ${stornoLink}`,
    '',
    'Wir freuen uns auf Sie!',
    'Ihr Team vom Friseursalon Schnittpunkt',
  ].join('\n');
}

async function sendeBestaetigung(termin, kunde) {
  const nachricht = {
    from: config.mail.absender,
    to: kunde.email,
    subject: `Terminbestätigung ${formatDatum(termin.datum)}, ${termin.beginn} Uhr`,
    text: bestaetigungsText(termin, kunde.name),
  };
  if (!transporter) {
    console.log(
      '\n──────── Bestätigungs-E-Mail (Konsolenausgabe, kein SMTP konfiguriert) ────────\n'
      + `An:      ${nachricht.to}\nBetreff: ${nachricht.subject}\n\n${nachricht.text}\n`
      + '───────────────────────────────────────────────────────────────────────────────\n',
    );
    return;
  }
  try {
    await transporter.sendMail(nachricht);
  } catch (err) {
    console.error(`Bestätigungs-E-Mail an ${nachricht.to} konnte nicht gesendet werden:`, err.message);
  }
}

export { sendeBestaetigung, bestaetigungsText };
