# ER-Diagramm

GitHub, GitLab und VS Code (mit Mermaid-Unterstützung) stellen das Diagramm direkt dar.
Eine Kopie steht in der README.

```mermaid
erDiagram
    KUNDE ||--o{ TERMIN : "bucht"
    MITARBEITER ||--o{ TERMIN : "führt aus"
    TERMIN ||--|{ TERMIN_LEISTUNG : "enthält"
    LEISTUNG ||--o{ TERMIN_LEISTUNG : "wird gebucht in"
    MITARBEITER ||--o{ MITARBEITER_LEISTUNG : "kann"
    LEISTUNG ||--o{ MITARBEITER_LEISTUNG : "wird angeboten von"
    MITARBEITER ||--o{ FREIER_TAG : "hat"

    KUNDE {
        int kunde_id PK
        varchar name "NOT NULL"
        varchar telefon "NOT NULL"
        varchar email UK "NOT NULL"
        datetime erstellt_am
    }
    MITARBEITER {
        int mitarbeiter_id PK
        varchar name UK "NOT NULL"
        boolean aktiv
    }
    LEISTUNG {
        int leistung_id PK
        varchar name UK "NOT NULL"
        smallint dauer_min "5 bis 480"
        decimal preis ">= 0"
        boolean aktiv
    }
    MITARBEITER_LEISTUNG {
        int mitarbeiter_id PK,FK
        int leistung_id PK,FK
    }
    TERMIN {
        int termin_id PK
        int kunde_id FK
        int mitarbeiter_id FK
        datetime beginn "NOT NULL"
        datetime ende "> beginn"
        enum status "gebucht|erledigt|storniert|nicht_erschienen"
        char storno_code UK "UUID"
        datetime erstellt_am
        datetime storniert_am "NULL"
        enum storniert_von "kunde|salon, NULL"
    }
    TERMIN_LEISTUNG {
        int termin_id PK,FK
        int leistung_id PK,FK
        tinyint position "Reihenfolge"
        smallint dauer_min "Stand bei Buchung"
        decimal preis "Stand bei Buchung"
    }
    FREIER_TAG {
        int freier_tag_id PK
        int mitarbeiter_id FK
        date datum "UK mit mitarbeiter_id"
        varchar grund "NULL"
    }
    OEFFNUNGSZEIT {
        tinyint wochentag PK "1=Mo bis 7=So"
        time oeffnet
        time schliesst
    }
```

## Beziehungen

| Beziehung | Kardinalität | Umsetzung |
|---|---|---|
| Kunde – Termin | 1 : n (ein Kunde hat beliebig viele Termine, ein Termin genau einen Kunden) | `termin.kunde_id` FK |
| Mitarbeiter – Termin | 1 : n | `termin.mitarbeiter_id` FK |
| Mitarbeiter – Leistung | n : m („wer welche Leistung macht“) | Zuordnungstabelle `mitarbeiter_leistung` |
| Termin – Leistung | n : m (Bonus: Schnitt und Bart in einem Termin) | Zuordnungstabelle `termin_leistung` |
| Mitarbeiter – Freier Tag | 1 : n | `freier_tag.mitarbeiter_id` FK |
| Öffnungszeit | eigenständig (Stammdaten) | – |

## Normalisierung

* **1. NF:** Jede Zelle enthält genau einen Wert. Mehrere Leistungen pro Termin stehen als eigene
  Zeilen in `termin_leistung`, nicht als Liste in `termin`.
* **2. NF:** In den Tabellen mit zusammengesetztem Schlüssel (`mitarbeiter_leistung`,
  `termin_leistung`) hängt kein Attribut nur von einem Teil des Schlüssels ab. Der Name der
  Leistung steht nur in `leistung`.
* **3. NF:** Kundendaten stehen nur in `kunde`, im Termin bleibt nur `kunde_id`.
* **Bewusste Abweichung:** `termin_leistung.preis` und `dauer_min` wiederholen Werte aus
  `leistung`. Das ist Absicht: Sie halten den Stand zum Buchungszeitpunkt fest, damit eine
  Preisänderung bereits gebuchte Termine und die Umsatzauswertung nicht verändert.
  `termin.ende` ist aus `beginn` und der Dauer ableitbar, wird aber gespeichert, damit die
  Überschneidungsprüfung eine einfache, indizierbare Abfrage bleibt.
