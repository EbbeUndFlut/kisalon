// Formatierung und Datumsrechnung im Frontend.
// Datumsformat überall: "YYYY-MM-DD", Uhrzeit "HH:MM" (wie in der API).

const WOCHENTAGE_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function teile(datum) {
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t));
}

function zweistellig(n) {
  return String(n).padStart(2, '0');
}

export function alsDatum(d) {
  return `${d.getUTCFullYear()}-${zweistellig(d.getUTCMonth() + 1)}-${zweistellig(d.getUTCDate())}`;
}

export function plusTage(datum, tage) {
  const d = teile(datum);
  d.setUTCDate(d.getUTCDate() + tage);
  return alsDatum(d);
}

/** ISO-Wochentag 1 = Montag … 7 = Sonntag */
export function wochentag(datum) {
  const tag = teile(datum).getUTCDay();
  return tag === 0 ? 7 : tag;
}

export function wochenbeginn(datum) {
  return plusTage(datum, 1 - wochentag(datum));
}

/** "Di, 17.11.2026" */
export function datumKurz(datum) {
  const d = teile(datum);
  return `${WOCHENTAGE_KURZ[d.getUTCDay()]}, ${zweistellig(d.getUTCDate())}.${zweistellig(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** "Dienstag, 17.11.2026" */
export function datumLang(datum) {
  const d = teile(datum);
  return `${WOCHENTAGE_LANG[d.getUTCDay()]}, ${zweistellig(d.getUTCDate())}.${zweistellig(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** "17.11." */
export function datumOhneJahr(datum) {
  const d = teile(datum);
  return `${zweistellig(d.getUTCDate())}.${zweistellig(d.getUTCMonth() + 1)}.`;
}

export function euro(betrag) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag);
}

export function zuMinuten(uhrzeit) {
  const [h, m] = uhrzeit.split(':').map(Number);
  return h * 60 + m;
}

export function alsUhrzeit(minuten) {
  return `${zweistellig(Math.floor(minuten / 60))}:${zweistellig(minuten % 60)}`;
}

export const STATUS_TEXT = {
  gebucht: 'gebucht',
  erledigt: 'erledigt',
  nicht_erschienen: 'nicht erschienen',
  storniert: 'storniert',
};
