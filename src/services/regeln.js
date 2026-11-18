// Buchungsregeln aus dem Gespräch an einer Stelle. Werden sowohl für die
// Liste freier Zeiten als auch für die eigentliche Buchung verwendet, damit
// angezeigte und buchbare Zeiten nie auseinanderlaufen.
import config from '../config.js';
import * as zeit from '../utils/zeit.js';

const { rasterMin, minVorlaufMin, maxVorausMonate } = config.regeln;

/** Letztes buchbares Datum (heute + 3 Monate, R-07) */
function letztesBuchbaresDatum(heute) {
  return zeit.plusMonate(heute, maxVorausMonate);
}

/**
 * Prüft die Regeln, die nur vom Tag abhängen (R-04, R-06, R-07).
 * Liefert eine Meldung oder null.
 */
function tagVerstoss(datum, oeffnung, jetzt) {
  if (datum < jetzt.datum) return 'Das Datum liegt in der Vergangenheit.';
  const letztes = letztesBuchbaresDatum(jetzt.datum);
  if (datum > letztes) {
    return `Termine können höchstens ${maxVorausMonate} Monate im Voraus gebucht werden (bis ${formatDatum(letztes)}).`;
  }
  if (!oeffnung) return 'An diesem Tag ist der Salon geschlossen (Sonntag und Montag Ruhetag).';
  return null;
}

/**
 * Prüft die Regeln für einen konkreten Beginn (R-03, R-05, R-06).
 * startMin = Minuten seit Mitternacht, dauerMin = Gesamtdauer.
 */
function zeitVerstoss(datum, startMin, dauerMin, oeffnung, jetzt) {
  const tag = tagVerstoss(datum, oeffnung, jetzt);
  if (tag) return tag;
  if (startMin % rasterMin !== 0) return 'Termine beginnen nur zur vollen Viertelstunde.';
  if (startMin < oeffnung.von || startMin + dauerMin > oeffnung.bis) {
    return `Der Termin muss komplett in die Öffnungszeit (${zeit.alsUhrzeit(oeffnung.von)}–${zeit.alsUhrzeit(oeffnung.bis)} Uhr) passen. `
      + `Mit ${dauerMin} Minuten Dauer ist der späteste Beginn ${zeit.alsUhrzeit(spaetesterBeginn(oeffnung, dauerMin))} Uhr.`;
  }
  const beginn = zeit.stempel(datum, startMin);
  if (beginn <= jetzt.stempel) return 'Dieser Zeitpunkt liegt in der Vergangenheit.';
  if (beginn - jetzt.stempel < minVorlaufMin) {
    return `Online-Buchungen sind nur bis ${minVorlaufMin / 60} Stunden vor Terminbeginn möglich. Für kurzfristige Termine rufen Sie uns bitte an.`;
  }
  return null;
}

function spaetesterBeginn(oeffnung, dauerMin) {
  const spaetest = oeffnung.bis - dauerMin;
  return spaetest - (((spaetest - oeffnung.von) % rasterMin) + rasterMin) % rasterMin;
}

/**
 * Zwei Zeiträume überschneiden sich, wenn der erste beginnt, bevor der
 * zweite endet, und der erste endet, nachdem der zweite beginnt (R-01).
 */
function ueberschneiden(beginn1, ende1, beginn2, ende2) {
  return beginn1 < ende2 && ende1 > beginn2;
}

/** Ist der Zeitraum frei? belegungen = [{ beginn, ende }] in Minuten-Stempeln */
function istFrei(belegungen, beginn, ende) {
  return !belegungen.some((b) => ueberschneiden(beginn, ende, b.beginn, b.ende));
}

function formatDatum(datum) {
  const [j, m, t] = datum.split('-');
  return `${t}.${m}.${j}`;
}

export {
  letztesBuchbaresDatum, tagVerstoss, zeitVerstoss, spaetesterBeginn,
  ueberschneiden, istFrei, formatDatum,
};
