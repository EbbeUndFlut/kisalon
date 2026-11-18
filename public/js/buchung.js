// Buchungsseite: Leistung → Person oder „egal“ → Datum und freie Uhrzeit →
// Kontaktdaten → Bestätigung mit Stornocode.
// Aufbau: Zustand (zustand) + Logik (Funktionen, die ihn ändern) +
// Darstellung (zeige…-Funktionen, die nur aus dem Zustand zeichnen).
import * as api from './api.js';
import { el, fuelle, zeigeMeldung, $ } from './dom.js';
import { datumLang, datumKurz, euro, plusTage, wochentag, alsUhrzeit, zuMinuten } from './format.js';

const SPEICHER_SCHLUESSEL = 'schnittpunkt.kontakt';

const zustand = {
  leistungen: [],
  mitarbeiter: [],
  einstellungen: null,
  leistungIds: [],        // gewählte Leistungen in Klick-Reihenfolge
  person: 'egal',         // 'egal' oder Mitarbeiter-ID
  datum: null,
  uhrzeit: null,
  zeiten: [],
  hinweis: null,
  zeitenLaden: false,
  anfrageNr: 0,           // verwirft veraltete Antworten bei schnellem Klicken
  sendet: false,
};

// ---------------------------------------------------------------------
// Logik
// ---------------------------------------------------------------------

function gewaehlteLeistungen() {
  return zustand.leistungIds.map((id) => zustand.leistungen.find((l) => l.id === id));
}

function gesamtDauer() {
  return gewaehlteLeistungen().reduce((s, l) => s + l.dauerMin, 0);
}

function gesamtPreis() {
  return gewaehlteLeistungen().reduce((s, l) => s + l.preis, 0);
}

/** Bietet die Person alle gewählten Leistungen an? */
function kannAlles(person) {
  return zustand.leistungIds.every((id) => person.leistungIds.includes(id));
}

function istGeoeffnet(datum) {
  return zustand.einstellungen.oeffnungszeiten.some((o) => o.wochentag === wochentag(datum));
}

/** Nächster Öffnungstag in Richtung schritt (+1/-1) innerhalb der Buchungsgrenzen */
function naechsterOeffnungstag(datum, schritt) {
  const { heute, letztesDatum } = zustand.einstellungen;
  let d = plusTage(datum, schritt);
  while (d >= heute && d <= letztesDatum) {
    if (istGeoeffnet(d)) return d;
    d = plusTage(d, schritt);
  }
  return null;
}

function toggleLeistung(id) {
  const index = zustand.leistungIds.indexOf(id);
  if (index >= 0) {
    zustand.leistungIds.splice(index, 1);
  } else {
    if (zustand.leistungIds.length >= zustand.einstellungen.maxLeistungen) {
      zeigeMeldung($('#formular-meldung'), `Bitte höchstens ${zustand.einstellungen.maxLeistungen} Leistungen in einem Termin wählen.`, 'info');
      return;
    }
    zustand.leistungIds.push(id);
  }
  zeigeMeldung($('#formular-meldung'), null);
  // Person passt nicht mehr zu den Leistungen → zurück auf „egal“
  if (zustand.person !== 'egal') {
    const person = zustand.mitarbeiter.find((m) => m.id === zustand.person);
    if (!kannAlles(person)) zustand.person = 'egal';
  }
  ladeZeiten();
}

function waehlePerson(person) {
  zustand.person = person;
  ladeZeiten();
}

function waehleDatum(datum) {
  if (!datum) return;
  zustand.datum = datum;
  ladeZeiten();
}

function waehleZeit(uhrzeit) {
  zustand.uhrzeit = zustand.uhrzeit === uhrzeit ? null : uhrzeit;
  zeigeAlles();
  if (zustand.uhrzeit) $('#formular input[name="name"]').focus({ preventScroll: window.innerWidth < 860 });
}

