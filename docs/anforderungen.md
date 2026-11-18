# Anforderungsliste – Online-Terminbuchung Schnittpunkt

Grundlage ist das Gesprächsprotokoll mit Sabine Kowalski (Inhaberin). Jede Anforderung
verweist wörtlich auf die Aussage im Protokoll. IDs: **F** Funktion, **R** Regel,
**D** Daten, **N** nicht-funktional, **W** Wunsch.

Spalte „Umsetzung“ verweist auf die Stelle im Code bzw. die Route, an der die Anforderung
erfüllt wird. Spalte „Test“ beschreibt, wie die Anforderung geprüft werden kann
(automatisiert in `tests/api.test.js`, sonst manuell).

## Vorgehen

1. Protokoll einmal ganz gelesen.
2. Satz für Satz klassifiziert: D (Daten), F (Funktion), R (Regel), W (Wunsch), ? (unklar), – (Rauschen).
3. Pro Sachverhalt eine prüfbare Anforderung formuliert, große Anforderungen geteilt
   (z. B. die Buchungsregeln in R-03 bis R-09).
4. Unklares als offene Frage gesammelt und mit einer Annahme beantwortet (siehe unten und README).

## Satzweise Klassifikation des Protokolls

| # | Aussage (gekürzt) | Art | → Anforderung |
|---|---|---|---|
| 1 | „Per Telefon und im Salon, mit einem Papierkalender. Das nervt mich schon lange.“ | – | Ausgangslage |
| 2 | „denselben Termin zweimal vergeben, weil zwei Leute gleichzeitig angerufen haben … Das darf nie wieder passieren.“ | R | R-01, R-02 |
| 3 | „Meine Kundschaft soll im Internet selbst einen Termin buchen können, auch abends um zehn.“ | F, N | F-01, N-03 |
| 4 | „Ich will morgens nur noch in den Rechner schauen und sehen, wer wann kommt.“ | F | F-12 |
| 5 | „Herrenschnitt, 30 Minuten, 28 Euro … Färben, das dauert 90 Minuten und kostet 75 Euro.“ | D | D-03 |
| 6 | „Preise ändern sich mal, das möchte ich selbst anpassen können“ | F | F-15 |
| 7 | „Auch neue Leistungen will ich selbst eintragen.“ | F | F-14 |
| 8 | „Wir sind zu dritt: Mara, Jonas und ich.“ | D | D-02 |
| 9 | „Mara und ich färben, Jonas nicht … Herren, Kinder und Bart, und Waschen und Föhnen“ | D | D-04 |
| 10 | „Wer welche Leistung macht, muss die Anwendung wissen, sonst bucht jemand Färben bei Jonas.“ | R | R-08 |
| 11 | „viele wollen zu Mara oder zu Jonas“ | F | F-03 |
| 12 | „Wer keinen Wunsch hat, soll ‚egal‘ wählen können, dann nimmt die Anwendung jemanden, der frei ist.“ | F | F-04 |
| 13 | „Mir ist wichtig, dass jede Person nur einen Termin gleichzeitig hat.“ | R | R-01 |
| 14 | „Dienstag bis Freitag von 9 bis 18 Uhr, samstags von 9 bis 14 Uhr. Sonntag und Montag ist zu.“ | D, R | D-06, R-04 |
| 15 | „Ein Termin muss komplett in die Öffnungszeit passen … 17:45 Uhr eine Färbung … geht das nicht.“ | R | R-05 |
| 16 | „Gebucht wird im Viertelstundentakt, also 9:00, 9:15, 9:30“ | R | R-03 |
| 17 | „Name, Telefonnummer und E-Mail.“ | D | D-01, F-05 |
| 18 | „Ein Konto mit Passwort will keiner, das schreckt ab.“ | N | F-05 |
| 19 | „Wer schon mal da war, soll nicht alles neu tippen müssen, die Daten dürfen also gespeichert bleiben.“ | F, D | F-06 |
| 20 | „Die Kundendaten sehe nur ich und mein Team.“ | N | N-01, N-02 |
| 21 | „Auf der Buchungsseite darf niemand sehen, wer sonst noch gebucht hat. Dort reicht, dass ein Zeitfenster belegt ist.“ | N | N-02, F-02 |
| 22 | „Bis 24 Stunden vorher darf die Kundschaft selbst stornieren, danach nur über mich.“ | R | R-10 |
| 23 | „Ohne Login, aber so, dass nicht jeder fremde Termine löschen kann.“ | F, N | F-08 |
| 24 | „Ich selbst muss jeden Termin jederzeit stornieren können.“ | F | F-10 |
| 25 | „Die Termine will ich nicht löschen, ich möchte später noch sehen, was storniert wurde.“ | D | F-09 |
| 26 | „Und wenn jemand da war, hake ich das ab.“ | F | F-11 |
| 27 | „Nichts in der Vergangenheit natürlich.“ | R | R-06 |
| 28 | „mindestens zwei Stunden vorher, danach nur telefonisch“ | R | R-06 |
| 29 | „nicht ewig weit voraus, drei Monate reichen“ | R | R-07 |
| 30 | „Ein Tag auf einen Blick: wer kommt wann, zu wem, wofür, mit Telefonnummer.“ | F | F-12 |
| 31 | „Am liebsten pro Mitarbeiter eine Spalte.“ | F | F-12 |
| 32 | „Und ich will durch die Tage blättern können.“ | F | F-13 |
| 33 | „Den Bereich soll nicht jeder aufrufen können, ein Passwort für mich und das Team reicht“ | N | N-01 |
| 34 | „Schön wäre eine Bestätigungs-E-Mail.“ | W | W-01 |
| 35 | „Manche wollen Schnitt und Bart in einem Termin“ | W | W-02 |
| 36 | „Lena … im ersten Monat nur dienstags da, so etwas wie freie Tage pro Person wäre gut.“ | W | W-03 |
| 37 | „Aber zuerst muss das Wichtige laufen.“ | – | Priorisierung: Muss vor Kann |
| 38 | „unser Instagram-Account ist neu, den könnte man verlinken“ | W | W-06 |
| 39 | „die Kaffeemaschine ist kaputt“ | – | Rauschen, nicht übernommen |

