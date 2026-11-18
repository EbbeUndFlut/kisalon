# Testfälle

Dieses Dokument beschreibt alle automatischen Tests der Anwendung: was sie prüfen, mit welchen
Daten und welches Ergebnis erwartet wird. Die Kürzel wie R-01 oder F-08 verweisen auf die
Anforderungsliste in [anforderungen.md](anforderungen.md).

**Stand:** 18.11.2026 – 28 Tests, alle bestanden (`npm test`, Laufzeit rund 2 Sekunden).

| Datei | Art | Anzahl | Braucht |
|---|---|---|---|
| `tests/regeln.test.js` | Unit-Tests | 12 | nichts (keine Datenbank, kein Server) |
| `tests/api.test.js` | Integrationstests über HTTP | 16 | MySQL und `.env` |

## Ausführen

```bash
npm test
```

Die Tests laufen mit dem eingebauten Test-Runner von Node.js (`node:test`) nacheinander
(`--test-concurrency=1`), weil die API-Tests aufeinander aufbauen und dieselbe Datenbank nutzen.

## Testumgebung der API-Tests

Vor dem ersten Test (`before`) passiert Folgendes:

1. `db/schema.sql` wird in eine **eigene Datenbank `schnittpunkt_test`** eingespielt. Die
   Entwicklungsdatenbank `schnittpunkt` bleibt unberührt.
2. Der Server startet als eigener Prozess auf **Port 3999** gegen diese Datenbank.
3. Die Uhr des Servers wird über `JETZT_UEBERSCHREIBEN` festgestellt auf
   **Montag 10:00 Uhr vor dem ersten Beispieltag**. Dadurch sind Fristen (2 Stunden Vorlauf,
   24 Stunden Stornofrist) an jedem Wochentag gleich prüfbar.

Nach dem letzten Test (`after`) wird der Server beendet. Die Testdatenbank bleibt stehen und wird
beim nächsten Lauf neu angelegt.

### Bezugstage

Die Beispieldaten sind relativ zum Tag des Imports angelegt. Die Tests rechnen genauso:

| Name | Bedeutung | Rolle im Test |
|---|---|---|
| `MONTAG` | Tag vor `TAG1` | „heute“ des Servers, 10:00 Uhr. Ruhetag. |
| `TAG1` | nächster Dienstag (oder heute, falls Dienstag) | Beispieltag mit zehn Terminen |
| `TAG2` | Mittwoch danach | wenige Beispieltermine, freie Plätze für Buchungen |
| `FREITAG` | `TAG1` + 3 Tage | leerer Tag für Buchungs- und Paralleltests |

### Stammdaten aus `db/schema.sql`

| ID | Leistung | Dauer | Preis | | ID | Person | bietet an |
|---|---|---|---|---|---|---|---|
| 1 | Herrenschnitt | 30 Min | 28 € | | 1 | Sabine | alles |
| 2 | Damenschnitt | 45 Min | 42 € | | 2 | Mara | alles |
| 3 | Waschen & Föhnen | 30 Min | 22 € | | 3 | Jonas | 1, 3, 4, 5 (kein Damenschnitt, kein Färben) |
| 4 | Kinderschnitt | 20 Min | 16 € | | | | |
| 5 | Bartpflege | 15 Min | 12 € | | | | |
| 6 | Färben | 90 Min | 75 € | | | | |

Öffnungszeiten: Dienstag bis Freitag 9:00–18:00 Uhr, Samstag 9:00–14:00 Uhr, Sonntag und Montag
geschlossen.
Demo-Stornocode: `00000000-0000-4000-8000-000000000001` (Färben bei Mara, `TAG1` 9:00 Uhr).

---

## Unit-Tests (`tests/regeln.test.js`)

Geprüft werden reine Funktionen aus `utils/zeit.js`, `services/regeln.js` und
`utils/validierung.js`. „Jetzt“ wird als Parameter übergeben, es gibt keine echte Uhr.

### U-01 Datum: gültige und ungültige Kalendertage

| Eingabe `zeit.istDatum(…)` | Erwartet | Grund |
|---|---|---|
| `2026-11-17` | gültig | normales Datum |
| `2026-02-29` | ungültig | 2026 ist kein Schaltjahr |
| `2028-02-29` | gültig | Schaltjahr |
| `17.11.2026` | ungültig | falsches Format |

### U-02 Wochentag nach ISO