/** Lädt die freien Zeiten für die aktuelle Auswahl (nur Uhrzeiten, keine Daten anderer) */
async function ladeZeiten() {
  zustand.uhrzeit = null;
  zustand.zeiten = [];
  zustand.hinweis = null;
  if (zustand.leistungIds.length === 0 || !zustand.datum) {
    zustand.zeitenLaden = false;
    zeigeAlles();
    return;
  }
  const nr = ++zustand.anfrageNr;
  zustand.zeitenLaden = true;
  zeigeAlles();
  try {
    const ergebnis = await api.ladeFreieZeiten({
      datum: zustand.datum,
      leistungIds: zustand.leistungIds,
      mitarbeiter: zustand.person,
    });
    if (nr !== zustand.anfrageNr) return;
    zustand.zeiten = ergebnis.zeiten;
    zustand.hinweis = ergebnis.hinweis;
  } catch (err) {
    if (nr !== zustand.anfrageNr) return;
    zustand.hinweis = err.message;
  }
  zustand.zeitenLaden = false;
  zeigeAlles();
}

function leseFormular() {
  const form = $('#formular');
  return {
    name: form.elements.name.value.trim(),
    telefon: form.elements.telefon.value.trim(),
    email: form.elements.email.value.trim(),
    merken: form.elements.merken.checked,
  };
}

/** Einfache Vorprüfung im Browser; die verbindliche Prüfung macht der Server */
function pruefeFormular() {
  const form = $('#formular');
  for (const feld of ['name', 'telefon', 'email']) form.elements[feld].removeAttribute('aria-invalid');
  if (zustand.leistungIds.length === 0) return 'Bitte zuerst eine Leistung wählen.';
  if (!zustand.uhrzeit) return 'Bitte eine freie Uhrzeit wählen.';
  for (const [feld, text] of [['name', 'Ihren Namen'], ['telefon', 'Ihre Telefonnummer'], ['email', 'Ihre E-Mail-Adresse']]) {
    if (!form.elements[feld].checkValidity()) {
      form.elements[feld].setAttribute('aria-invalid', 'true');
      form.elements[feld].focus();
      return `Bitte ${text} korrekt angeben.`;
    }
  }
  return null;
}

async function sendeBuchung(event) {
  event.preventDefault();
  if (zustand.sendet) return;
  const meldung = $('#formular-meldung');
  const problem = pruefeFormular();
  if (problem) {
    zeigeMeldung(meldung, problem);
    return;
  }
  const kontakt = leseFormular();
  zustand.sendet = true;
  zeigeAlles();
  zeigeMeldung(meldung, null);
  try {
    const termin = await api.bucheTermin({
      leistungIds: zustand.leistungIds,
      mitarbeiterId: zustand.person,
      datum: zustand.datum,
      uhrzeit: zustand.uhrzeit,
      name: kontakt.name,
      telefon: kontakt.telefon,
      email: kontakt.email,
    });
    merkeKontakt(kontakt);
    zeigeBestaetigung(termin, kontakt.email);
  } catch (err) {
    zeigeMeldung(meldung, err.message);
    // Zeit inzwischen vergeben oder Regel verletzt → freie Zeiten neu laden
    if (err.status === 409 || err.status === 422) {
      zustand.sendet = false;
      await ladeZeiten();
      zeigeMeldung(meldung, err.message);
    }
  } finally {
    zustand.sendet = false;
    zeigeAlles();
  }
}

// Kontaktdaten nur im eigenen Browser speichern (F-06), nie vom Server abfragen
function merkeKontakt({ name, telefon, email, merken }) {
  try {
    if (merken) localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({ name, telefon, email }));
    else localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } catch { /* Speicher nicht verfügbar – kein Problem */ }
}

function ladeGemerktenKontakt() {
  try {
    const daten = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) || 'null');
    if (!daten) return;
    const form = $('#formular');
    for (const feld of ['name', 'telefon', 'email']) {
      if (typeof daten[feld] === 'string') form.elements[feld].value = daten[feld];
    }
  } catch { /* ignorieren */ }
}

// ---------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------

function zeigeAlles() {
  zeigeSchritte();
  zeigeLeistungen();
  zeigePersonen();
  zeigeDatum();
  zeigeZeiten();
  zeigeZusammenfassung();
}

