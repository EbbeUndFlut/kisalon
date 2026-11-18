// Tages- und Wochenansicht des Salon-Bereichs sowie der Termin-Dialog
// (erledigt / nicht erschienen / stornieren).
import * as api from './api.js';
import { el, fuelle } from './dom.js';
import {
  datumKurz, datumLang, datumOhneJahr, euro, plusTage, wochentag, wochenbeginn,
  zuMinuten, alsUhrzeit, STATUS_TEXT,
} from './format.js';

const PX_PRO_MIN = 1.6;          // 15 Minuten = 24 px
const STANDARD_ZEITEN = { von: '09:00', bis: '18:00' };

// ---------------------------------------------------------------------
// Tagesübersicht: eine Spalte pro Person (F-12), blättern (F-13)
// ---------------------------------------------------------------------

export async function zeigeTag(container, salon) {
  const datum = salon.datum;
  fuelle(container, leiste(salon, datum, 'tag'), el('p', { class: 'meldung meldung-info' }, 'Termine werden geladen …'));

  let daten;
  try {
    daten = await api.salon.termine(datum, datum);
  } catch (err) {
    salon.fehler(err);
    return;
  }
  if (salon.ansicht !== 'tag' || salon.datum !== datum) return; // inzwischen weitergeblättert

  const oeffnung = salon.einstellungen.oeffnungszeiten.find((o) => o.wochentag === wochentag(datum));
  const { von, bis } = bereich(oeffnung, daten.termine);

  // Spalten: aktive Personen + inaktive, die an diesem Tag noch Termine haben
  const spalten = daten.mitarbeiter.filter((m) => m.aktiv || daten.termine.some((t) => t.mitarbeiterId === m.id));
  const hoehe = (bis - von) * PX_PRO_MIN;

  const kalender = el('div', { class: 'kalender' });
  kalender.style.gridTemplateColumns = `56px repeat(${spalten.length}, minmax(150px, 1fr))`;

  kalender.append(el('div', { class: 'kal-kopf' }));
  for (const m of spalten) {
    const anzahl = daten.termine.filter((t) => t.mitarbeiterId === m.id && t.status !== 'storniert').length;
    kalender.append(el('div', { class: 'kal-kopf' }, m.name, el('small', {}, `${anzahl} Termin${anzahl === 1 ? '' : 'e'}`)));
  }

  // Zeitleiste
  const zeiten = el('div', { class: 'kal-zeiten' });
  zeiten.style.height = `${hoehe}px`;
  for (let m = von; m < bis; m += 30) {
    const marke = el('div', { class: 'kal-zeit' }, m === von ? '' : alsUhrzeit(m));
    marke.style.top = `${(m - von) * PX_PRO_MIN}px`;
    zeiten.append(marke);
  }
  kalender.append(zeiten);

  for (const m of spalten) {
    const spalte = el('div', { class: 'kal-spalte' });
    spalte.style.height = `${hoehe}px`;
    for (let min = von + 30; min < bis; min += 30) {
      const linie = el('div', { class: `kal-linie${min % 60 ? ' halb' : ''}` });
      linie.style.top = `${(min - von) * PX_PRO_MIN}px`;
      spalte.append(linie);
    }
    const frei = daten.freieTage.find((f) => f.mitarbeiterId === m.id);
    if (frei) spalte.append(el('div', { class: 'kal-frei' }, `frei${frei.grund ? ` · ${frei.grund}` : ''}`));

    // Stornierte zuerst zeichnen, damit aktive Termine darüber liegen
    const termine = daten.termine
      .filter((t) => t.mitarbeiterId === m.id)
      .sort((a, b) => (a.status === 'storniert' ? -1 : 0) - (b.status === 'storniert' ? -1 : 0));
    for (const t of termine) spalte.append(terminBlock(t, von, salon));
    kalender.append(spalte);
  }

  const inhalt = [leiste(salon, datum, 'tag')];
  if (!oeffnung) inhalt.push(el('p', { class: 'meldung meldung-info' }, 'Ruhetag – der Salon ist an diesem Tag geschlossen.'));
  if (daten.termine.length === 0 && oeffnung) inhalt.push(el('p', { class: 'meldung meldung-info' }, 'Für diesen Tag sind noch keine Termine gebucht.'));
  inhalt.push(el('div', { class: 'kalender-rahmen' }, kalender), legende());
  fuelle(container, inhalt);
}

/** Sichtbarer Zeitbereich: Öffnungszeit, bei Bedarf erweitert um Termine außerhalb */
function bereich(oeffnung, termine) {
  let von = zuMinuten((oeffnung || STANDARD_ZEITEN).von);
  let bis = zuMinuten((oeffnung || STANDARD_ZEITEN).bis);
  for (const t of termine) {
    von = Math.min(von, Math.floor(zuMinuten(t.beginn) / 30) * 30);
    bis = Math.max(bis, Math.ceil(zuMinuten(t.ende) / 30) * 30);
  }
  return { von, bis };
}