`zeit.wochentag` liefert Montag = 1 bis Sonntag = 7: 16.11.2026 → 1, 17.11.2026 → 2,
22.11.2026 → 7. Davon hängt ab, welche Öffnungszeit gilt.

### U-03 Plus drei Monate wird am Monatsende gekürzt

| Eingabe | Erwartet | Grund |
|---|---|---|
| 16.11.2026 + 3 Monate | 16.02.2027 | gleicher Kalendertag |
| 30.11.2026 + 3 Monate | 28.02.2027 | Februar hat keinen 30. |
| 30.11.2027 + 3 Monate | 29.02.2028 | Schaltjahr |

### U-04 DATETIME hin und zurück

`2026-12-31 23:45:00` plus 30 Minuten ergibt `2027-01-01 00:15:00`. Prüft die Umrechnung
zwischen Text und Minutenzahl über Tages-, Monats- und Jahresgrenze.

### U-05 Überschneidung von Zeiträumen (R-01)

| Zeitraum 1 | Zeitraum 2 | Überschneidung | Fall |
|---|---|---|---|
| 0–30 | 30–60 | nein | Ende = Beginn des nächsten |
| 0–31 | 30–60 | ja | eine Minute Überlappung |
| 10–20 | 0–60 | ja | liegt komplett innerhalb |
| 0–60 | 10–20 | ja | umschließt den anderen |

### U-06 Termin muss komplett in die Öffnungszeit passen (R-05)

„Jetzt“ ist Montag 10:00, gebucht wird für Dienstag, Öffnung 9:00–18:00.

| Beginn | Dauer | Erwartet |
|---|---|---|
| 17:45 | 90 Min | Verstoß „Öffnungszeit“ |
| 16:45 | 90 Min | Verstoß, Meldung nennt „späteste Beginn 16:30“ |
| 16:30 | 90 Min | erlaubt (endet genau 18:00) |
| 08:45 | 30 Min | Verstoß „Öffnungszeit“ (vor der Öffnung) |

### U-07 Nicht in der Vergangenheit, mindestens zwei Stunden Vorlauf (R-06)

„Jetzt“ ist Dienstag 10:00.

| Termin | Erwartet |
|---|---|
| heute 09:30 | Verstoß „Vergangenheit“ |
| heute 11:45 | Verstoß „2 Stunden“ (nur 1 h 45 min Vorlauf) |
| heute 12:00 | erlaubt (genau 2 Stunden) |
| gestern 12:00 | Verstoß „Vergangenheit“ |

### U-08 Höchstens drei Monate im Voraus (R-07)

„Jetzt“ ist der 16.11.2026: Der 16.02.2027 ist erlaubt, der 17.02.2027 ergibt den Verstoß
„3 Monate“.

### U-09 Geschlossener Tag (R-04)

Ohne Öffnungszeit für den Wochentag liefert `tagVerstoss` die Meldung „geschlossen“.

### U-10 Viertelstundentakt bei der Validierung (R-03)

| Eingabe `v.uhrzeit(…)` | Erwartet |
|---|---|
| `09:45` | gültig |
| `09:40` | Fehler „Viertelstunde“ |
| `9:00` | Fehler „HH:MM“ (führende Null fehlt) |

### U-11 Validierung von Kontaktdaten

| Feld | Eingabe | Erwartet |
|---|---|---|
| E-Mail | `  Anna.Roth@Example.org ` | `anna.roth@example.org` (getrimmt, klein) |
| E-Mail | `anna@` | Fehler „E-Mail“ |
| Telefon | `+49 (0)151 / 123-456` | unverändert gültig |
| Telefon | `0151 abc` | Fehler „Telefonnummer“ |
| Name | `  Anna   Roth ` | `Anna Roth` (Leerzeichen bereinigt) |
| Name | `A` | Fehler „zu kurz“ |
| Name | `42` (Zahl statt Text) | Fehler „fehlt“ |

### U-12 Validierung von Leistungsauswahl, Preis und Stornocode

| Funktion | Eingabe | Erwartet |
|---|---|---|
| `leistungIds` | `"1,5"` | `[1, 5]` |
| `leistungIds` | `[2]` | `[2]` |
| `leistungIds` | `[1, 1]` | Fehler „doppelte“ |
| `leistungIds` | `[1, 2, 3, 4]` | Fehler „höchstens 3“ |
| `leistungIds` | `[]` | Fehler „mindestens eine“ |
| `mitarbeiterWahl` | `"egal"` | `null` |
| `mitarbeiterWahl` | `"2"` | `2` |
| `preis` | `"28,50"` | `28.5` (deutsches Komma) |
| `preis` | `"1,234"` | Fehler „zwei Nachkommastellen“ |
| `preis` | `-1` | Fehler „zwischen 0“ |
| `stornoCode` | `1' OR '1'='1` | Fehler „ungültig“ (SQL-Injection-Versuch) |