function zeigeSchritte() {
  const erreicht = [
    zustand.leistungIds.length > 0,
    zustand.leistungIds.length > 0,
    Boolean(zustand.uhrzeit),
    false,
  ];
  const aktiv = erreicht.indexOf(false);
  document.querySelectorAll('#schritte li').forEach((li, i) => {
    li.classList.toggle('fertig', i < aktiv);
    li.classList.toggle('aktiv', i === aktiv);
    if (i === aktiv) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
}

function zeigeLeistungen() {
  fuelle($('#leistungen'), zustand.leistungen.map((l) => el('button', {
    type: 'button',
    class: 'leistung',
    'aria-pressed': zustand.leistungIds.includes(l.id) ? 'true' : 'false',
    onclick: () => toggleLeistung(l.id),
  }, el('strong', {}, l.name), el('small', {}, `${l.dauerMin} Min · ${euro(l.preis)}`))));
}

function zeigePersonen() {
  const gewaehlt = gewaehlteLeistungen();
  const chips = [el('button', {
    type: 'button', class: 'chip',
    'aria-pressed': zustand.person === 'egal' ? 'true' : 'false',
    onclick: () => waehlePerson('egal'),
  }, 'Egal')];
  for (const m of zustand.mitarbeiter) {
    const fehlend = gewaehlt.filter((l) => !m.leistungIds.includes(l.id));
    chips.push(el('button', {
      type: 'button', class: 'chip',
      'aria-pressed': zustand.person === m.id ? 'true' : 'false',
      disabled: fehlend.length > 0,
      title: fehlend.length > 0 ? `${m.name} bietet ${fehlend.map((l) => l.name).join(', ')} nicht an` : null,
      onclick: () => waehlePerson(m.id),
    }, fehlend.length > 0 ? `${m.name} (bietet ${fehlend.map((l) => l.name).join(', ')} nicht an)` : m.name));
  }
  fuelle($('#personen'), chips);
}

function zeigeDatum() {
  const { heute, letztesDatum } = zustand.einstellungen;
  const input = $('#datum');
  input.min = heute;
  input.max = letztesDatum;
  if (input.value !== zustand.datum) input.value = zustand.datum || '';
  $('#tag-name').textContent = zustand.datum ? datumLang(zustand.datum) : '';
  $('#tag-zurueck').disabled = !zustand.datum || !naechsterOeffnungstag(zustand.datum, -1);
  $('#tag-weiter').disabled = !zustand.datum || !naechsterOeffnungstag(zustand.datum, 1);
}

function zeigeZeiten() {
  const bereich = $('#zeiten-bereich');
  if (zustand.leistungIds.length === 0) {
    fuelle(bereich, el('p', { class: 'leer-hinweis' }, 'Bitte zuerst eine Leistung wählen, dann erscheinen hier die freien Uhrzeiten.'));
    return;
  }
  if (zustand.zeitenLaden) {
    fuelle(bereich, el('p', { class: 'leer-hinweis' }, 'Freie Zeiten werden geladen …'));
    return;
  }
  if (zustand.zeiten.length === 0) {
    fuelle(bereich, el('p', { class: 'leer-hinweis' }, zustand.hinweis || 'Keine freien Zeiten an diesem Tag.'));
    return;
  }
  fuelle(bereich, el('div', { class: 'zeiten', role: 'group', 'aria-label': 'Freie Uhrzeiten' },
    zustand.zeiten.map((z) => el('button', {
      type: 'button', class: 'zeit',
      'aria-pressed': zustand.uhrzeit === z ? 'true' : 'false',
      onclick: () => waehleZeit(z),
    }, z))));
}

function zeigeZusammenfassung() {
  const gewaehlt = gewaehlteLeistungen();
  $('#z-leistung').textContent = gewaehlt.length ? gewaehlt.map((l) => l.name).join(' + ') : '–';
  const person = zustand.mitarbeiter.find((m) => m.id === zustand.person);
  $('#z-person').textContent = person ? person.name : 'egal (wird zugeteilt)';
  $('#z-termin').textContent = zustand.uhrzeit
    ? `${datumKurz(zustand.datum).slice(0, -4)}, ${zustand.uhrzeit}–${alsUhrzeit(zuMinuten(zustand.uhrzeit) + gesamtDauer())} Uhr`
    : '–';
  $('#z-dauer').textContent = gewaehlt.length ? `${gesamtDauer()} Min` : '–';
  $('#z-preis').textContent = gewaehlt.length ? euro(gesamtPreis()) : '–';
  const knopf = $('#buchen');
  knopf.disabled = !zustand.uhrzeit || zustand.sendet;
  knopf.textContent = zustand.sendet ? 'Wird gebucht …' : 'Termin verbindlich buchen';
}

function zeigeBestaetigung(termin, email) {
  $('#buchung-bereich').hidden = true;
  const bereich = $('#bestaetigung');
  bereich.hidden = false;
  $('#b-email').textContent = email;
  fuelle($('#b-details'),
    el('dt', {}, 'Termin'), el('dd', {}, `${datumLang(termin.datum)}, ${termin.beginn}–${termin.ende} Uhr`),
    el('dt', {}, 'Bei'), el('dd', {}, termin.mitarbeiter),
    el('dt', {}, 'Leistung'), el('dd', {}, termin.leistungen.map((l) => l.name).join(' + ')),
    el('dt', {}, 'Preis'), el('dd', {}, `${euro(termin.preis)} (Zahlung im Salon)`));
  $('#b-code').textContent = termin.stornoCode;
  $('#b-storno-hinweis').textContent =
    `Mit diesem Code können Sie den Termin bis ${zustand.einstellungen.stornoFristStd} Stunden vorher selbst stornieren. Bitte gut aufbewahren.`;
  $('#b-storno-link').href = `/storno?code=${encodeURIComponent(termin.stornoCode)}`;
  $('#b-kopieren').onclick = async () => {
    try {
      await navigator.clipboard.writeText(termin.stornoCode);
      $('#b-kopieren').textContent = 'Kopiert ✓';
    } catch {
      $('#b-kopieren').textContent = 'Bitte manuell kopieren';
    }
  };
  bereich.focus();
  window.scrollTo({ top: 0 });
}

function zeigeOeffnungszeiten() {
  const namen = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  // Aufeinanderfolgende Tage mit gleichen Zeiten zusammenfassen: "Di–Fr 09:00–18:00"
  const gruppen = [];
  for (const o of zustand.einstellungen.oeffnungszeiten) {
    const letzte = gruppen.at(-1);
    if (letzte && letzte.bisTag === o.wochentag - 1 && letzte.von === o.von && letzte.bis === o.bis) letzte.bisTag = o.wochentag;
    else gruppen.push({ vonTag: o.wochentag, bisTag: o.wochentag, von: o.von, bis: o.bis });
  }
  $('#oeffnungszeiten-text').textContent = gruppen
    .map((g) => `${namen[g.vonTag]}${g.bisTag !== g.vonTag ? `–${namen[g.bisTag]}` : ''} ${g.von}–${g.bis} Uhr`)
    .join(' · ');
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

async function start() {
  try {
    const [leistungen, mitarbeiter, einstellungen] = await Promise.all([
      api.ladeLeistungen(), api.ladeMitarbeiter(), api.ladeEinstellungen(),
    ]);
    Object.assign(zustand, { leistungen, mitarbeiter, einstellungen });
  } catch (err) {
    zeigeMeldung($('#lade-meldung'), `Das Angebot konnte nicht geladen werden. ${err.message}`);
    return;
  }
  zeigeMeldung($('#lade-meldung'), null);
  $('#buchung').hidden = false;

  const { heute } = zustand.einstellungen;
  zustand.datum = istGeoeffnet(heute) ? heute : naechsterOeffnungstag(heute, 1);

  zeigeOeffnungszeiten();
  ladeGemerktenKontakt();

  $('#datum').addEventListener('change', (e) => waehleDatum(e.target.value));
  $('#tag-zurueck').addEventListener('click', () => waehleDatum(naechsterOeffnungstag(zustand.datum, -1)));
  $('#tag-weiter').addEventListener('click', () => waehleDatum(naechsterOeffnungstag(zustand.datum, 1)));
  $('#formular').addEventListener('submit', sendeBuchung);

  zeigeAlles();
}

start();
