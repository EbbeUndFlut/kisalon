# Sequenzdiagramme

Die Diagramme zeigen die wichtigsten Abläufe der Anwendung so, wie sie im Code stehen.
GitHub, GitLab und VS Code (mit Mermaid-Unterstützung) stellen sie direkt dar.
Die Begründung der Entscheidungen dahinter steht in [architektur.md](architektur.md).

| Nr. | Ablauf | Code |
|---|---|---|
| 1 | [Buchungsseite laden und freie Zeiten anzeigen](#1-buchungsseite-laden-und-freie-zeiten-anzeigen) | `public/js/buchung.js`, `services/verfuegbarkeit.js` |
| 2 | [Termin buchen](#2-termin-buchen) | `routes/oeffentlich.js`, `services/buchung.js` |
| 3 | [Zwei gleichzeitige Buchungen auf denselben Platz](#3-zwei-gleichzeitige-buchungen-auf-denselben-platz) | `services/buchung.js`, `db.js` |
| 4 | [Termin per Stornocode stornieren](#4-termin-per-stornocode-stornieren) | `public/js/storno.js`, `services/buchung.js` |
| 5 | [Anmeldung im Salon-Bereich und Tagesübersicht](#5-anmeldung-im-salon-bereich-und-tagesübersicht) | `middleware/auth.js`, `routes/salon.js` |
| 6 | [Status eines Termins im Salon ändern](#6-status-eines-termins-im-salon-ändern) | `services/salon.js` |
| 7 | [Freien Tag eintragen](#7-freien-tag-eintragen) | `services/salon.js` |

Beteiligte in allen Diagrammen:

* **Browser** – die jeweilige Seite (`buchung.js`, `storno.js`, `salon*.js`) über `api.js`
* **Route** – Express-Router mit Validierung (`utils/validierung.js`)
* **Dienst** – Fachlogik in `services/`
* **MySQL** – Datenbank über `mysql2` (Pool oder Verbindung einer Transaktion)

---

## 1. Buchungsseite laden und freie Zeiten anzeigen

Beim Start lädt die Seite die Stammdaten parallel. Sobald Leistung und Datum gewählt sind,
fragt sie die freien Zeiten ab. Der Server liefert nur Uhrzeiten, keine Termine.

```mermaid
sequenceDiagram
    autonumber
    actor K as Kundin
    participant B as Browser (buchung.js)
    participant R as Route (oeffentlich.js)
    participant V as Dienst (verfuegbarkeit.js)
    participant G as regeln.js
    participant DB as MySQL

    K->>B: öffnet die Buchungsseite
    par Stammdaten parallel laden
        B->>R: GET /api/leistungen
        R-->>B: 200 aktive Leistungen
    and
        B->>R: GET /api/mitarbeiter
        R-->>B: 200 aktive Personen mit Leistungs-IDs
    and
        B->>R: GET /api/einstellungen
        R-->>B: 200 heute, letztes Datum, Öffnungszeiten
    end
    B-->>K: Leistungen, Personen, Datumswahl

    K->>B: wählt Leistung(en), Person oder egal, Datum
    B->>R: GET /api/verfuegbarkeit?datum&leistungen&mitarbeiter
    R->>R: Eingaben validieren (400 bei falschem Format)
    R->>V: freieZeiten(datum, leistungIds, mitarbeiterId)
    V->>DB: aktive Leistungen laden
    DB-->>V: Dauer und Preis je Leistung
    V->>DB: Öffnungszeit des Wochentags
    DB-->>V: von, bis oder nichts
    V->>G: tagVerstoss(datum, oeffnung, jetzt)

    alt Tag nicht buchbar (geschlossen, Vergangenheit, über 3 Monate)
        G-->>V: Meldung
        V-->>R: zeiten leer, hinweis gesetzt
    else Tag buchbar
        G-->>V: kein Verstoß
        V->>DB: Kandidaten (aktiv, bieten alle Leistungen an, kein freier Tag)
        DB-->>V: Personen
        V->>DB: Belegungen der Kandidaten (Status nicht storniert)
        DB-->>V: Zeiträume je Person
        loop jeder Rasterpunkt von Öffnung bis Schluss minus Dauer
            V->>G: zeitVerstoss(…) und istFrei(…) je Kandidat
            G-->>V: buchbar, wenn mindestens eine Person frei ist
        end
        V-->>R: zeiten als Liste von Uhrzeiten
    end

    R-->>B: 200 { datum, dauerMin, zeiten, hinweis }
    Note over B: Antwort wird verworfen, wenn inzwischen<br/>eine neuere Anfrage unterwegs ist (Anfragezähler)
    B-->>K: freie Uhrzeiten oder Hinweis
```

## 2. Termin buchen

Der Erfolgsfall mit allen Prüfungen. Prüfen und Speichern liegen in einer Transaktion;
die E-Mail wird erst nach dem Commit ausgelöst und hält die Antwort nicht auf.

```mermaid
sequenceDiagram
    autonumber
    actor K as Kundin
    participant B as Browser (buchung.js)
    participant R as Route (oeffentlich.js)
    participant S as Dienst (buchung.js)
    participant G as regeln.js
    participant DB as MySQL
    participant M as mail.js

    K->>B: wählt Uhrzeit, füllt Kontaktdaten aus, sendet ab
    B->>B: Vorprüfung der Felder (nur Bedienhilfe)
    B->>R: POST /api/termine
    R->>R: alle Felder validieren (400 bei falschem Format)
    R->>S: bucheTermin(eingabe)

    S->>DB: READ COMMITTED setzen, BEGIN
    S->>DB: aktive Leistungen laden
    DB-->>S: Dauer und Preis
    S->>DB: Öffnungszeit des Tages
    DB-->>S: von, bis
    S->>G: zeitVerstoss(datum, start, dauer, oeffnung, jetzt)
    G-->>S: kein Verstoß (sonst 422 BUCHUNGSREGEL)
    S->>DB: Kandidaten laden
    DB-->>S: Personen (leer ergibt 422 PERSON_NICHT_MOEGLICH)

    rect rgba(128, 128, 128, 0.15)
        Note over S,DB: Kritischer Abschnitt: ab hier wartet jede andere<br/>Buchung für dieselben Personen
        S->>DB: SELECT … FROM mitarbeiter WHERE id IN (…) ORDER BY id FOR UPDATE
        DB-->>S: Zeilen gesperrt
        S->>DB: Belegungen der Kandidaten am Tag
        DB-->>S: Zeiträume je Person
        S->>S: waehlePerson: frei und wenigste Termine, dann kleinste ID
        S->>DB: INSERT kunde … ON DUPLICATE KEY UPDATE (Wiedererkennung über E-Mail)
        DB-->>S: kunde_id
        S->>DB: INSERT termin (mit Stornocode aus randomUUID)
        DB-->>S: termin_id
        loop je Leistung
            S->>DB: INSERT termin_leistung (Position, Dauer und Preis zum Buchungszeitpunkt)
        end
        S->>DB: COMMIT (gibt die Sperre frei)
    end

    S-->>R: Termin mit Stornocode
    R-)M: sendeBestaetigung (ohne await)
    R-->>B: 201 Created, Location: /api/termine/code/…
    B->>B: Kontaktdaten in localStorage merken (wenn gewünscht)
    B-->>K: Bestätigung mit Stornocode
    M-)K: E-Mail mit Stornolink (SMTP) oder Ausgabe in der Konsole

    Note over B,R: Fehlerfall: Bei 409 oder 422 zeigt der Browser die Meldung<br/>des Servers und lädt die freien Zeiten neu.
```

## 3. Zwei gleichzeitige Buchungen auf denselben Platz

Beide Kundinnen sehen 10:00 Uhr bei Mara als frei und senden gleichzeitig ab.
Die Sperre auf der Mitarbeiter-Zeile sorgt dafür, dass die zweite Transaktion wartet und
danach den Termin der ersten sieht.

```mermaid
sequenceDiagram
    autonumber
    actor A as Kundin A
    actor Z as Kunde B
    participant TA as Transaktion A
    participant TB as Transaktion B
    participant DB as MySQL

    A->>TA: POST /api/termine (Mara, 10:00)
    Z->>TB: POST /api/termine (Mara, 10:00)

    TA->>DB: BEGIN, Regeln prüfen, Kandidaten laden
    TB->>DB: BEGIN, Regeln prüfen, Kandidaten laden
    Note over TA,TB: Bis hierher sehen beide: 10:00 ist frei

    TA->>DB: SELECT mitarbeiter (Mara) FOR UPDATE
    DB-->>TA: Sperre erhalten
    TB->>DB: SELECT mitarbeiter (Mara) FOR UPDATE
    Note over TB,DB: B wartet auf die Zeilensperre

    TA->>DB: Belegungen lesen
    DB-->>TA: 10:00 frei
    TA->>DB: INSERT kunde, termin, termin_leistung
    TA->>DB: COMMIT
    DB-->>TA: bestätigt, Sperre frei
    TA-->>A: 201 Created

    DB-->>TB: Sperre erhalten
    TB->>DB: Belegungen lesen
    DB-->>TB: 10:00 belegt durch A (READ COMMITTED liest den bestätigten Stand)
    TB->>TB: waehlePerson findet niemanden
    TB->>DB: ROLLBACK
    TB-->>Z: 409 ZEIT_BELEGT
    Note over Z: Browser zeigt die Meldung und lädt<br/>die freien Zeiten neu, 10:00 fehlt jetzt
```

Bei „egal“ sperrt jede Transaktion alle Kandidaten in aufsteigender ID-Reihenfolge. Kunde B
bekäme dann nach dem Warten die nächste freie Person zugeteilt und ebenfalls 201. Die feste
Reihenfolge verhindert, dass sich zwei Transaktionen gegenseitig blockieren.

## 4. Termin per Stornocode stornieren

Die Stornoseite braucht keine Anmeldung. Sie zeigt nur Daten des eigenen Termins.
Das Stornieren ist zweistufig, und der Server prüft die Frist unter einer Zeilensperre erneut.

```mermaid
sequenceDiagram
    autonumber
    actor K as Kundin
    participant B as Browser (storno.js)
    participant R as Route (oeffentlich.js)
    participant S as Dienst (buchung.js)
    participant DB as MySQL

    K->>B: öffnet /storno?code=… aus der E-Mail
    B->>B: Form des Codes prüfen (UUID)
    B->>R: GET /api/termine/code/:code
    R->>S: ladeTerminNachCode(code)
    S->>DB: Termin mit Leistungen über storno_code
    DB-->>S: Zeilen oder nichts (404)
    S->>S: stornoPruefung: Status gebucht und mindestens 24 h bis Beginn
    S-->>R: Termin ohne Kundendaten, stornierbar, hinweis
    R-->>B: 200
    B-->>K: Termin und Knopf „Termin stornieren“ (oder Hinweis auf die Frist)

    K->>B: klickt „Termin stornieren“
    B-->>K: Rückfrage „Wirklich stornieren?“
    K->>B: bestätigt

    B->>R: POST /api/termine/code/:code/stornierung
    R->>S: storniereNachCode(code)
    S->>DB: BEGIN
    S->>DB: SELECT termin WHERE storno_code = ? FOR UPDATE
    DB-->>S: Termin (gesperrt)
    S->>S: stornoPruefung erneut

    alt Status gebucht und Frist eingehalten
        S->>DB: UPDATE termin SET status = storniert, storniert_am, storniert_von = kunde
        S->>DB: COMMIT
        S->>DB: Termin neu laden
        DB-->>S: Termin mit Status storniert
        S-->>R: Termin
        R-->>B: 200
        B-->>K: „Ihr Termin wurde storniert“
    else Termin schon storniert oder abgeschlossen
        S->>DB: ROLLBACK
        R-->>B: 409 STATUS
        B-->>K: Meldung des Servers
    else weniger als 24 Stunden bis zum Beginn
        S->>DB: ROLLBACK
        R-->>B: 422 STORNOFRIST
        B-->>K: „Bitte rufen Sie uns an“
    end

    Note over DB: Der Termin bleibt gespeichert. Weil stornierte Termine bei den<br/>Belegungen nicht zählen, ist der Platz sofort wieder buchbar.
```

## 5. Anmeldung im Salon-Bereich und Tagesübersicht

Die Sitzung liegt im Arbeitsspeicher des Servers, der Browser hält nur eine zufällige ID in
einem `HttpOnly`-Cookie. Jede geschützte Route läuft durch die Middleware `nurSalon`.

```mermaid
sequenceDiagram
    autonumber
    actor T as Team
    participant B as Browser (salon.js)
    participant R as Route (salon.js)
    participant A as auth.js
    participant S as Dienst (salon.js)
    participant DB as MySQL

    T->>B: öffnet /salon
    B->>R: GET /api/einstellungen
    R-->>B: 200 heute, Öffnungszeiten
    B->>R: GET /api/salon/sitzung
    R->>A: nurSalon (Cookie prüfen)
    A-->>R: keine gültige Sitzung
    R-->>B: 401 NICHT_ANGEMELDET
    B-->>T: Anmeldeformular

    T->>B: gibt das Passwort ein
    B->>R: POST /api/salon/login { passwort }
    R->>A: anmelden(req, res, passwort)
    A->>A: Sperre für diese IP prüfen

    alt IP gesperrt (5 Fehlversuche, 15 Minuten)
        A-->>R: Fehler
        R-->>B: 429 ZU_VIELE_VERSUCHE
    else Passwort falsch
        A->>A: scrypt und timingSafeEqual, Fehlversuch zählen
        A-->>R: Fehler
        R-->>B: 401 „Das Passwort ist falsch“
    else Passwort richtig
        A->>A: scrypt und timingSafeEqual
        A->>A: Sitzungs-ID aus randomBytes(32), Ablauf merken
        A-->>R: Set-Cookie salon_sitzung (HttpOnly, SameSite=Strict, Path=/api/salon)
        R-->>B: 204 No Content
    end

    B->>R: GET /api/salon/termine?datum=… (Cookie wird mitgesendet)
    R->>A: nurSalon
    A-->>R: Sitzung gültig
    par drei Abfragen parallel
        R->>S: ladeTermine(von, bis)
        S->>DB: Termine mit Kunde, Person, Leistungen
        DB-->>S: Zeilen
    and
        R->>S: ladeMitarbeiter()
        S->>DB: Personen
        DB-->>S: Zeilen
    and
        R->>S: ladeFreieTage(von, bis)
        S->>DB: freie Tage
        DB-->>S: Zeilen
    end
    R-->>B: 200 { mitarbeiter, freieTage, termine }
    B-->>T: Tagesübersicht mit einer Spalte je Person

    Note over B,R: Läuft die Sitzung ab, antwortet jede Salon-Route mit 401.<br/>Der Browser zeigt dann wieder das Anmeldeformular.
```

## 6. Status eines Termins im Salon ändern

Erlaubte Wechsel: `gebucht` → `erledigt`, `nicht_erschienen`, `storniert`; `erledigt` und
`nicht_erschienen` lassen sich zurücksetzen; `storniert` ist endgültig.

```mermaid
sequenceDiagram
    autonumber
    actor T as Team
    participant B as Browser (salon-kalender.js)
    participant R as Route (salon.js)
    participant S as Dienst (salon.js)
    participant DB as MySQL

    T->>B: klickt auf einen Termin, wählt neuen Status
    B->>R: PATCH /api/salon/termine/:id { status }
    R->>R: nurSalon, ID und Status validieren
    R->>S: setzeStatus(id, status)
    S->>DB: BEGIN
    S->>DB: SELECT termin WHERE termin_id = ? FOR UPDATE
    DB-->>S: Termin (gesperrt) oder nichts

    alt Termin nicht gefunden
        S->>DB: ROLLBACK
        R-->>B: 404 NICHT_GEFUNDEN
    else Status unverändert
        S->>DB: COMMIT (nichts zu tun)
        R-->>B: 204 No Content
    else Wechsel nicht erlaubt (zum Beispiel storniert → gebucht)
        S->>DB: ROLLBACK
        R-->>B: 409 STATUS
    else erledigt oder nicht erschienen vor dem Termintag
        S->>DB: ROLLBACK
        R-->>B: 422 REGELVERSTOSS
    else Wechsel erlaubt
        S->>DB: UPDATE termin SET status (bei Storno zusätzlich storniert_am, storniert_von = salon)
        S->>DB: COMMIT
        S-->>R: fertig
        R-->>B: 204 No Content
        B->>R: GET /api/salon/termine?datum=…
        R-->>B: 200 aktuelle Termine
        B-->>T: Übersicht mit neuem Status
    end
```

Die Zeilensperre sorgt dafür, dass eine gleichzeitige Stornierung durch die Kundin (Diagramm 4)
und ein Statuswechsel im Salon nacheinander ablaufen. Wer zuerst kommt, gewinnt; die zweite
Anfrage sieht den neuen Status und bekommt 409.

## 7. Freien Tag eintragen

Ein freier Tag darf nur eingetragen werden, wenn die Person an dem Tag keine gebuchten Termine
hat. Die Transaktion sperrt dieselbe Mitarbeiter-Zeile wie die Buchung (Diagramm 2), sodass
beide Vorgänge nicht gleichzeitig im kritischen Abschnitt sein können.

```mermaid
sequenceDiagram
    autonumber
    actor T as Team
    participant B as Browser (salon-verwaltung.js)
    participant R as Route (salon.js)
    participant S as Dienst (salon.js)
    participant DB as MySQL

    T->>B: wählt Person, Datum, optional Grund
    B->>R: POST /api/salon/freie-tage
    R->>R: nurSalon, Eingaben validieren
    R->>S: legeFreienTagAn(mitarbeiterId, datum, grund)
    S->>DB: BEGIN
    S->>DB: SELECT name FROM mitarbeiter WHERE id = ? FOR UPDATE
    DB-->>S: Person (gesperrt) oder nichts (400)
    S->>DB: gebuchte Termine der Person an diesem Tag zählen
    DB-->>S: Anzahl

    alt Person hat noch gebuchte Termine
        S->>DB: ROLLBACK
        R-->>B: 409 TERMINE_VORHANDEN
        B-->>T: „… hat noch n gebuchte Termine. Bitte zuerst stornieren oder umbuchen.“
    else kein Termin an diesem Tag
        S->>DB: INSERT freier_tag
        alt UNIQUE (mitarbeiter_id, datum) verletzt
            DB-->>S: ER_DUP_ENTRY
            S->>DB: ROLLBACK
            R-->>B: 409 DOPPELT
        else gespeichert
            DB-->>S: freier_tag_id
            S->>DB: COMMIT
            S-->>R: id
            R-->>B: 201 Created
            B-->>T: Liste der freien Tage mit neuem Eintrag
        end
    end

    Note over DB: Ab jetzt schließt die Kandidatenabfrage die Person für diesen Tag aus.<br/>Verfügbarkeit, Buchung und „egal“ berücksichtigen das ohne weitere Änderung.
```