---

## Integrationstests (`tests/api.test.js`)

Jeder Test schickt echte HTTP-Anfragen an den Testserver. Einige prüfen zusätzlich direkt in
der Datenbank, was gespeichert wurde.

### A-01 Leistungen und Mitarbeiter sind öffentlich abrufbar

| Schritt | Erwartet |
|---|---|
| `GET /api/leistungen` | 200, sechs Leistungen |
| `GET /api/mitarbeiter` | Jonas hat die Leistungs-IDs `[1, 3, 4, 5]` |

### A-02 Freie Zeiten sind nur Uhrzeiten, ohne Kundendaten (F-02, N-02)

Anfrage: `GET /api/verfuegbarkeit` für `TAG1`, Färben, Person „egal“.

| Prüfung | Erwartet |
|---|---|
| Status | 200 |
| Felder der Antwort | genau `datum`, `dauerMin`, `hinweis`, `zeiten` |
| Form der Zeiten | alle im Format `HH:MM` |
| erste freie Zeit | `10:15` (Sabine bis 10:15 belegt, Mara bis 12:00) |
| letzte freie Zeit | `16:30` (90 Minuten müssen bis 18:00 passen, R-05) |
| `12:45` | nicht enthalten (beide ab 13:00 bzw. 14:00 belegt) |
| Datenschutz | der Name „Berger“ kommt in der Antwort nicht vor |

### A-03 Färben bei Jonas ist nicht buchbar (R-08)

| Schritt | Erwartet |
|---|---|
| Verfügbarkeit für Färben bei Jonas | 422 |
| Buchung Färben bei Jonas, `TAG2` 12:00 | 422, Meldung enthält „Jonas bietet“ |

### A-04 Montag geschlossen (R-04)

| Schritt | Erwartet |
|---|---|
| Verfügbarkeit für den Montag der Folgewoche | leere Liste, Hinweis „geschlossen“ |
| Buchung an diesem Montag um 10:00 | 422 |

### A-05 Ungültige Eingaben ergeben 400 mit Meldung

Jede dieser Buchungen muss mit 400 und einer Textmeldung im Feld `fehler` enden:

| Fall | Fehlerhafte Eingabe |
|---|---|
| Uhrzeit außerhalb des Rasters | `10:10` |
| Datum existiert nicht | `2026-02-30` |
| E-Mail ungültig | `kein-mail` |
| keine Leistung gewählt | `[]` |
| SQL-Injection-Versuch | `leistungIds: ["1; DROP TABLE termin"]` |
| kaputtes JSON im Body | `{kaputt` |

### A-06 Buchung erfolgreich (F-01, F-03, F-07, W-02)

Buchung: Herrenschnitt + Bartpflege bei Jonas, `FREITAG` 11:00.

| Prüfung | Erwartet |
|---|---|
| Status | 201 |
| Stornocode | 36 Zeichen im UUID-Format |
| Ende | `11:45` (30 + 15 Minuten) |
| Preis | 40 € (28 + 12) |
| Person | Jonas |
| Verfügbarkeit danach (Herrenschnitt bei Jonas) | `10:45`, `11:00`, `11:15`, `11:30` fehlen |
| | `10:30` und `11:45` sind weiterhin frei |

Der letzte Punkt zeigt, dass auch Startzeiten wegfallen, deren Termin in den gebuchten Zeitraum
hineinragen würde (10:45 + 30 Minuten).

### A-07 Doppelbuchung wird abgelehnt (R-01)

Damenschnitt (45 Minuten) bei Sabine am `FREITAG`.

| Schritt | Erwartet |
|---|---|
| Buchung 14:00 | 201 |
| Buchung 14:30 (überschneidet 14:00–14:45) | 409, Code `ZEIT_BELEGT` |
| Buchung 14:45 (direkt im Anschluss) | 201 |

### A-08 Parallele Buchungen für denselben Platz (R-02)

Zwölf Buchungen werden **gleichzeitig** abgeschickt: Herrenschnitt bei Mara, `FREITAG` 16:00,
zwölf verschiedene Kunden.