function terminBlock(t, von, salon) {
  const beginn = zuMinuten(t.beginn);
  const dauer = zuMinuten(t.ende) - beginn;
  const block = el('button', {
    type: 'button',
    class: `termin status-${t.status}`,
    title: `${t.beginn}–${t.ende} · ${t.leistungen} · ${t.kunde} (${STATUS_TEXT[t.status]})`,
    onclick: () => oeffneTerminDialog(t, salon),
  },
  el('strong', {}, `${t.leistungen} · ${kurzname(t.kunde)}`),
  dauer >= 25 ? el('span', {}, `${t.beginn}–${t.ende} · ${t.telefon}`) : null);
  block.style.top = `${(beginn - von) * PX_PRO_MIN + 1}px`;
  block.style.height = `${dauer * PX_PRO_MIN - 2}px`;
  return block;
}

/** "Katrin Berger" → "K. Berger" */
function kurzname(name) {
  const teile = name.split(' ');
  return teile.length > 1 ? `${teile[0][0]}. ${teile.slice(1).join(' ')}` : name;
}

function legende() {
  return el('div', { class: 'legende' },
    el('span', {}, 'gebucht'),
    el('span', { class: 'l-erledigt' }, 'erledigt'),
    el('span', { class: 'l-nicht' }, 'nicht erschienen'),
    el('span', { class: 'l-storniert' }, 'storniert'));
}

/** Blätterleiste für Tag (± 1 Tag) und Woche (± 7 Tage) */
function leiste(salon, datum, ansicht) {
  const schritt = ansicht === 'tag' ? 1 : 7;
  const titel = ansicht === 'tag'
    ? datumKurz(datum)
    : `Woche ${datumOhneJahr(wochenbeginn(datum))} – ${datumKurz(plusTage(wochenbeginn(datum), 6))}`;
  const datumFeld = el('input', {
    type: 'date', value: datum, 'aria-label': 'Datum wählen',
    onchange: (e) => e.target.value && salon.oeffne(ansicht, e.target.value),
  });
  return el('div', { class: 'leiste' },
    el('h2', {}, titel),
    el('div', { class: 'leiste-gruppe' },
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => salon.oeffne(ansicht, plusTage(datum, -schritt)) }, '‹ Zurück'),
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => salon.oeffne(ansicht, salon.einstellungen.heute) }, 'Heute'),
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => salon.oeffne(ansicht, plusTage(datum, schritt)) }, 'Weiter ›'),
      datumFeld));
}

// ---------------------------------------------------------------------
// Wochenansicht (Bonus)
// ---------------------------------------------------------------------

export async function zeigeWoche(container, salon) {
  const datum = salon.datum;
  const montag = wochenbeginn(datum);
  const sonntag = plusTage(montag, 6);
  fuelle(container, leiste(salon, datum, 'woche'), el('p', { class: 'meldung meldung-info' }, 'Termine werden geladen …'));

  let daten;
  try {
    daten = await api.salon.termine(montag, sonntag);
  } catch (err) {
    salon.fehler(err);
    return;
  }
  if (salon.ansicht !== 'woche' || salon.datum !== datum) return;

  const offeneTage = new Set(salon.einstellungen.oeffnungszeiten.map((o) => o.wochentag));
  const tage = [];
  for (let i = 0; i < 7; i++) {
    const tag = plusTage(montag, i);
    const termine = daten.termine.filter((t) => t.datum === tag);
    // Ruhetage nur zeigen, wenn dort ausnahmsweise Termine liegen
    if (!offeneTage.has(wochentag(tag)) && termine.length === 0) continue;
    const aktiv = termine.filter((t) => t.status !== 'storniert');
    tage.push(el('section', { class: `woche-tag${tag === salon.einstellungen.heute ? ' heute' : ''}` },
      el('h3', {}, el('button', { type: 'button', onclick: () => salon.oeffne('tag', tag) },
        datumKurz(tag).slice(0, -4),
        el('small', {}, `${aktiv.length} Termin${aktiv.length === 1 ? '' : 'e'} · ${euro(aktiv.reduce((s, t) => s + t.preis, 0))}`))),
      daten.freieTage.filter((f) => f.datum === tag)
        .map((f) => el('div', { class: 'woche-frei' }, `${f.mitarbeiter} hat frei${f.grund ? ` (${f.grund})` : ''}`)),
      termine.map((t) => el('button', {
        type: 'button', class: `woche-termin status-${t.status}`,
        onclick: () => oeffneTerminDialog(t, salon),
      }, `${t.beginn} ${t.mitarbeiter} · ${t.leistungen} · ${kurzname(t.kunde)}`)),
      termine.length === 0 ? el('p', { class: 'untertitel' }, 'Keine Termine') : null));
  }
  fuelle(container, leiste(salon, datum, 'woche'), el('div', { class: 'woche' }, tage), legende());
}

