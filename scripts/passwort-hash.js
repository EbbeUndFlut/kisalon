// Erzeugt den Wert für SALON_PASSWORT_HASH in .env.
// Aufruf: npm run passwort-hash -- "mein geheimes Passwort"
import crypto from 'node:crypto';

const passwort = process.argv[2];
if (!passwort || passwort.length < 8) {
  console.error('Bitte ein Passwort mit mindestens 8 Zeichen angeben:\n  npm run passwort-hash -- "mein geheimes Passwort"');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(passwort, salt, 64);
console.log(`SALON_PASSWORT_HASH=scrypt$${salt.toString('hex')}$${hash.toString('hex')}`);
