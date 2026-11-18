// Verwaltung im Salon-Bereich: Leistungen anlegen/ändern (F-14, F-15),
// freie Tage pro Person (W-03) und Auswertung (Bonus).
import * as api from './api.js';
import { el, fuelle, zeigeMeldung } from './dom.js';
import { datumKurz, datumOhneJahr, euro, plusTage, wochenbeginn } from './format.js';

// ---------------------------------------------------------------------
// Leistungen
// ---------------------------------------------------------------------

export async function zeigeLeistungen(container, salon) {
  fuelle(container, el('p', { class: 'meldung meldung-info' }, 'Leistungen werden geladen …'));
  let leistungen;
  let mitarbeiter;
  try {
    [leistungen, mitarbeiter] = await Promise.all([api.salon.leistungen(), api.salon.mitarbeiter()]);
  } catch (err) {
    salon.fehler(err);
    return;
  }
  const namen = new Map(mitarbeiter.map((m) => [m.id, m.name]));
  let bearbeitet = null; // null = neue Leistung

  const meldung = el('div', { hidden: true });
  const titel = el('h2', {}, 'Neue Leistung');
  const form = el('form', { novalidate: true },
    meldung,
    el('label', { class: 'feld' }, el('span', {}, 'Name'),
      el('input', { type: 'text', name: 'name', required: true, minlength: 2, maxlength: 60 })),
    el('label', { class: 'feld' }, el('span', {}, 'Dauer in Minuten'),
      el('input', { type: 'number', name: 'dauerMin', required: true, min: 5, max: 480, step: 5 })),
    el('label', { class: 'feld' }, el('span', {}, 'Preis in Euro'),
      el('input', { type: 'text', name: 'preis', required: true, inputmode: 'decimal', placeholder: 'z. B. 28,00' })),
    el('fieldset', { class: 'feld' },
      el('legend', {}, el('span', {}, 'Wer führt die Leistung aus?')),
      el('div', { class: 'personen-wahl' }, mitarbeiter.map((m) => el('label', {},
        el('input', { type: 'checkbox', name: 'mitarbeiter', value: m.id }), m.name)))),
    el('label', { class: 'checkbox' },
      el('input', { type: 'checkbox', name: 'aktiv', checked: true }),
      el('span', {}, 'Online buchbar (aktiv). Gebuchte Leistungen werden nicht gelöscht, sondern deaktiviert.')),
    el('div', { class: 'formular-knoepfe' },
      el('button', { type: 'submit', class: 'knopf' }, 'Speichern'),
      el('button', { type: 'button', class: 'knopf knopf-leise', onclick: () => bearbeite(null) }, 'Neu / Abbrechen')),
    el('p', { class: 'untertitel' }, 'Preisänderungen gelten für neue Buchungen. Bereits gebuchte Termine behalten ihren Preis.'));

  function bearbeite(leistung) {
    bearbeitet = leistung;
    titel.textContent = leistung ? `Leistung bearbeiten: ${leistung.name}` : 'Neue Leistung';
    form.elements.name.value = leistung?.name ?? '';
    form.elements.dauerMin.value = leistung?.dauerMin ?? 30;
    form.elements.preis.value = leistung ? leistung.preis.toFixed(2).replace('.', ',') : '';
    form.elements.aktiv.checked = leistung ? leistung.aktiv : true;
    for (const box of form.querySelectorAll('input[name="mitarbeiter"]')) {
      box.checked = leistung ? leistung.mitarbeiterIds.includes(Number(box.value)) : true;
    }
    zeigeMeldung(meldung, null);
    form.elements.name.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const daten = {
      name: form.elements.name.value.trim(),
      dauerMin: Number(form.elements.dauerMin.value),
      preis: form.elements.preis.value.trim(),
      aktiv: form.elements.aktiv.checked,
      mitarbeiterIds: [...form.querySelectorAll('input[name="mitarbeiter"]:checked')].map((b) => Number(b.value)),
    };
    if (daten.aktiv && daten.mitarbeiterIds.length === 0) {
      zeigeMeldung(meldung, 'Eine aktive Leistung braucht mindestens eine Person, die sie ausführt.');
      return;
    }
    try {
      if (bearbeitet) await api.salon.aendereLeistung(bearbeitet.id, daten);
      else await api.salon.legeLeistungAn(daten);
      salon.meldung(`Leistung „${daten.name}“ wurde gespeichert.`);
      zeigeLeistungen(container, salon);
    } catch (err) {
      if (err.status === 401) salon.fehler(err);
      else zeigeMeldung(meldung, err.message);
    }
  });

  const tabelle = el('table', { class: 'tabelle' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Leistung'), el('th', { class: 'zahl' }, 'Dauer'), el('th', { class: 'zahl' }, 'Preis'),
      el('th', {}, 'Personen'), el('th', {}, 'Status'), el('th', {}, el('span', { class: 'nur-screenreader' }, 'Aktion')))),
    el('tbody', {}, leistungen.map((l) => el('tr', { class: l.aktiv ? null : 'inaktiv' },
      el('td', {}, l.name),
      el('td', { class: 'zahl' }, `${l.dauerMin} Min`),
      el('td', { class: 'zahl' }, euro(l.preis)),
      el('td', {}, l.mitarbeiterIds.map((id) => namen.get(id)).join(', ') || '–'),
      el('td', {}, el('span', { class: `marke ${l.aktiv ? 'marke-erledigt' : ''}` }, l.aktiv ? 'aktiv' : 'inaktiv')),
      el('td', {}, el('button', { type: 'button', class: 'knopf knopf-leise knopf-klein', onclick: () => bearbeite(l) }, 'Bearbeiten'))))));

  fuelle(container, el('div', { class: 'raster-2' },
    el('section', { class: 'karte' }, titel, form),
    el('section', { class: 'karte' }, el('h2', {}, 'Alle Leistungen'), el('div', { class: 'tabelle-rahmen' }, tabelle))));
  bearbeite(null);
}

