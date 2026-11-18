-- =====================================================================
--  Schnittpunkt – Online-Terminbuchung
--  Schema und Beispieldaten (MySQL 8.0)
--
--  Ausführen:  mysql -u root -p < db/schema.sql
--          oder npm run db:init   (liest die Zugangsdaten aus .env)
--
--  ACHTUNG: Das Skript löscht eine vorhandene Datenbank "schnittpunkt".
--
--  Zeitformat: Alle Zeitpunkte sind lokale Salonzeit (Europe/Berlin) und
--  werden als DATETIME ohne Zeitzone gespeichert.
-- =====================================================================

DROP DATABASE IF EXISTS schnittpunkt;
CREATE DATABASE schnittpunkt
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE schnittpunkt;

-- ---------------------------------------------------------------------
-- Öffnungszeiten: eine Zeile pro geöffnetem Wochentag (ISO: 1 = Montag).
-- Geschlossene Tage (So, Mo) haben keine Zeile.
-- ---------------------------------------------------------------------
CREATE TABLE oeffnungszeit (
  wochentag   TINYINT UNSIGNED NOT NULL,
  oeffnet     TIME             NOT NULL,
  schliesst   TIME             NOT NULL,
  CONSTRAINT pk_oeffnungszeit PRIMARY KEY (wochentag),
  CONSTRAINT chk_oeffnungszeit_tag  CHECK (wochentag BETWEEN 1 AND 7),
  CONSTRAINT chk_oeffnungszeit_zeit CHECK (schliesst > oeffnet)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Kunde: wird über die E-Mail-Adresse wiedererkannt (UNIQUE).
-- ---------------------------------------------------------------------
CREATE TABLE kunde (
  kunde_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)  NOT NULL,
  telefon     VARCHAR(30)   NOT NULL,
  email       VARCHAR(254)  NOT NULL,
  erstellt_am DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_kunde PRIMARY KEY (kunde_id),
  CONSTRAINT uq_kunde_email UNIQUE (email)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Mitarbeiter: "aktiv" statt Löschen, damit alte Termine erhalten bleiben.
-- ---------------------------------------------------------------------
CREATE TABLE mitarbeiter (
  mitarbeiter_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(50)  NOT NULL,
  aktiv          BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_mitarbeiter PRIMARY KEY (mitarbeiter_id),
  CONSTRAINT uq_mitarbeiter_name UNIQUE (name)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Leistung: aktueller Preis und aktuelle Dauer.
-- Wird nie gelöscht, sondern deaktiviert (aktiv = FALSE).
-- ---------------------------------------------------------------------
CREATE TABLE leistung (
  leistung_id INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60)       NOT NULL,
  dauer_min   SMALLINT UNSIGNED NOT NULL,
  preis       DECIMAL(6,2)      NOT NULL,
  aktiv       BOOLEAN           NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_leistung PRIMARY KEY (leistung_id),
  CONSTRAINT uq_leistung_name UNIQUE (name),
  CONSTRAINT chk_leistung_dauer CHECK (dauer_min BETWEEN 5 AND 480),
  CONSTRAINT chk_leistung_preis CHECK (preis >= 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Zuordnung n:m – wer führt welche Leistung aus?
-- ---------------------------------------------------------------------
CREATE TABLE mitarbeiter_leistung (
  mitarbeiter_id INT UNSIGNED NOT NULL,
  leistung_id    INT UNSIGNED NOT NULL,
  CONSTRAINT pk_mitarbeiter_leistung PRIMARY KEY (mitarbeiter_id, leistung_id),
  CONSTRAINT fk_ml_mitarbeiter FOREIGN KEY (mitarbeiter_id)
    REFERENCES mitarbeiter (mitarbeiter_id) ON DELETE CASCADE,
  CONSTRAINT fk_ml_leistung FOREIGN KEY (leistung_id)
    REFERENCES leistung (leistung_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Termin: Beginn und Ende als DATETIME, Ende = Beginn + Summe der Dauer.
-- Termine werden nie gelöscht, eine Stornierung setzt nur den Status.
-- ---------------------------------------------------------------------
CREATE TABLE termin (
  termin_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kunde_id       INT UNSIGNED NOT NULL,
  mitarbeiter_id INT UNSIGNED NOT NULL,
  beginn         DATETIME     NOT NULL,
  ende           DATETIME     NOT NULL,
  status         ENUM('gebucht', 'erledigt', 'storniert', 'nicht_erschienen')
                              NOT NULL DEFAULT 'gebucht',
  storno_code    CHAR(36)     NOT NULL,
  erstellt_am    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  storniert_am   DATETIME     NULL,
  storniert_von  ENUM('kunde', 'salon') NULL,
  CONSTRAINT pk_termin PRIMARY KEY (termin_id),
  CONSTRAINT uq_termin_storno_code UNIQUE (storno_code),
  CONSTRAINT fk_termin_kunde FOREIGN KEY (kunde_id)
    REFERENCES kunde (kunde_id) ON DELETE RESTRICT,
  CONSTRAINT fk_termin_mitarbeiter FOREIGN KEY (mitarbeiter_id)
    REFERENCES mitarbeiter (mitarbeiter_id) ON DELETE RESTRICT,
  CONSTRAINT chk_termin_zeitraum CHECK (ende > beginn),
  CONSTRAINT chk_termin_storno CHECK (
    (status = 'storniert' AND storniert_am IS NOT NULL AND storniert_von IS NOT NULL)
    OR (status <> 'storniert' AND storniert_am IS NULL AND storniert_von IS NULL)
  )
) ENGINE = InnoDB;

-- Überschneidungsprüfung und Tagesübersicht suchen nach Person + Zeitraum
CREATE INDEX idx_termin_mitarbeiter_beginn ON termin (mitarbeiter_id, beginn);
CREATE INDEX idx_termin_beginn ON termin (beginn);

-- ---------------------------------------------------------------------
-- Leistungen eines Termins (n:m, Bonus "Schnitt und Bart in einem Termin").
-- preis und dauer_min sind der Stand bei der Buchung (bewusste Abweichung
-- von der 3. NF, siehe README: spätere Preisänderungen ändern alte
-- Termine und die Umsatzauswertung nicht).
-- ---------------------------------------------------------------------
CREATE TABLE termin_leistung (
  termin_id   INT UNSIGNED      NOT NULL,
  leistung_id INT UNSIGNED      NOT NULL,
  position    TINYINT UNSIGNED  NOT NULL,
  dauer_min   SMALLINT UNSIGNED NOT NULL,
  preis       DECIMAL(6,2)      NOT NULL,
  CONSTRAINT pk_termin_leistung PRIMARY KEY (termin_id, leistung_id),
  CONSTRAINT uq_termin_leistung_position UNIQUE (termin_id, position),
  CONSTRAINT fk_tl_termin FOREIGN KEY (termin_id)
    REFERENCES termin (termin_id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_leistung FOREIGN KEY (leistung_id)
    REFERENCES leistung (leistung_id) ON DELETE RESTRICT,
  CONSTRAINT chk_tl_dauer CHECK (dauer_min > 0),
  CONSTRAINT chk_tl_preis CHECK (preis >= 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Freie Tage pro Mitarbeiter (Bonus): an diesen Tagen nicht buchbar.
-- ---------------------------------------------------------------------
CREATE TABLE freier_tag (
  freier_tag_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  mitarbeiter_id INT UNSIGNED NOT NULL,
  datum          DATE         NOT NULL,
  grund          VARCHAR(100) NULL,
  CONSTRAINT pk_freier_tag PRIMARY KEY (freier_tag_id),
  CONSTRAINT uq_freier_tag UNIQUE (mitarbeiter_id, datum),
  CONSTRAINT fk_freier_tag_mitarbeiter FOREIGN KEY (mitarbeiter_id)
    REFERENCES mitarbeiter (mitarbeiter_id) ON DELETE CASCADE
) ENGINE = InnoDB;


-- =====================================================================
--  Beispieldaten
-- =====================================================================

INSERT INTO oeffnungszeit (wochentag, oeffnet, schliesst) VALUES
  (2, '09:00', '18:00'),   -- Dienstag
  (3, '09:00', '18:00'),   -- Mittwoch
  (4, '09:00', '18:00'),   -- Donnerstag
  (5, '09:00', '18:00'),   -- Freitag
  (6, '09:00', '14:00');   -- Samstag

INSERT INTO mitarbeiter (mitarbeiter_id, name) VALUES
  (1, 'Sabine'),
  (2, 'Mara'),
  (3, 'Jonas');

INSERT INTO leistung (leistung_id, name, dauer_min, preis) VALUES
  (1, 'Herrenschnitt',     30, 28.00),
  (2, 'Damenschnitt',      45, 42.00),
  (3, 'Waschen & Föhnen',  30, 22.00),
  (4, 'Kinderschnitt',     20, 16.00),
  (5, 'Bartpflege',        15, 12.00),
  (6, 'Färben',            90, 75.00);

-- Sabine und Mara: alles. Jonas: Herren, Kinder, Bart, Waschen & Föhnen.
INSERT INTO mitarbeiter_leistung (mitarbeiter_id, leistung_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6),
  (2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6),
  (3, 1), (3, 3), (3, 4), (3, 5);

INSERT INTO kunde (kunde_id, name, telefon, email) VALUES
  (1,  'Katrin Berger',  '0151 234 5555', 'k.berger@example.org'),
  (2,  'Tim Weiß',       '0170 998 1122', 'tim.weiss@example.org'),
  (3,  'Anna Roth',      '0151 111 2233', 'anna.roth@example.org'),
  (4,  'Lisa Hahn',      '0176 998 1212', 'lisa.hahn@example.org'),
  (5,  'Paul Klein',     '0160 455 7788', 'paul.klein@example.org'),
  (6,  'Emma Schulz',    '0157 321 6655', 'emma.schulz@example.org'),
  (7,  'Noah Fischer',   '0152 777 8899', 'noah.fischer@example.org'),
  (8,  'Mia Wagner',     '0171 222 3344', 'mia.wagner@example.org'),
  (9,  'Ben Becker',     '0172 555 6677', 'ben.becker@example.org'),
  (10, 'Sophie Hoffmann','0163 888 9900', 'sophie.hoffmann@example.org');

-- Freier Tag als Beispiel: Jonas hat am übernächsten Samstag frei.
-- Die Termine werden relativ zum Ausführungsdatum angelegt, damit die
-- Tagesübersicht nach dem Import nicht leer ist:
--   @tag1 = nächster Dienstag (oder heute, falls heute Dienstag ist)
--   @tag2 = Mittwoch danach, @vorwoche = Dienstag eine Woche zuvor
SET @tag1     = CURDATE() + INTERVAL ((3 - DAYOFWEEK(CURDATE()) + 7) % 7) DAY;
SET @tag2     = @tag1 + INTERVAL 1 DAY;
SET @vorwoche = @tag1 - INTERVAL 7 DAY;
SET @vorwoche2 = @tag1 - INTERVAL 4 DAY;   -- Freitag der Vorwoche

INSERT INTO freier_tag (mitarbeiter_id, datum, grund) VALUES
  (3, @tag1 + INTERVAL 11 DAY, 'Berufsschule');

-- Termine. Der Stornocode 00000000-0000-4000-8000-000000000001 ist ein
-- fester Demo-Code (siehe README), alle anderen sind zufällig (UUID()).
INSERT INTO termin (termin_id, kunde_id, mitarbeiter_id, beginn, ende, status,
                    storno_code, storniert_am, storniert_von) VALUES
  -- Vorwoche (für Auswertung und Status "erledigt"/"nicht erschienen")
  (1,  3, 1, TIMESTAMP(@vorwoche, '09:30'), TIMESTAMP(@vorwoche, '10:15'), 'erledigt',         UUID(), NULL, NULL),
  (2,  2, 3, TIMESTAMP(@vorwoche, '10:00'), TIMESTAMP(@vorwoche, '10:45'), 'erledigt',         UUID(), NULL, NULL),
  (3,  6, 2, TIMESTAMP(@vorwoche, '11:00'), TIMESTAMP(@vorwoche, '12:30'), 'erledigt',         UUID(), NULL, NULL),
  (4,  7, 3, TIMESTAMP(@vorwoche, '14:00'), TIMESTAMP(@vorwoche, '14:20'), 'nicht_erschienen', UUID(), NULL, NULL),
  (5,  8, 2, TIMESTAMP(@vorwoche2, '15:00'), TIMESTAMP(@vorwoche2, '15:45'), 'erledigt',       UUID(), NULL, NULL),
  (6,  9, 3, TIMESTAMP(@vorwoche2, '09:00'), TIMESTAMP(@vorwoche2, '09:30'), 'erledigt',       UUID(), NULL, NULL),
  (7, 10, 1, TIMESTAMP(@vorwoche2, '16:00'), TIMESTAMP(@vorwoche2, '16:30'), 'storniert',      UUID(),
       TIMESTAMP(@vorwoche2 - INTERVAL 2 DAY, '18:12'), 'kunde'),

  -- Tag 1 (wie im Designvorschlag)
  (8,  1, 2, TIMESTAMP(@tag1, '09:00'), TIMESTAMP(@tag1, '10:30'), 'gebucht',
       '00000000-0000-4000-8000-000000000001', NULL, NULL),
  (9,  2, 3, TIMESTAMP(@tag1, '09:00'), TIMESTAMP(@tag1, '09:30'), 'gebucht',   UUID(), NULL, NULL),
  (10, 2, 3, TIMESTAMP(@tag1, '09:30'), TIMESTAMP(@tag1, '09:45'), 'gebucht',   UUID(), NULL, NULL),
  (11, 3, 1, TIMESTAMP(@tag1, '09:30'), TIMESTAMP(@tag1, '10:15'), 'gebucht',   UUID(), NULL, NULL),
  (12, 4, 2, TIMESTAMP(@tag1, '10:30'), TIMESTAMP(@tag1, '12:00'), 'gebucht',   UUID(), NULL, NULL),
  (13, 6, 3, TIMESTAMP(@tag1, '10:30'), TIMESTAMP(@tag1, '10:50'), 'storniert', UUID(),
       TIMESTAMP(@tag1 - INTERVAL 3 DAY, '20:41'), 'kunde'),
  (14, 5, 3, TIMESTAMP(@tag1, '11:00'), TIMESTAMP(@tag1, '11:30'), 'gebucht',   UUID(), NULL, NULL),
  (15, 7, 1, TIMESTAMP(@tag1, '13:00'), TIMESTAMP(@tag1, '13:45'), 'gebucht',   UUID(), NULL, NULL),
  (16, 8, 2, TIMESTAMP(@tag1, '14:00'), TIMESTAMP(@tag1, '14:30'), 'gebucht',   UUID(), NULL, NULL),
  (17, 9, 3, TIMESTAMP(@tag1, '15:00'), TIMESTAMP(@tag1, '15:45'), 'gebucht',   UUID(), NULL, NULL),
  (18,10, 1, TIMESTAMP(@tag1, '16:00'), TIMESTAMP(@tag1, '17:30'), 'gebucht',   UUID(), NULL, NULL),

  -- Tag 2
  (19, 6, 2, TIMESTAMP(@tag2, '09:00'), TIMESTAMP(@tag2, '09:45'), 'gebucht',   UUID(), NULL, NULL),
  (20, 5, 3, TIMESTAMP(@tag2, '10:00'), TIMESTAMP(@tag2, '10:30'), 'gebucht',   UUID(), NULL, NULL),
  (21, 4, 1, TIMESTAMP(@tag2, '11:15'), TIMESTAMP(@tag2, '12:00'), 'gebucht',   UUID(), NULL, NULL);

-- Leistungen je Termin mit Preis und Dauer zum Buchungszeitpunkt
INSERT INTO termin_leistung (termin_id, leistung_id, position, dauer_min, preis) VALUES
  (1, 2, 1, 45, 42.00),
  (2, 1, 1, 30, 28.00), (2, 5, 2, 15, 12.00),   -- Schnitt + Bart
  (3, 6, 1, 90, 75.00),
  (4, 4, 1, 20, 16.00),
  (5, 2, 1, 45, 42.00),
  (6, 1, 1, 30, 28.00),
  (7, 3, 1, 30, 22.00),
  (8, 6, 1, 90, 75.00),
  (9, 1, 1, 30, 28.00),
  (10, 5, 1, 15, 12.00),
  (11, 2, 1, 45, 42.00),
  (12, 6, 1, 90, 75.00),
  (13, 4, 1, 20, 16.00),
  (14, 3, 1, 30, 22.00),
  (15, 2, 1, 45, 42.00),
  (16, 3, 1, 30, 22.00),
  (17, 1, 1, 30, 28.00), (17, 5, 2, 15, 12.00),  -- Schnitt + Bart
  (18, 6, 1, 90, 75.00),
  (19, 2, 1, 45, 42.00),
  (20, 1, 1, 30, 28.00),
  (21, 2, 1, 45, 42.00);


-- =====================================================================
--  Beispielabfragen (werden auch von der Anwendung so verwendet)
-- =====================================================================

-- Tagesübersicht: wer kommt wann, zu wem, wofür, mit Telefonnummer
-- SELECT t.termin_id, t.beginn, t.ende, t.status, m.name AS mitarbeiter,
--        k.name AS kunde, k.telefon,
--        GROUP_CONCAT(l.name ORDER BY tl.position SEPARATOR ' + ') AS leistungen
--   FROM termin t
--   JOIN mitarbeiter m      ON m.mitarbeiter_id = t.mitarbeiter_id
--   JOIN kunde k            ON k.kunde_id = t.kunde_id
--   JOIN termin_leistung tl ON tl.termin_id = t.termin_id
--   JOIN leistung l         ON l.leistung_id = tl.leistung_id
--  WHERE t.beginn >= @tag1 AND t.beginn < @tag1 + INTERVAL 1 DAY
--  GROUP BY t.termin_id
--  ORDER BY t.beginn, m.name;

-- Wer kann Färben?
-- SELECT m.name FROM mitarbeiter m
--   JOIN mitarbeiter_leistung ml ON ml.mitarbeiter_id = m.mitarbeiter_id
--  WHERE ml.leistung_id = 6 AND m.aktiv ORDER BY m.name;

-- Umsatz je Leistung (nur erledigte Termine)
-- SELECT l.name, COUNT(*) AS anzahl, SUM(tl.preis) AS umsatz
--   FROM termin_leistung tl
--   JOIN termin t   ON t.termin_id = tl.termin_id
--   JOIN leistung l ON l.leistung_id = tl.leistung_id
--  WHERE t.status = 'erledigt'
--  GROUP BY l.leistung_id, l.name
--  ORDER BY umsatz DESC;
