// Salon-Bereich: Anmeldung, Reiter und gemeinsamer Zustand.
// Die einzelnen Ansichten liegen in salon-kalender.js und salon-verwaltung.js.
import * as api from './api.js';
import { zeigeMeldung, $ } from './dom.js';
import { zeigeTag, zeigeWoche } from './salon-kalender.js';
import { zeigeLeistungen, zeigeFreieTage, zeigeAuswertung } from './salon-verwaltung.js';

const ANSICHTEN = {
  tag: zeigeTag,
  woche: zeigeWoche,
  leistungen: zeigeLeistungen,
  'freie-tage': zeigeFreieTage,
  auswertung: zeigeAuswertung,
};

/** Gemeinsamer Zustand aller Ansichten */
const salon = {
  einstellungen: null,
  ansicht: 'tag',
  datum: null,
  // Wird von den Ansichten aufgerufen, um z. B. vom Wochen- in den Tagesblick zu springen
  oeffne: (ansicht, datum) => oeffneAnsicht(ansicht, datum),
  // Einheitliche Fehlerbehandlung: 401 → zurück zur Anmeldung
  fehler: (err) => {
    if (err.status === 401) {
      zeigeLogin('Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.');
      return;
    }
    zeigeMeldung($('#app-meldung'), err.message);
  },
  meldung: (text, art = 'erfolg') => zeigeMeldung($('#app-meldung'), text, art),
};

function zeigeLogin(hinweis) {
  $('#app-bereich').hidden = true;
  $('#login-bereich').hidden = false;
  zeigeMeldung($('#login-meldung'), hinweis || null, 'info');
  $('#login-formular').elements.passwort.focus();
}

async function anmelden(event) {
  event.preventDefault();
  const feld = event.target.elements.passwort;
  if (!feld.value) {
    zeigeMeldung($('#login-meldung'), 'Bitte das Passwort eingeben.');
    return;
  }
  try {
    await api.salon.login(feld.value);
    feld.value = '';
    zeigeApp();
  } catch (err) {
    zeigeMeldung($('#login-meldung'), err.message);
    feld.select();
  }
}

async function abmelden() {
  await api.salon.logout().catch(() => {});
  zeigeLogin('Sie wurden abgemeldet.');
}

function zeigeApp() {
  $('#login-bereich').hidden = true;
  $('#app-bereich').hidden = false;
  const [ansicht, datum] = window.location.hash.slice(1).split('/');
  oeffneAnsicht(ANSICHTEN[ansicht] ? ansicht : 'tag', /^\d{4}-\d{2}-\d{2}$/.test(datum || '') ? datum : salon.datum);
}

/** Wechselt die Ansicht; Ansicht und Datum stehen in der Adresse (#tag/2026-11-17) */
function oeffneAnsicht(ansicht, datum = salon.datum) {
  salon.ansicht = ansicht;
  salon.datum = datum;
  history.replaceState(null, '', `#${ansicht}${['tag', 'woche'].includes(ansicht) ? `/${datum}` : ''}`);
  document.querySelectorAll('.reiter button').forEach((b) => {
    b.setAttribute('aria-selected', b.dataset.ansicht === ansicht ? 'true' : 'false');
  });
  $('#ansicht').setAttribute('aria-labelledby', `reiter-${ansicht}`);
  zeigeMeldung($('#app-meldung'), null);
  ANSICHTEN[ansicht]($('#ansicht'), salon);
}

async function start() {
  $('#login-formular').addEventListener('submit', anmelden);
  $('#abmelden').addEventListener('click', abmelden);
  document.querySelectorAll('.reiter button').forEach((b) => {
    b.addEventListener('click', () => oeffneAnsicht(b.dataset.ansicht));
  });

  try {
    salon.einstellungen = await api.ladeEinstellungen();
    salon.datum = salon.einstellungen.heute;
  } catch (err) {
    zeigeMeldung($('#lade-meldung'), `Der Salon-Bereich konnte nicht geladen werden. ${err.message}`);
    return;
  }
  zeigeMeldung($('#lade-meldung'), null);

  try {
    await api.salon.sitzung();
    zeigeApp();
  } catch {
    zeigeLogin();
  }
}

start();