## Funktionale Anforderungen

| ID | Anforderung | Fundstelle im Protokoll | Prio | Umsetzung | Test |
|---|---|---|---|---|---|
| F-01 | Kundinnen und Kunden buchen online selbst einen Termin, ohne den Salon anzurufen. | „Meine Kundschaft soll im Internet selbst einen Termin buchen können“ | Muss | `public/index.html`, `POST /api/termine` | Buchung im Browser; Test „Buchung erfolgreich“ |
| F-02 | Die Buchungsseite zeigt nur freie Uhrzeiten an; belegte Zeitfenster werden nicht angeboten. | „Dort reicht, dass ein Zeitfenster belegt ist.“ | Muss | `GET /api/verfuegbarkeit`, `src/services/verfuegbarkeit.js` | Gebuchte Zeit fehlt danach in der Liste |
| F-03 | Kundinnen und Kunden wählen bei der Buchung eine bestimmte Person. | „viele wollen zu Mara oder zu Jonas“ | Muss | Schritt 2 der Buchungsseite | Buchung mit `mitarbeiterId` landet bei dieser Person |
| F-04 | Wer „egal“ wählt, bekommt automatisch eine Person zugewiesen, die zu dieser Zeit frei ist und die Leistung anbietet. | „soll ‚egal‘ wählen können, dann nimmt die Anwendung jemanden, der frei ist“ | Muss | `waehlePerson()` in `src/services/buchung.js` | Test „egal wählt freie Person“ |
| F-05 | Für die Buchung werden Name, Telefonnummer und E-Mail abgefragt; ein Kundenkonto mit Passwort gibt es nicht. | „Name, Telefonnummer und E-Mail. Ein Konto mit Passwort will keiner“ | Muss | Formular Schritt 4, Validierung `src/utils/validierung.js` | Fehlende Felder → 400 mit Meldung |
| F-06 | Bekannte Kundinnen und Kunden werden über die E-Mail wiedererkannt (kein doppelter Datensatz); auf dem eigenen Gerät werden die Kontaktdaten auf Wunsch vorausgefüllt. | „Wer schon mal da war, soll nicht alles neu tippen müssen, die Daten dürfen also gespeichert bleiben.“ | Muss | `kunde.email UNIQUE`, Upsert in `buchung.js`, `localStorage` in `booking.js` | Zweite Buchung mit gleicher E-Mail → gleiche `kunde_id` |
| F-07 | Nach der Buchung erhält man eine Bestätigung mit Termin, Person, Preis und Stornocode. | Pflichtumfang: „Bestätigung mit Stornocode“; Protokoll Nr. 23 | Muss | Bestätigungsansicht `booking.js` | Antwort 201 enthält `stornoCode` |
| F-08 | Kundinnen und Kunden stornieren ohne Login mit einem schwer erratbaren Code (UUID) nur ihren eigenen Termin. | „Ohne Login, aber so, dass nicht jeder fremde Termine löschen kann.“ | Muss | `public/storno.html`, `POST /api/termine/code/:code/stornierung` | Unbekannter Code → 404 |
| F-09 | Stornierte Termine werden nicht gelöscht, sondern mit Status, Zeitpunkt und Auslöser gespeichert und bleiben im Salon-Bereich sichtbar. | „Die Termine will ich nicht löschen, ich möchte später noch sehen, was storniert wurde.“ | Muss | Spalten `status`, `storniert_am`, `storniert_von` | Nach Storno ist der Termin mit Status `storniert` abrufbar |
| F-10 | Der Salon kann jeden noch nicht abgeschlossenen Termin jederzeit stornieren, auch kurzfristig. | „Ich selbst muss jeden Termin jederzeit stornieren können.“ | Muss | `PATCH /api/salon/termine/:id` | Salon storniert Termin in 1 h → 200 |
| F-11 | Der Salon markiert einen Termin als erledigt. | „Und wenn jemand da war, hake ich das ab.“ | Muss | `PATCH /api/salon/termine/:id` mit `status: "erledigt"` | Status wechselt, Umsatz zählt |
| F-12 | Der Salon sieht eine Tagesübersicht mit Uhrzeit, Person, Leistung, Kundenname und Telefonnummer, eine Spalte pro Mitarbeiter. | „Ein Tag auf einen Blick: wer kommt wann, zu wem, wofür, mit Telefonnummer. Am liebsten pro Mitarbeiter eine Spalte.“ | Muss | `public/salon.html` Ansicht „Tag“, `GET /api/salon/termine?datum=` | Manuell mit Beispieldaten |
| F-13 | In der Tagesübersicht kann man zum vorherigen/nächsten Tag und zu „Heute“ blättern. | „Und ich will durch die Tage blättern können.“ | Muss | Buttons „‹ Zurück / Heute / Weiter ›“ | Manuell |
| F-14 | Der Salon legt neue Leistungen mit Name, Dauer, Preis und ausführenden Personen an. | „Auch neue Leistungen will ich selbst eintragen.“ | Muss | `POST /api/salon/leistungen` | Test „Leistung anlegen“ |
| F-15 | Der Salon ändert Preis, Dauer, Name und Zuordnung bestehender Leistungen und kann sie deaktivieren. | „Preise ändern sich mal, das möchte ich selbst anpassen können“ | Muss | `PUT /api/salon/leistungen/:id` | Test „Preis ändern“ |
| F-16 | Fehler und Erfolg werden in verständlichen deutschen Meldungen angezeigt. | Pflichtumfang Frontend | Muss | `HttpError`-Meldungen, `meldung()` im Frontend | Regelverstoß → Meldung nennt die Regel |

