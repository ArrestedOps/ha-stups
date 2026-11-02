# Änderungen (Beta)

Die Beta bekommt jede neue Version vor der normalen App. Was sich ändert, steht im Changelog der normalen App: [stups/CHANGELOG.md](https://github.com/ArrestedOps/ha-stups/blob/main/stups/CHANGELOG.md). Hier nur, was die Beta selbst betrifft.

## 1.12.0-beta.1

- **Unter der Haube umgebaut, für dich ändert sich nichts.** Der Datenteil (`store.ts`, vorher 2.900 Zeilen) und die Schnittstelle (`api.ts`, vorher 900 Zeilen) sind nach Themen in kleinere Dateien aufgeteilt (Personen, Boards, Karten, Erledigen, Stupse, Wächter, Papierkorb …). Es ist dieselbe Logik, nur woanders abgelegt; ein Test hält fest, dass Store und API genau dieselben Methoden und Routen anbieten wie vorher. Grundlage für die nächsten Schritte (Live-Sync mit Änderungen)
## 1.11.0-beta.1

- **Schnell-Eingabe.** Im Fenster „Neue Karte" wird aus einer Zeile eine fertige Karte: `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!` ergibt Titel „Müll raus", fällig morgen 19:00, zuständig Ben, Kategorie Haushalt, wöchentlich, Priorität hoch. Erkannte Teile sind im Text farbig hinterlegt, darunter zeigen Chips, was Stups verstanden hat. Ein Tipp auf einen Chip nimmt ihn zurück (zum Beispiel, wenn „Montag" zum Titel gehört)
- Erkannt werden: Datum (heute, morgen, übermorgen, Wochentage, „nächsten Montag", „in 3 Tagen", „in einer Woche", „1.12.", „1. Dezember"), Uhrzeit („19 Uhr", „19:30", „um 19"), Wiederholung („jeden Tag", „jede Woche", „alle 2 Tage", „jeden Montag", „monatlich", „jährlich"), `@Person`, `#Kategorie` und Priorität (`!` mittel, `!!` oder „wichtig" hoch)
- Eine unbekannte Person sperrt das Anlegen (sonst gäbe es keine Erinnerung); eine neue Kategorie wird nach Rückfrage angelegt. Was du von Hand änderst, überschreibt die Schnell-Eingabe nicht mehr
- Neue Einstellung **Standard-Uhrzeit für Termine** (Einstellungen › Vorgaben, Vorgabe 09:00) für ein Datum ohne Uhrzeit
## 1.10.0-beta.2

- **Agenda: Karten, die weiter als 60 Tage entfernt sind, fehlten**, und bei leerer Liste gab es keinen Knopf „Weitere 60 Tage laden". Jetzt steht der Knopf auch bei leerer Liste (mit dem Hinweis, bis wann geladen ist), und liegt im ersten Zeitraum gar nichts an, schaut die Agenda gleich ein Jahr voraus
## 1.10.0-beta.1

- **Kompakte Karten im Board.** Titel (höchstens zwei Zeilen) und eine Zeile mit allem Wichtigen: Termin (rot, wenn überfällig), Wiederholung, Priorität als Flagge, Checkliste „1/2", Kommentare, Links, Anhänge und Kosten. Kategorien erscheinen als kleine Punkte. „Angelegt vor …" steht nur noch im Karten-Fenster. Auf einem iPhone 15 passen so mindestens vier, meist fünf Karten auf den Bildschirm
- Der „+"-Knopf verdeckt nichts mehr: Die letzte Karte lässt sich darüber hinaus scrollen
- Spalten-Tabs und Filter-Chips zeigen mit einem Verlauf am Rand, dass man wischen kann, und die aktive Auswahl rückt von selbst ins Bild
- Im Karten-Fenster heißt der Knopf oben rechts **„Fertig"** statt „Speichern" (es speichert schon alles sofort; „Gespeichert" erscheint wie bisher)
- Einheitliche Auswahlfelder (Wächter, Wiederholung, Einstellungen, Erinnerung): Wert und Pfeil im Stil der übrigen Zeilen, der Picker des Handys bleibt
## 1.9.0-beta.2

- Der Start meldet im Protokoll, ob ein Umzug gefunden wurde: Fehlt der Export, steht dort, welche Datei gesucht wurde und was in /share liegt (Hilfe, wenn eine neue App leer startet).

## 1.9.0-beta.1

- Erste Beta-Version. Eigene Daten, Push und Wächter zunächst aus (Einstellungen › Beta), eigene Namen für Push, Sensoren und Ereignisse.
