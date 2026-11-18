// Dünne Schicht über fetch: JSON senden/empfangen, Fehler einheitlich werfen.
// Jede Funktion entspricht genau einer REST-Route des Backends.

/**
 * Führt eine Anfrage aus. Bei HTTP-Fehlern wird ein Error mit der
 * verständlichen Meldung des Servers (err.message), dem Status und dem
 * Fehlercode geworfen.
 */
async function anfrage(methode, pfad, daten) {
  const optionen = { method: methode, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (daten !== undefined) {
    optionen.headers['Content-Type'] = 'application/json';
    optionen.body = JSON.stringify(daten);
  }

  let antwort;
  try {
    antwort = await fetch(pfad, optionen);
  } catch {
    throw apiFehler(0, 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.', 'NETZWERK');
  }

  if (antwort.status === 204) return null;
  const inhalt = await antwort.json().catch(() => null);
  if (!antwort.ok) {
    throw apiFehler(
      antwort.status,
      inhalt?.fehler || `Die Anfrage ist fehlgeschlagen (Status ${antwort.status}).`,
      inhalt?.code,
    );
  }
  return inhalt;
}

function apiFehler(status, meldung, code) {
  const err = new Error(meldung);
  err.status = status;
  err.code = code;
  return err;
}

function query(parameter) {
  return new URLSearchParams(parameter).toString();
}

// ---------- öffentlich ----------
export const ladeLeistungen = () => anfrage('GET', '/api/leistungen');
export const ladeMitarbeiter = () => anfrage('GET', '/api/mitarbeiter');
export const ladeEinstellungen = () => anfrage('GET', '/api/einstellungen');
export const ladeFreieZeiten = ({ datum, leistungIds, mitarbeiter }) =>
  anfrage('GET', `/api/verfuegbarkeit?${query({ datum, leistungen: leistungIds.join(','), mitarbeiter })}`);
export const bucheTermin = (daten) => anfrage('POST', '/api/termine', daten);
export const ladeTerminNachCode = (code) => anfrage('GET', `/api/termine/code/${encodeURIComponent(code)}`);
export const storniereNachCode = (code) =>
  anfrage('POST', `/api/termine/code/${encodeURIComponent(code)}/stornierung`);

// ---------- Salon-Bereich ----------
export const salon = {
  login: (passwort) => anfrage('POST', '/api/salon/login', { passwort }),
  logout: () => anfrage('POST', '/api/salon/logout'),
  sitzung: () => anfrage('GET', '/api/salon/sitzung'),
  termine: (von, bis) => anfrage('GET', `/api/salon/termine?${query(von === bis ? { datum: von } : { von, bis })}`),
  setzeStatus: (id, status) => anfrage('PATCH', `/api/salon/termine/${id}`, { status }),
  mitarbeiter: () => anfrage('GET', '/api/salon/mitarbeiter'),
  leistungen: () => anfrage('GET', '/api/salon/leistungen'),
  legeLeistungAn: (daten) => anfrage('POST', '/api/salon/leistungen', daten),
  aendereLeistung: (id, daten) => anfrage('PUT', `/api/salon/leistungen/${id}`, daten),
  freieTage: (von, bis) => anfrage('GET', `/api/salon/freie-tage?${query({ von, bis })}`),
  legeFreienTagAn: (daten) => anfrage('POST', '/api/salon/freie-tage', daten),
  loescheFreienTag: (id) => anfrage('DELETE', `/api/salon/freie-tage/${id}`),
  auswertung: (von, bis) => anfrage('GET', `/api/salon/auswertung?${query({ von, bis })}`),
};