## Regeln

| ID | Anforderung | Fundstelle im Protokoll | Prio | Umsetzung | Test |
|---|---|---|---|---|---|
| R-01 | Eine Person hat zur selben Zeit höchstens einen Termin. Zwei Zeiträume überschneiden sich, wenn `beginn1 < ende2` und `ende1 > beginn2`. Stornierte Termine blockieren nicht. | „jede Person nur einen Termin gleichzeitig“ | Muss | `findeKonflikte()` in `buchung.js` | Test „Doppelbuchung wird abgelehnt (409)“ |
| R-02 | Auch bei gleichzeitig eintreffenden Anfragen entsteht keine Doppelbuchung (Prüfen und Speichern in einer Transaktion mit gesperrter Mitarbeiter-Zeile). | „weil zwei Leute gleichzeitig angerufen haben … Das darf nie wieder passieren.“ | Muss | `SELECT … FOR UPDATE` in `buchung.js` | Test „R-02: parallele Buchungen … genau eine gewinnt“ |
| R-03 | Termine beginnen im 15-Minuten-Raster (xx:00, xx:15, xx:30, xx:45). | „Gebucht wird im Viertelstundentakt, also 9:00, 9:15, 9:30“ | Muss | `validierung.js`, Slot-Schleife | `uhrzeit: "10:10"` → 400 |
| R-04 | Buchbar sind nur Öffnungstage: Di–Fr 9–18 Uhr, Sa 9–14 Uhr; So und Mo geschlossen. | „Dienstag bis Freitag von 9 bis 18 Uhr, samstags von 9 bis 14 Uhr. Sonntag und Montag ist zu.“ | Muss | Tabelle `oeffnungszeit` | Montag → 422 „geschlossen“ |
| R-05 | Ein Termin liegt vollständig in der Öffnungszeit; die Dauer ergibt sich aus der Leistung (Summe bei mehreren Leistungen). | „Ein Termin muss komplett in die Öffnungszeit passen. Wenn jemand um 17:45 Uhr eine Färbung buchen will, geht das nicht.“ | Muss | `ende = beginn + Σ dauer_min` | Färben 17:00 → 422; letzte Färbung 16:30 |
| R-06 | Nichts in der Vergangenheit; Beginn mindestens 2 Stunden nach dem aktuellen Zeitpunkt. | „Nichts in der Vergangenheit natürlich … mindestens zwei Stunden vorher, danach nur telefonisch.“ | Muss | `MIN_VORLAUF_MIN = 120` in `src/config.js` | Termin in 1 h → 422 mit Hinweis aufs Telefon |
| R-07 | Höchstens 3 Monate im Voraus (bis einschließlich zum gleichen Kalendertag drei Monate später). | „nicht ewig weit voraus, drei Monate reichen“ | Muss | `MAX_VORAUS_MONATE = 3` | Datum in 4 Monaten → 422 |
| R-08 | Nur Personen, die alle gewählten Leistungen anbieten, sind wählbar bzw. werden bei „egal“ gewählt. | „Wer welche Leistung macht, muss die Anwendung wissen, sonst bucht jemand Färben bei Jonas.“ | Muss | Tabelle `mitarbeiter_leistung` | Färben bei Jonas → 422 |
| R-09 | Nur aktive Leistungen und aktive Personen sind buchbar. | Folgt aus F-15 (Leistung deaktivieren) | Muss | `aktiv`-Spalten | Deaktivierte Leistung → 422 |
| R-10 | Kundinnen und Kunden stornieren selbst nur bis 24 Stunden vor Beginn; danach lehnt das System mit Hinweis auf den Salon ab. | „Bis 24 Stunden vorher darf die Kundschaft selbst stornieren, danach nur über mich.“ | Muss | `STORNO_FRIST_STD = 24` | Test „Storno per Code, nur bis 24 h vorher“ (→ 422) |

