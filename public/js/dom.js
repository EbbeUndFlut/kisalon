// Kleine Hilfsfunktionen für die Darstellung. Inhalte werden immer als Text
// eingefügt (textContent), nie als HTML – so kann kein eingegebener Name
// Skriptcode in die Seite schmuggeln.

/**
 * Erzeugt ein Element: el('button', { class: 'chip', onclick: fn }, 'Text', kindElement)
 * Attribute mit on… werden als Event-Listener registriert, true/false als
 * boolesche Attribute gesetzt, null/undefined ausgelassen.
 */
export function el(tag, attribute = {}, ...kinder) {
  const element = document.createElement(tag);
  for (const [name, wert] of Object.entries(attribute)) {
    if (wert === null || wert === undefined || wert === false) continue;
    if (name.startsWith('on') && typeof wert === 'function') {
      element.addEventListener(name.slice(2), wert);
    } else if (wert === true) {
      element.setAttribute(name, '');
    } else {
      element.setAttribute(name, String(wert));
    }
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    element.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return element;
}

/** Ersetzt den Inhalt eines Containers */
export function fuelle(container, ...kinder) {
  container.replaceChildren();
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    container.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
}

/** Zeigt eine Meldung (art: 'fehler' | 'erfolg' | 'info') in einem Container an */
export function zeigeMeldung(container, text, art = 'fehler') {
  if (!text) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  container.hidden = false;
  container.className = `meldung meldung-${art}`;
  container.setAttribute('role', art === 'fehler' ? 'alert' : 'status');
  container.textContent = text;
}

export const $ = (selektor, wurzel = document) => wurzel.querySelector(selektor);