// ---------------------------------------------------------------------
// Freie Tage pro Person (W-03)
// ---------------------------------------------------------------------

export async function zeigeFreieTage(container, salon) {
  const von = salon.einstellungen.heute;
  const bis = plusTage(von, 92);
  fuelle(container, el('p', { class: 'meldung meldung-info' }, 'Freie Tage werden geladen …'));
  let freieTage;
  let mitarbeiter;
  try {
    [freieTage, mitarbeiter] = await Promise.all([api.salon.freieTage(von, bis), api.salon.mitarbeiter()]);
  } catch (err) {
    salon.fehler(err);
    return;
  }

  const meldung = el('div', { hidden: true });
  const form = el('form', { novalidate: true },
    meldung,
    el('label', { class: 'feld' }, el('span', {}, 'Person'),
      el('select', { name: 'mitarbeiterId', required: true },
        mitarbeiter.filter((m) => m.aktiv).map((m) => el('option', { value: m.id }, m.name)))),
    el('label', { class: 'feld' }, el('span', {}, 'Datum'),
      el('input', { type: 'date', name: 'datum', required: true, min: von, value: von })),
    el('label', { class: 'feld' }, el('span', {}, 'Grund (optional)'),
      el('input', { type: 'text', name: 'grund', maxlength: 100, placeholder: 'z. B. Urlaub, Berufsschule' })),
    el('button', { type: 'submit', class: 'knopf' }, 'Freien Tag eintragen'),
    el('p', { class: 'untertitel' }, 'An freien Tagen ist die Person online nicht buchbar. Bereits gebuchte Termine müssen vorher storniert werden.'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.elements.datum.value) {
      zeigeMeldung(meldung, 'Bitte ein Datum wählen.');
      return;
    }
    try {
      await api.salon.legeFreienTagAn({
        mitarbeiterId: Number(form.elements.mitarbeiterId.value),
        datum: form.elements.datum.value,
        grund: form.elements.grund.value.trim() || null,
      });
      salon.meldung('Freier Tag wurde eingetragen.');
      zeigeFreieTage(container, salon);
    } catch (err) {
      if (err.status === 401) salon.fehler(err);
      else zeigeMeldung(meldung, err.message);
    }
  });

  const loesche = async (f) => {
    try {
      await api.salon.loescheFreienTag(f.id);
      salon.meldung(`Freier Tag von ${f.mitarbeiter} am ${datumKurz(f.datum)} wurde entfernt.`);
      zeigeFreieTage(container, salon);
    } catch (err) {
      salon.fehler(err);
    }
  };

  const liste = freieTage.length === 0
    ? el('p', { class: 'untertitel' }, 'In den nächsten drei Monaten sind keine freien Tage eingetragen.')
    : el('div', { class: 'tabelle-rahmen' }, el('table', { class: 'tabelle' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Datum'), el('th', {}, 'Person'), el('th', {}, 'Grund'),
        el('th', {}, el('span', { class: 'nur-screenreader' }, 'Aktion')))),
      el('tbody', {}, freieTage.map((f) => el('tr', {},
        el('td', {}, datumKurz(f.datum)), el('td', {}, f.mitarbeiter), el('td', {}, f.grund || '–'),
        el('td', {}, el('button', { type: 'button', class: 'knopf knopf-leise knopf-klein', onclick: () => loesche(f) }, 'Entfernen')))))));

  fuelle(container, el('div', { class: 'raster-2' },
    el('section', { class: 'karte' }, el('h2', {}, 'Freien Tag eintragen'), form),
    el('section', { class: 'karte' }, el('h2', {}, 'Eingetragene freie Tage'), liste)));
}