## Daten

| ID | Anforderung | Fundstelle im Protokoll | Prio | Umsetzung |
|---|---|---|---|---|
| D-01 | Kunde: Name, Telefonnummer, E-Mail (eindeutig). | „Name, Telefonnummer und E-Mail.“ | Muss | Tabelle `kunde` |
| D-02 | Mitarbeiter: Name; die Inhaberin arbeitet selbst mit. | „Wir sind zu dritt: Mara, Jonas und ich.“ | Muss | Tabelle `mitarbeiter` |
| D-03 | Leistung: Name, Dauer in Minuten, Preis in Euro. Startdaten: Herrenschnitt 30/28, Damenschnitt 45/42, Waschen & Föhnen 30/22, Kinderschnitt 20/16, Bartpflege 15/12, Färben 90/75. | „Herrenschnitt, 30 Minuten, 28 Euro …“ | Muss | Tabelle `leistung` |
| D-04 | n:m-Zuordnung, wer welche Leistung ausführt. | „Mara und ich färben, Jonas nicht“ | Muss | Tabelle `mitarbeiter_leistung` |
| D-05 | Termin: Kunde, Person, Beginn, Ende (DATETIME), Status, Stornocode; Leistungen mit Preis zum Buchungszeitpunkt. | „sehen, wer wann kommt“; „was storniert wurde“ | Muss | Tabellen `termin`, `termin_leistung` |
| D-06 | Öffnungszeiten pro Wochentag. | „Dienstag bis Freitag von 9 bis 18 Uhr …“ | Muss | Tabelle `oeffnungszeit` |