// ---------------------------------------------------------------------
// Termin-Dialog: Details und Statuswechsel (F-09, F-10, F-11)
// ---------------------------------------------------------------------

function oeffneTerminDialog(t, salon) {
  const dialog = document.getElementById('termin-dialog');
  zeichneDialog(dialog, t, salon, { bestaetigeStorno: false, meldung: null });
  dialog.showModal();
}

function zeichneDialog(dialog, t, salon, { bestaetigeStorno, meldung }) {
  const istVergangenOderHeute = t.datum <= salon.einstellungen.heute;
  const aendere = async (status) => {
    try {
      await api.salon.setzeStatus(t.id, status);
      dialog.close();
      salon.meldung(`Termin ${t.beginn} Uhr (${t.kunde}) ist jetzt „${STATUS_TEXT[status]}“.`);
      salon.oeffne(salon.ansicht, salon.datum);
    } catch (err) {
      if (err.status === 401) {
        dialog.close();
        salon.fehler(err);
        return;
      }
      zeichneDialog(dialog, t, salon, { bestaetigeStorno: false, meldung: err.message });
    }
  };

  const knoepfe = [];
  if (t.status === 'gebucht') {
    if (bestaetigeStorno) {
      knoepfe.push(
        el('button', { type: 'button', class: 'knopf knopf-gefahr', onclick: () => aendere('storniert') }, 'Ja, stornieren'),
        el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => zeichneDialog(dialog, t, salon, { bestaetigeStorno: false }) }, 'Abbrechen'),
      );
    } else {
      if (istVergangenOderHeute) {
        knoepfe.push(
          el('button', { type: 'button', class: 'knopf', onclick: () => aendere('erledigt') }, '✓ Erledigt'),
          el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => aendere('nicht_erschienen') }, 'Nicht erschienen'),
        );
      }
      knoepfe.push(el('button', {
        type: 'button', class: 'knopf knopf-leise',
        onclick: () => zeichneDialog(dialog, t, salon, { bestaetigeStorno: true }),
      }, 'Stornieren'));
    }
  } else if (t.status === 'erledigt' || t.status === 'nicht_erschienen') {
    const anders = t.status === 'erledigt' ? 'nicht_erschienen' : 'erledigt';
    knoepfe.push(
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => aendere('gebucht') }, 'Zurücksetzen auf „gebucht“'),
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => aendere(anders) }, `Als „${STATUS_TEXT[anders]}“ markieren`),
    );
  }
  knoepfe.push(el('button', { type: 'button', class: 'knopf knopf-leise rechts', onclick: () => dialog.close() }, 'Schließen'));

  fuelle(document.getElementById('dialog-inhalt'),
    el('h2', { id: 'dialog-titel' }, t.kunde),
    el('span', { class: `marke marke-${t.status}` }, STATUS_TEXT[t.status]),
    el('dl', { class: 'details' },
      el('dt', {}, 'Termin'), el('dd', {}, `${datumLang(t.datum)}, ${t.beginn}–${t.ende} Uhr`),
      el('dt', {}, 'Bei'), el('dd', {}, t.mitarbeiter),
      el('dt', {}, 'Leistung'), el('dd', {}, t.leistungen),
      el('dt', {}, 'Preis'), el('dd', {}, euro(t.preis)),
      el('dt', {}, 'Telefon'), el('dd', {}, el('a', { href: `tel:${t.telefon.replace(/[^\d+]/g, '')}` }, t.telefon)),
      el('dt', {}, 'E-Mail'), el('dd', {}, el('a', { href: `mailto:${t.email}` }, t.email)),
      t.status === 'storniert' ? [
        el('dt', {}, 'Storniert'),
        el('dd', {}, `${t.storniertAm ? `${datumKurz(t.storniertAm.slice(0, 10))}, ${t.storniertAm.slice(11, 16)} Uhr` : ''} durch ${t.storniertVon === 'kunde' ? 'Kunde/Kundin' : 'Salon'}`),
      ] : null),
    meldung ? el('p', { class: 'meldung meldung-fehler', role: 'alert' }, meldung) : null,
    bestaetigeStorno ? el('p', { class: 'meldung meldung-info' }, 'Termin wirklich stornieren? Der Platz wird wieder frei. Der Termin bleibt als „storniert“ gespeichert.') : null,
    t.status === 'gebucht' && !istVergangenOderHeute && !bestaetigeStorno
      ? el('p', { class: 'untertitel' }, 'Als erledigt markieren ist ab dem Termintag möglich.') : null,
    el('div', { class: 'dialog-knoepfe' }, knoepfe));
}
