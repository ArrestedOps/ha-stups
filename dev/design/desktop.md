# Desktop-Version (ab 900 px Breite)

Prototyp: `dev/design/mockups/ios/aufgaben.html`, dieselbe Datei wie die Handy-Version. Die Oberfläche wechselt bei 900 px Breite, auch live beim Ändern der Fenstergröße.

## Leitgedanken

1. **Der Computer ist zum Arbeiten da, das Handy zum Erledigen.** Die Handy-Oberfläche wird deshalb nicht gestreckt, sondern am Computer durch Liste mit Spalten, Kanban, Zeitleiste und Tabelle ersetzt. Ablauf, Begriffe, Farben und Bewegungen bleiben gleich.
2. **Drei Bereiche:** Seitenleiste (264 px), Hauptbereich, Inspektor (392 px, ab 1180 px Breite angedockt, sonst als Schublade).
3. **Stupsen bleibt das Herz:** Die orange Stups-Leiste steht über der Liste, mit denselben Antworten wie in der Push-Mitteilung (Erledigt, Mach ich, Später). „Gestupst“ hat in der Seitenleiste einen eigenen Eintrag mit Zähler.
4. **Tastatur zuerst:** Schnell anlegen in der Liste (Enter), `N` neue Aufgabe, `⌘K` Befehlspalette (Aufgabe aus einer Zeile anlegen, Seiten und Aufgaben finden, Befehle), `/` filtern, `J`/`K` oder Pfeile, Leertaste erledigt, `G T/B/C/W` Bereichswechsel, `?` Hilfe.
5. **Rechtsklick und Pop-over statt Aktionsblättern:** Menüs erscheinen am Zeiger, nicht als Blatt von unten.

## Bereiche

- **Aufgaben:** Tabelle mit Aufgabe, Board (Farbpunkt), Fällig, Wer. Gruppiert nach Fälligkeit oder Board. Hover zeigt Schnellaktionen (Stupsen, Morgen, Mehr). Inspektor mit allen Feldern der echten App (Fällig, Wiederholung, Erinnerung, Board und Spalte, Zuständige, Priorität, Kategorie, Notiz, Checkliste, Verlauf).
- **Boards:** Kanban mit Offen, Geplant, In Arbeit, Erledigt. Karten lassen sich ziehen (Geist, Spalte leuchtet, Rückgängig). „Geplant“ und „Offen“ halten die Terminregel der echten App ein.
- **Kalender:** Mini-Monat, Filter nach Board und Home-Assistant-Kalender, Tag, Woche, Monat, Liste. Doppelklick im Monat oder Klick in der Zeitleiste legt eine Aufgabe mit dieser Zeit an. Pfeiltasten blättern.
- **Wächter:** Kategorien links (bei schmalem Hauptbereich als Chips), Tabelle mit Sortierung, Mehrfachauswahl und Sammelaktionen (pausieren, Schwelle für alle ändern, Kategorie, löschen) für Fälle mit 100 Batterien. Inspektor mit Verlauf und Regeln.
- **Neue Aufgabe:** Großes Fenster in zwei Spalten (links Wann und wo, Notiz, Mehr; rechts Zuständige, Priorität, Kategorie).
- **Neuer Wächter:** Ein Fenster mit allen vier Blöcken untereinander (Wenn, Dann, Wer, Mehr Einstellungen), rechts eine mitlaufende Zusammenfassung und Vorschau.
- **Einstellungen:** Zwei Spalten wie in den Systemeinstellungen.

## Offen für die Umsetzung

- Ziehen einer Aufgabe auf ein Board in der Seitenleiste.
- Mehrfachauswahl in der Aufgabenliste.
- Anpassbare Spalten der Tabelle.
