/**
 * Erzeugt einen Fehler mit HTTP-Statuscode und verständlicher Meldung
 * für die Oberfläche. code ist ein maschinenlesbarer Kurzname
 * (z. B. "ZEIT_BELEGT"), details optional (z. B. Feldfehler).
 */
export function httpFehler(status, meldung, { code, details } = {}) {
  const err = new Error(meldung);
  err.status = status;
  err.code = code;
  err.details = details;
  err.istHttpFehler = true;
  return err;
}

export const fehler = {
  ungueltig: (meldung, details) => httpFehler(400, meldung, { code: 'UNGUELTIG', details }),
  nichtAngemeldet: (meldung = 'Bitte melden Sie sich im Salon-Bereich an.') =>
    httpFehler(401, meldung, { code: 'NICHT_ANGEMELDET' }),
  nichtGefunden: (meldung) => httpFehler(404, meldung, { code: 'NICHT_GEFUNDEN' }),
  konflikt: (meldung, code = 'KONFLIKT') => httpFehler(409, meldung, { code }),
  regel: (meldung, code = 'REGELVERSTOSS') => httpFehler(422, meldung, { code }),
  zuVieleVersuche: (meldung) => httpFehler(429, meldung, { code: 'ZU_VIELE_VERSUCHE' }),
};