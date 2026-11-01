# Änderungen

## 1.1.1

- **Diagnose-Seite:** Neuer Abschnitt „Wächter-Test" für Administratoren. Er prüft nur lesend, ob Stups bei Home Assistant alle Zustände lesen und Auslöser (Zustandswechsel und Zahlenwerte, jeweils mit Wartezeit) abonnieren darf, und zeigt die Personen mit ihrem Zustand. Vorbereitung für automatische Karten aus Home Assistant

## 1.1.0

- **Alles in der Konfiguration von Home Assistant einstellen:** Unter Einstellungen › Apps › Stups › Konfiguration trägst du bei `users` die Personen mit ihren Push-Geräten ein und wählst mit `access_mode`, wer Stups öffnen darf (nur diese Personen oder alle). Die Liste gilt bei jedem Start; in der App sind Personen, Geräte und Zugriff dann gesperrt und nur zu sehen. Bleibt `users` leer, pflegst du wie bisher alles in der App
- Die App sitzt im Home-Assistant-Fenster ohne leere Streifen oben und unten (Statusleiste und Home-Balken wurden doppelt eingerechnet)

## 1.0.0

Erste Veröffentlichung.

- **Boards** mit eigenen Spalten und Kategorien. Karten mit Zuständigen, Termin (mit Uhrzeit), Priorität, Kosten, Beschreibung, Checkliste, Links, Fotos und PDFs sowie Kommentaren und einem Verlauf. Karten wischen oder per Menü verschieben, ein Farbbalken zeigt die Dringlichkeit, „Geplant" hält Karten mit späterem Termin aus „Offen" heraus
- **Agenda:** alle Karten mit Termin aus allen Boards nach Tagen, Überfälliges zuerst, mit Filter nach Personen und Boards
- **Kalender:** Tag, Woche und Monat. Auf einen freien Zeitpunkt tippen legt eine Karte mit diesem Termin an
- **Wiederkehrende Aufgaben:** fester Rhythmus oder ab Erledigung. Die erledigte Karte bleibt samt Verlauf erhalten, die nächste entsteht neu; welche Felder mitgenommen werden, lässt sich pro Karte wählen
- **Push-Nachrichten** über die Companion App: zur Fälligkeit, vorab, nachhaken und als Tageszusammenfassung, mit „Erledigt" direkt in der Nachricht
- **Stupsen:** einer anderen Person zu ihrer Karte einen Stups schicken. Antworten „Erledigt", „Mach ich" und „Später", Sperrzeit und Ruhezeit pro Person
- **Personen und Zugriff** in der App: Personen aus Home Assistant, ihre Push-Geräte, Zugriff für alle oder nur für ausgewählte Personen. Administratoren von Home Assistant stellen ein
- **Kategorien** lassen sich direkt an der Karte anlegen
- **Sensoren** für Home Assistant (`sensor.stups_…`): überfällig und heute fällig, gesamt und je Person, offene Stupse
- Dunkel und hell, live synchron auf allen Geräten, Papierkorb, Archiv, Duplizieren, Kosten je Board
- **Umzug:** Einstellungen › Umzug exportiert Datenbank und Anhänge nach `/share/stups-umzug`, eine neue Stups-App übernimmt sie beim ersten Start
