// Stornoseite: Termin über den Stornocode anzeigen und stornieren (ohne Login).
// Es werden nur Daten des eigenen Termins angezeigt (keine Kundendaten).
import * as api from './api.js';
import { el, fuelle, zeigeMeldung, $ } from './dom.js';
import { datumLang, euro, STATUS_TEXT } from './format.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let aktuellerCode = null;
let bestaetigen = false;   // zweistufiges Stornieren statt confirm()-Dialog

async function zeigeTermin(code) {
  const meldung = $('#code-meldung');
  zeigeMeldung(meldung, null);
  if (!UUID_RE.test(code)) {
    zeigeMeldung(meldung, 'Der Stornocode hat die Form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx. Bitte prüfen Sie Ihre Eingabe.');
    $('#termin').hidden = true;
    return;
  }
  try {
    const termin = await api.ladeTerminNachCode(code);
    aktuellerCode = code;
    bestaetigen = false;
    zeichneTermin(termin);
  } catch (err) {
    $('#termin').hidden = true;
    zeigeMeldung(meldung, err.message);
  }
}

async function storniere() {
  if (!bestaetigen) {
    bestaetigen = true;
    zeichneAktionen({ stornierbar: true });
    return;
  }
  try {
    const termin = await api.storniereNachCode(aktuellerCode);
    bestaetigen = false;
    zeichneTermin(termin);
    zeigeMeldung($('#termin-meldung'), 'Ihr Termin wurde storniert. Schade, dass es nicht klappt – wir freuen uns auf Ihre nächste Buchung.', 'erfolg');
  } catch (err) {
    bestaetigen = false;
    zeigeMeldung($('#termin-meldung'), err.message);
    zeichneAktionen({ stornierbar: false });
  }
}

function zeichneTermin(termin) {
  $('#termin').hidden = false;
  $('#termin-titel').textContent = termin.status === 'storniert' ? 'Stornierter Termin' : 'Ihr Termin';
  fuelle($('#termin-details'),
    el('dt', {}, 'Datum'), el('dd', {}, datumLang(termin.datum)),
    el('dt', {}, 'Uhrzeit'), el('dd', {}, `${termin.beginn}–${termin.ende} Uhr`),
    el('dt', {}, 'Bei'), el('dd', {}, termin.mitarbeiter),
    el('dt', {}, 'Leistung'), el('dd', {}, termin.leistungen.map((l) => l.name).join(' + ')),
    el('dt', {}, 'Preis'), el('dd', {}, euro(termin.preis)),
    el('dt', {}, 'Status'), el('dd', {}, el('span', { class: `marke marke-${termin.status}` }, STATUS_TEXT[termin.status])));
  zeigeMeldung($('#termin-meldung'), termin.stornierbar ? null : termin.hinweis, 'info');
  zeichneAktionen(termin);
}

function zeichneAktionen({ stornierbar }) {
  const aktionen = $('#termin-aktionen');
  if (!stornierbar) {
    fuelle(aktionen, el('a', { class: 'knopf knopf-leise', href: '/' }, 'Neuen Termin buchen'));
    return;
  }
  if (bestaetigen) {
    fuelle(aktionen,
      el('p', { class: 'untertitel' }, 'Wirklich stornieren? Das kann nicht rückgängig gemacht werden.'),
      el('button', { type: 'button', class: 'knopf knopf-gefahr', onclick: storniere }, 'Ja, Termin stornieren'),
      el('button', {
        type: 'button', class: 'knopf knopf-leise',
        onclick: () => { bestaetigen = false; zeichneAktionen({ stornierbar: true }); },
      }, 'Nein, Termin behalten'));
    aktionen.querySelector('.knopf-gefahr').focus();
    return;
  }
  fuelle(aktionen, el('button', { type: 'button', class: 'knopf knopf-gefahr', onclick: storniere }, 'Termin stornieren'));
}

function start() {
  $('#code-formular').addEventListener('submit', (e) => {
    e.preventDefault();
    zeigeTermin($('#code').value.trim());
  });
  // Link aus der Bestätigung: /storno?code=…
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    $('#code').value = code;
    zeigeTermin(code.trim());
  }
}

start();