## Nicht-funktionale Anforderungen

| ID | Anforderung | Fundstelle im Protokoll | Prio | Umsetzung |
|---|---|---|---|---|
| N-01 | Der Salon-Bereich ist durch ein gemeinsames Passwort geschützt; das Passwort steht nicht im Code, sondern (gehasht) in `.env`. | „ein Passwort für mich und das Team reicht, nichts Kompliziertes“ | Muss | `src/middleware/auth.js`, `SALON_PASSWORT_HASH` |
| N-02 | Öffentliche Routen liefern keine Daten anderer Kunden – nur freie Uhrzeiten, keine Namen. Kundendaten gibt es nur im Salon-Bereich. | „Auf der Buchungsseite darf niemand sehen, wer sonst noch gebucht hat.“; „Die Kundendaten sehe nur ich und mein Team.“ | Muss | `GET /api/verfuegbarkeit` liefert `["09:00", …]` |
| N-03 | Die Buchung ist rund um die Uhr möglich (keine Bedienzeiten). | „auch abends um zehn“ | Muss | Webanwendung ohne Zeitsperre |
| N-04 | Alle SQL-Abfragen verwenden Platzhalter; alle Eingaben werden serverseitig validiert. | Pflichtumfang Backend | Muss | `src/db.js`, `src/utils/validierung.js` |
| N-05 | Zugangsdaten und Datenbankeinstellungen stehen in `.env`. | Pflichtumfang Backend | Muss | `src/config.js` |
| N-06 | Bedienbar auf dem Smartphone (responsive). | Bonus; Buchung „auch abends um zehn“ geschieht oft am Handy | Kann | `public/css/style.css` |

## Wünsche (Kann)

