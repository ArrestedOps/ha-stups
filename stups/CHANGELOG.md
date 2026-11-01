# Änderungen

## 1.4.0

- **Unter der Haube umgebaut, für dich ändert sich nichts.** Anmeldung, Personen, Push und Einstellungen hängen jetzt an eigenen Schnittstellen statt direkt an Home Assistant. Das ist die Grundlage dafür, dass Stups später auch ohne Home Assistant laufen kann. Daten, Optionen und Verhalten im Add-on bleiben gleich
- Neu: Die Oberfläche kann abfragen, was die Betriebsart bietet (`/api/capabilities`)

## 1.3.1

- **Der Reiter „Wächter" ist für alle da.** Auch Mitglieder (keine Administratoren) sehen ihn von Anfang an, nur lesend. Gibt es noch keinen Wächter, erklärt ein Hinweis, dass ein Administrator sie einrichten kann. Anlegen, ändern und pausieren dürfen weiterhin nur Administratoren

## 1.3.0

- **Reiter „Wächter":** Die Wächter haben einen eigenen, vierten Reiter in der Leiste unten (vorher tief in den Einstellungen). Er zeigt je Wächter die Bedingung, den aktuellen Zustand der Entität, den Zählerstand, die offene Karte (ein Tipp öffnet sie) und was zuletzt ausgelöst hat, dazu die **letzte Aktivität** über alle Wächter. Ohne Wächter stehen die Vorlagen gleich da
- **Wer ihn sieht:** Administratoren immer (dort richten sie ein, ändern und pausieren), alle anderen nur, wenn es Wächter gibt, und nur lesend. In den Einstellungen führt „Wächter" zum Reiter

## 1.2.0

- **Wächter:** Stups beobachtet Entitäten in Home Assistant und legt von selbst eine Karte an, die jemandem zugewiesen wird. Einrichten unter Einstellungen › Wächter (nur Administratoren, ohne YAML), mit Vorlagen für Waschmaschine, Spülmaschine, Trockner, Filter, Batterie und Saugroboter, Entitäten-Suche mit aktuellem Zustand, Vorschau-Satz und „Testen". Bedingungen: Wert fällt unter oder steigt über eine Zahl, Zustand wechselt zu, jeweils „für mindestens … Minuten"; optional „erst beim N-ten Mal" (Zähler, setzt sich beim Erledigen zurück)
- **Zuweisung pro Wächter:** feste Person(en), abwechselnd, abwechselnd unter den Anwesenden, alle Anwesenden, **wer zuerst nach Hause kommt** (Karte wartet ohne Zuständige und Push, die erste Heimkehr bekommt sie samt Nachricht, Fälligkeit ab Zuweisung, Rückfall nach 24 Stunden) oder niemand
- **Regeln:** Sperrzeit gegen flatternde Sensoren, keine Doppelkarten, kein Auslösen beim Anlegen, neustartfest (ein verpasster Übergang löst genau einmal aus), optional „erledigt sich selbst, wenn …" und „nach … Minuten erinnern, wenn noch offen". Karten von Wächtern tragen ein Auge-Symbol, im Verlauf steht, was der Wächter getan hat
- **Eigene Automationen:** Das Home-Assistant-Ereignis `stups_create_card` legt eine Karte an (Board, Spalte, Titel, Beschreibung, Zuständige oder `present`, Fälligkeit, `dedupe_key`). Das Protokoll steht auf der Diagnose-Seite
- Neuer Sensor `sensor.stups_waechter_offen`
- Datenbank: neue Tabellen für Wächter, Läufe und Wartende (Migration 10, vorher wie immer eine Sicherung)
- Diagnose-Seite: „Wächter-Test" prüft, ob Stups bei Home Assistant Zustände lesen und Auslöser abonnieren darf

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
