// Einheitliche JSON-Fehlerantworten: { fehler: "Meldung", code, details }
// Unerwartete Fehler werden geloggt; die Oberfläche bekommt eine neutrale
// Meldung ohne interne Details (keine SQL-Texte o. Ä.).

function nichtGefunden(req, res) {
  res.status(404).json({ fehler: 'Diese Adresse gibt es nicht.', code: 'NICHT_GEFUNDEN' });
}

// eslint-disable-next-line no-unused-vars
function fehlerbehandlung(err, req, res, next) {
  if (err.istHttpFehler) {
    res.status(err.status).json({ fehler: err.message, code: err.code, details: err.details });
    return;
  }
  // Fehler von express.json() bei kaputtem JSON oder zu großem Body
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ fehler: 'Die Anfrage enthält kein gültiges JSON.', code: 'UNGUELTIG' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ fehler: 'Die Anfrage ist zu groß.', code: 'ZU_GROSS' });
    return;
  }
  if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT') {
    res.status(503).json({ fehler: 'Gerade ist viel los. Bitte versuchen Sie es gleich noch einmal.', code: 'BESCHAEFTIGT' });
    return;
  }
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    fehler: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut oder rufen Sie uns an.',
    code: 'SERVERFEHLER',
  });
}

export { nichtGefunden, fehlerbehandlung };