// ---------------------------------------------------------------------
// Auswertung: Termine pro Woche, Umsatz je Leistung (Bonus)
// ---------------------------------------------------------------------

export async function zeigeAuswertung(container, salon, zeitraum) {
  const heute = salon.einstellungen.heute;
  const von = zeitraum?.von ?? plusTage(wochenbeginn(heute), -7 * 7);
  const bis = zeitraum?.bis ?? plusTage(wochenbeginn(heute), 6);

  const meldung = el('div', { hidden: true });
  const form = el('form', { class: 'leiste-gruppe', novalidate: true },
    el('label', {}, 'Von ', el('input', { type: 'date', name: 'von', value: von, required: true })),
    el('label', {}, 'bis ', el('input', { type: 'date', name: 'bis', value: bis, required: true })),
    el('button', { type: 'submit', class: 'knopf knopf-leise' }, 'Anzeigen'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    zeigeAuswertung(container, salon, { von: form.elements.von.value, bis: form.elements.bis.value });
  });
  const ergebnisBereich = el('div', {}, el('p', { class: 'meldung meldung-info' }, 'Auswertung wird berechnet …'));
  fuelle(container, el('div', { class: 'leiste' }, el('h2', {}, 'Auswertung'), form), meldung, ergebnisBereich);

  let daten;
  try {
    daten = await api.salon.auswertung(von, bis);
  } catch (err) {
    if (err.status === 401) salon.fehler(err);
    else {
      zeigeMeldung(meldung, err.message);
      ergebnisBereich.replaceChildren();
    }
    return;
  }

  const maxUmsatz = Math.max(1, ...daten.umsatzJeLeistung.map((u) => u.umsatz));
  const summe = (feld) => daten.wochen.reduce((s, w) => s + w[feld], 0);

  const wochen = el('section', { class: 'karte' },
    el('h2', {}, 'Termine pro Woche'),
    daten.wochen.length === 0 ? el('p', { class: 'untertitel' }, 'Keine Termine im Zeitraum.') :
      el('div', { class: 'tabelle-rahmen' }, el('table', { class: 'tabelle' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'KW'), el('th', { class: 'zahl' }, 'Gesamt'), el('th', { class: 'zahl' }, 'Erledigt'),
          el('th', { class: 'zahl' }, 'Nicht erschienen'), el('th', { class: 'zahl' }, 'Storniert'), el('th', { class: 'zahl' }, 'Offen'))),
        el('tbody', {}, daten.wochen.map((w) => el('tr', {},
          el('td', {}, `KW ${w.kw} (${datumOhneJahr(w.montag)})`),
          el('td', { class: 'zahl' }, w.gesamt), el('td', { class: 'zahl' }, w.erledigt),
          el('td', { class: 'zahl' }, w.nichtErschienen), el('td', { class: 'zahl' }, w.storniert),
          el('td', { class: 'zahl' }, w.offen)))),
        el('tfoot', {}, el('tr', {},
          el('th', {}, 'Summe'), el('th', { class: 'zahl' }, summe('gesamt')), el('th', { class: 'zahl' }, summe('erledigt')),
          el('th', { class: 'zahl' }, summe('nichtErschienen')), el('th', { class: 'zahl' }, summe('storniert')),
          el('th', { class: 'zahl' }, summe('offen')))))));

  const umsatz = el('section', { class: 'karte' },
    el('h2', {}, 'Umsatz je Leistung'),
    el('p', { class: 'untertitel' }, 'Nur erledigte Termine, mit dem Preis zum Buchungszeitpunkt.'),
    daten.umsatzJeLeistung.length === 0 ? el('p', { class: 'untertitel' }, 'Noch kein Umsatz im Zeitraum.') :
      el('div', { class: 'tabelle-rahmen' }, el('table', { class: 'tabelle' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Leistung'), el('th', { class: 'zahl' }, 'Anzahl'), el('th', { class: 'zahl' }, 'Umsatz'),
          el('th', {}, el('span', { class: 'nur-screenreader' }, 'Anteil')))),
        el('tbody', {}, daten.umsatzJeLeistung.map((u) => {
          const balken = el('div', { class: 'balken' });
          balken.style.width = `${(u.umsatz / maxUmsatz) * 100}%`;
          return el('tr', {},
            el('td', {}, u.name), el('td', { class: 'zahl' }, u.anzahl), el('td', { class: 'zahl' }, euro(u.umsatz)),
            el('td', { class: 'balken-zelle' }, balken));
        })),
        el('tfoot', {}, el('tr', {},
          el('th', {}, 'Gesamt'), el('th', {}), el('th', { class: 'zahl' }, euro(daten.umsatzGesamt)), el('th', {}))))));

  fuelle(ergebnisBereich, el('div', { class: 'raster-2 raster-auswertung' }, wochen, umsatz));
}