| Erwartet | Anzahl |
|---|---|
| 201 Created | genau 1 |
| 409 Conflict | genau 11 |

Das ist der Nachweis für die Sperre auf der Mitarbeiter-Zeile
(siehe [architektur.md](architektur.md#5-doppelbuchungen-pessimistische-sperre-auf-der-mitarbeiter-zeile)
und [Sequenzdiagramm 3](sequenzdiagramme.md#3-zwei-gleichzeitige-buchungen-auf-denselben-platz)).

### A-09 „Egal“ verteilt parallele Buchungen auf alle passenden Personen (F-04)

Fünf gleichzeitige Buchungen ohne Personenwahl: Kinderschnitt, Samstag 9:00.
Den Kinderschnitt bieten alle drei an.

| Erwartet | |
|---|---|
| erfolgreiche Buchungen | 3, je eine bei Jonas, Mara und Sabine |
| abgelehnt mit 409 | 2 (niemand mehr frei) |

### A-10 Gleiche E-Mail ergibt denselben Kunden (F-06)

| Schritt | Erwartet |
|---|---|
| Buchung mit `maxi@example.org`, Telefon `0151 111111` | 201 |
| Buchung mit `MAXI@example.org`, Telefon `0151 222222` | 201 |
| Tabelle `kunde` | genau ein Eintrag für diese E-Mail |
| Telefon im Eintrag | `0151 222222` (aktualisiert) |
| Tabelle `termin` | zwei Termine für diesen Kunden |

### A-11 Storno per Code, nur bis 24 Stunden vorher (F-08, F-09, R-10)

Ausgangslage: neue Buchung Herrenschnitt, `TAG2` 17:00 (mehr als 24 Stunden entfernt).

| Schritt | Erwartet |
|---|---|
| Termin über Stornocode anzeigen | `stornierbar: true`, kein Feld `name` (keine Kundendaten) |
| Stornieren | 200, Status `storniert` |
| Noch einmal stornieren | 409 |
| Datenbank | Status `storniert`, `storniert_von = kunde` (Termin nicht gelöscht) |
| Verfügbarkeit `TAG2` | 17:00 ist wieder frei |
| Demo-Termin stornieren (`TAG1` 9:00, nur 23 Stunden entfernt) | 422, Code `STORNOFRIST` |
| unbekannter Code im UUID-Format | 404 |
| Code `kein-code` | 400 |

### A-12 Salon-Bereich nur mit Passwort (N-01, F-12)

| Schritt | Erwartet |
|---|---|
| Termine ohne Anmeldung abrufen | 401 |
| Login mit falschem Passwort | 401 |
| Login mit richtigem Passwort | 204 und Sitzungs-Cookie |
| Termine für `TAG1` mit Cookie | 200 |
| Termin von Katrin Berger | Telefon `0151 234 5555`, bei Mara, Leistung „Färben“ |
| Reihenfolge | nach Beginn sortiert |
| Logout | 204 |
| Termine mit dem alten Cookie | 401 (Sitzung ist ungültig) |

### A-13 Salon storniert jederzeit, erledigt erst ab dem Termintag (F-10, F-11)

| Schritt | Erwartet | Grund |
|---|---|---|
| Termin 8 (morgen 9:00) auf `erledigt` | 422 | liegt in der Zukunft |
| Termin 8 auf `storniert` | 204 | Salon darf auch innerhalb der 24 Stunden |
| Termin 8 zurück auf `gebucht` | 409 | storniert ist endgültig |
| Termin 1 (Vorwoche, erledigt) auf `gebucht` | 204 | Fehlklick zurücknehmen |
| Termin 1 auf `erledigt` | 204 | |
| Termin 1 auf `quatsch` | 400 | unbekannter Status |
| Termin 99999 auf `erledigt` | 404 | gibt es nicht |

### A-14 Leistung anlegen und Preis ändern (F-14, F-15)

| Schritt | Erwartet |
|---|---|
| Leistung „Augenbrauen“ anlegen (15 Min, `9,50`) | 201 |
| Dieselbe Leistung noch einmal anlegen | 409 (Name vergeben) |
| `GET /api/leistungen` | „Augenbrauen“ ist öffentlich sichtbar |
| Herrenschnitt buchen | Preis 28 € |
| Preis des Herrenschnitts auf 30 € ändern | 204 |
| Bereits gebuchten Termin anzeigen | Preis weiterhin 28 € |
| Herrenschnitt neu buchen | Preis 30 € |
| „Augenbrauen“ deaktivieren | 204 |
| „Augenbrauen“ buchen | 422 (wird nicht mehr angeboten) |

### A-15 Freier Tag sperrt die Person für Buchungen (W-03)

| Schritt | Erwartet |
|---|---|
| Freien Tag für Jonas eintragen (Donnerstag der Folgewoche) | 201 |
| Verfügbarkeit für Jonas an diesem Tag | leere Liste, Hinweis enthält „frei“ |
| Buchung bei Jonas an diesem Tag | 422 |
| Buchung mit „egal“ an diesem Tag | zugeteilte Person ist nicht Jonas |
| Freien Tag für Sabine an `TAG1` eintragen (hat dort Termine) | 409 |

### A-16 Auswertung: Umsatz nur aus erledigten Terminen

| Schritt | Erwartet |
|---|---|
| `GET /api/salon/auswertung` für die letzten 14 Tage bis `TAG1` | 200 |
| `umsatzGesamt` | gleich der Summe, die der Test direkt per SQL über erledigte Termine berechnet |
| `wochen` | mindestens ein Eintrag |

---

## Abdeckung der Anforderungen

| Anforderung | Inhalt | Testfälle |
|---|---|---|
| R-01 | keine Überschneidung bei derselben Person | U-05, A-07 |
| R-02 | keine Doppelbuchung bei gleichzeitigen Anfragen | A-08, A-09 |
| R-03 | Viertelstundentakt | U-10, A-05 |
| R-04 | Sonntag und Montag geschlossen | U-09, A-04 |
| R-05 | Termin passt komplett in die Öffnungszeit | U-06, A-02 |
| R-06 | mindestens zwei Stunden Vorlauf | U-07 |
| R-07 | höchstens drei Monate im Voraus | U-03, U-08 |
| R-08 | nur Personen, die die Leistung anbieten | A-01, A-03 |
| R-09 | nur aktive Leistungen sind buchbar | A-14 |
| R-10 | Storno bis 24 Stunden vorher | A-11 |
| F-01, F-03, F-07 | online buchen, Person wählen, Bestätigung mit Stornocode | A-06 |
| F-02, N-02 | freie Zeiten ohne Daten anderer | A-02, A-06, A-11 |
| F-04 | „egal“ wählt eine freie Person | A-09, A-15 |
| F-05 | Name, Telefon und E-Mail werden geprüft | U-11, A-05 |
| F-06 | Kunde wird wiedererkannt | A-10 |
| F-08, F-09 | Storno per Code, Termin bleibt gespeichert | A-11 |
| F-10, F-11 | Salon storniert jederzeit, markiert als erledigt | A-13 |
| F-12, N-01 | Tagesübersicht mit Kundendaten nur mit Passwort | A-12 |
| F-14, F-15 | Leistungen anlegen, ändern, deaktivieren | A-14 |
| N-04 | serverseitige Validierung, kein SQL über Eingaben | U-11, U-12, A-05 |
| W-02 | mehrere Leistungen in einem Termin | A-06 |
| W-03 | freie Tage | A-15 |
| W-05 | Auswertung | A-16 |

Ohne automatischen Test bleiben F-13 (Blättern), F-16 (Meldungen in der Oberfläche), N-03, N-05,
N-06, W-01 (E-Mail), W-04 (Wochenansicht) und der Status „nicht erschienen“ aus W-05.

## Nicht automatisch getestet

Diese Punkte sind umgesetzt, haben aber keinen automatischen Test:

| Bereich | Was fehlt |
|---|---|
| Frontend | Die Seiten in `public/` werden nur von Hand geprüft. Es gibt keine Browser-Tests. |
| Vorlauf und Drei-Monats-Grenze über die API | R-06 und R-07 sind nur als Unit-Test abgedeckt, nicht über `POST /api/termine`. |
| Login-Sperre | Die Sperre nach fünf Fehlversuchen (429) wird nicht ausgelöst. |
| Freien Tag löschen | `DELETE /api/salon/freie-tage/:id` hat keinen Test. |
| Wochenansicht | `GET /api/salon/termine?von=&bis=` und die Grenze von 92 Tagen sind ungetestet. |
| Bestätigungs-E-Mail | Inhalt und Versand (`services/mail.js`) werden nicht geprüft. |
| Freier Tag gleichzeitig mit einer Buchung | Die in [architektur.md](architektur.md#bekannte-grenzen) beschriebene Lücke hat keinen Test. |