| ID | Anforderung | Fundstelle im Protokoll | Prio | Status |
|---|---|---|---|---|
| W-01 | Nach der Buchung wird eine Bestätigungs-E-Mail mit Stornocode erzeugt (Konsole; echter Versand, wenn SMTP in `.env` konfiguriert ist). | „Schön wäre eine Bestätigungs-E-Mail.“ | Kann | umgesetzt (`src/services/mail.js`) |
| W-02 | Mehrere Leistungen (max. 3) in einem Termin bei derselben Person, Dauer und Preis werden addiert. | „Manche wollen Schnitt und Bart in einem Termin“ | Kann | umgesetzt (`termin_leistung`) |
| W-03 | Freie Tage pro Person, die bei der Buchung berücksichtigt werden. | „so etwas wie freie Tage pro Person wäre gut“ | Kann | umgesetzt (`freier_tag`, Salon → „Freie Tage“) |
| W-04 | Wochenansicht im Salon-Bereich. | Bonus der Aufgabe; „sehen, wer wann kommt“ | Kann | umgesetzt |
| W-05 | Status „nicht erschienen“ und Auswertung (Termine pro Woche, Umsatz je Leistung). | Bonus der Aufgabe; „wenn jemand da war, hake ich das ab“ | Kann | umgesetzt |
| W-06 | Link auf den Instagram-Account. | „unser Instagram-Account ist neu, den könnte man verlinken“ | Kann | nicht umgesetzt – kein Account-Name bekannt, Randbemerkung ohne Auftrag |

Nicht übernommen: die kaputte Kaffeemaschine (kein Bezug zur Anwendung).

## Offene Fragen und getroffene Annahmen

| Frage an die Auftraggeberin | Annahme / Entscheidung | Betrifft |
|---|---|---|
| Woran wird ein wiederkehrender Kunde erkannt? | An der **E-Mail-Adresse** (`UNIQUE`). Telefonnummern werden oft unterschiedlich geschrieben und von Familien geteilt. Name und Telefon werden bei jeder Buchung auf den neuesten Stand gebracht. | F-06, D-01 |
| Sollen bekannte Daten beim Tippen der E-Mail vorgeschlagen werden? | **Nein** – sonst könnte jeder durch Eingabe einer fremden E-Mail Name und Telefonnummer sehen (Widerspruch zu N-02). Stattdessen speichert der Browser die eigenen Daten lokal (`localStorage`, abwählbar). | F-06, N-02 |
| Was gilt für gebuchte Termine, wenn sich ein Preis ändert? | Es gilt der **Preis zum Buchungszeitpunkt**. Er wird in `termin_leistung.preis` gespeichert (bewusste Abweichung von der 3. NF). | F-15 |
| Darf eine gebuchte Leistung gelöscht werden? | **Nein**, Leistungen werden **deaktiviert** (`aktiv = FALSE`), damit alte Termine und die Auswertung erhalten bleiben (`ON DELETE RESTRICT`). | F-14, F-15 |
| Wer wird bei „egal“ gewählt, wenn mehrere frei sind? | Die Person mit den **wenigsten Terminen an diesem Tag** (gleichmäßige Auslastung), bei Gleichstand die mit der kleineren ID. | F-04 |
| Gibt es Pausen, Feiertage, Urlaub? | Keine festen Pausen. Urlaub/Krankheit/Feiertage werden als **freie Tage pro Person** eingetragen (W-03). | R-04, W-03 |
| Darf die Kundschaft einen Termin ändern? | Nein, Ändern = stornieren und neu buchen (bis 24 h vorher). | R-10 |
| Mehrere Leistungen in einem Termin: eine oder mehrere Personen? | Eine Person führt alle Leistungen eines Termins nacheinander aus; nur Personen, die **alle** gewählten Leistungen anbieten, sind wählbar. | W-02, R-08 |
| Wie lange gilt „3 Monate“? | Bis einschließlich zum gleichen Kalendertag drei Monate später (am Monatsende gekürzt: 30.11. → 28.02.). | R-07 |
| Darf der Salon Termine nach Ablauf der Frist zurücksetzen? | „erledigt“ und „nicht erschienen“ können auf „gebucht“ zurückgesetzt werden (Fehlklick). „storniert“ ist endgültig, weil der Platz inzwischen neu vergeben sein kann. | F-09, F-11 |
