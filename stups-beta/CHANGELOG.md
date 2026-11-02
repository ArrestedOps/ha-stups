# Änderungen (Beta)

Die Beta bekommt jede neue Version vor der normalen App. Was sich ändert, steht im Changelog der normalen App: [stups/CHANGELOG.md](https://github.com/ArrestedOps/ha-stups/blob/main/stups/CHANGELOG.md). Hier nur, was die Beta selbst betrifft.

## 1.15.0-beta.2

- **Personen & Zugriff öffnet sich sofort.** Ohne Verbindung zu Home Assistant (eigener Container) wartete die Schnittstelle bei jedem Öffnen auf einen Home Assistant, den es nicht gibt, und brauchte je nach Rechner 2 bis 3 Sekunden. Jetzt antwortet sie in wenigen Millisekunden. In der App mit Home Assistant ändert sich nichts
- **Fehler behoben: „Für die nächste Karte übernehmen".** Wer zwei Häkchen schnell hintereinander setzte, konnte das erste wieder verlieren, wenn der Server langsam antwortete. Die Häkchen werden jetzt der Reihe nach gespeichert und die Anzeige folgt sofort deinem Tipp
- Unter der Haube: Die Browser-Tests laufen stabil und in 8 statt 12 Minuten (ein Test ließ Browser-Fenster offen, zwei Tests hingen von der Tageszeit ab: kurz vor Mitternacht landete eine Karte „fällig in 30 Min." in „Geplant")

## 1.15.0-beta.1

- **Eigene Farbe.** Einstellungen › Farbe: ein Farbkreis, auf dem du deinen Lieblingsfarbton antippst oder ziehst. Knöpfe, aktiver Reiter, Plus-Knopf und farbige Schrift folgen sofort. Die Farbe gilt für dich auf allen Geräten, jede Person wählt ihre eigene; „Orange (Standard)" stellt das bisherige Aussehen wieder her. Die Farben werden für Hell und Dunkel einzeln berechnet, die Schrift auf den Knöpfen bleibt bei jedem Farbton gut lesbar (bei hellem Grün und Türkis wird sie dunkel). Die Dringlichkeitsbalken an den Karten (rot, orange, gelb) bleiben, wie sie sind
- **Der Plus-Knopf legt immer in „Offen" an**, auch wenn gerade „Erledigt" oder „In Arbeit" geöffnet ist. Wählst du einen Termin nach heute, landet die Karte in „Geplant". Am Desktop gibt es nur noch den einen orangen Plus-Knopf statt eines Knopfes je Spalte, wie auf dem Handy
- Datenbank: eine neue Spalte für den Farbton der Person (Migration 15, vorher wie immer eine Sicherung)

## 1.14.0-beta.1

- **Stups gibt es jetzt auf Englisch.** Meldet dein Gerät (iPhone, Browser) Englisch, zeigt Stups die Oberfläche auf Englisch: Board, Karten, Agenda, Kalender, Wächter, Einstellungen, Hinweise. **Ein deutsches Gerät sieht weiter Deutsch, es ändert sich nichts.** Einstellungen › Sprache: „Automatisch“, „Deutsch“ oder „English“, gilt für dich auf allen Geräten, der Wechsel wirkt sofort
- Die **Schnell-Eingabe** versteht Englisch: `Take out trash tomorrow 7pm @Ben #Home every week !!`, auch `in 3 days`, `next Monday`, `Dec 1`, `1st December`, `at 18:30`, `every 2 weeks`, `important`
- Zeiten, Datum und Wochentage folgen der Sprache (24-Stunden-Zeit und Wochenbeginn Montag bleiben)
- **Push-Nachrichten, Tageszusammenfassung, Stupse und Fehlermeldungen** kommen in der Sprache der Person. Der Server merkt sich die Sprache, die dein Gerät zuletzt gemeldet hat (oder deine Wahl in den Einstellungen). **Wer noch keine Sprache gemeldet hat, bekommt Push weiter auf Deutsch**, bis die App einmal geöffnet wurde. Stups-Vorlagen („Denkst du dran?") erscheinen beim Empfänger in dessen Sprache, eigene Texte bleiben, wie sie geschrieben wurden
- Ein neues Board und das erste Board einer neuen Installation bekommen ihre Spalten („Open", „Planned", „In progress", „Done") in der Sprache der Person; bestehende Boards und Namen, die du vergeben hast, bleiben
- Die Notizen der Wächter-Läufe („erste Person zu Hause", „Sperrzeit 10 Min.") erscheinen in der Sprache der Oberfläche; auch die Optionen der App in Home Assistant gibt es auf Englisch
- Die Namen der Home-Assistant-Sensoren (zum Beispiel „… überfällig") bleiben vorerst deutsch
- Datenbank: zwei neue Spalten für die Sprache der Person (Migration 14, vorher wie immer eine Sicherung)
## 1.13.1-beta.1

- **Zahnrad für die Einstellungen.** Oben rechts in der Kopfzeile jedes Reiters (Boards, Agenda, Kalender, Wächter) sitzt jetzt ein dezentes Zahnrad ohne Rahmen. Ein Tipp öffnet die Einstellungen; der Weg über den Board-Namen bleibt. Die Kopfzeile wird dadurch nicht höher
## 1.13.0-beta.1

- **Live-Sync schlanker.** Ändert jemand eine Karte, meldet der Server jetzt auch, welche, und die anderen Geräte holen nur diese Karte nach statt das ganze Board. Auf einem Board mit 300 Karten sind das für eine Änderung 1,1 KB statt 210 KB. Bei allem anderen (Boards, Spalten, Kategorien, Personen, Stupse, Wächter, Kosten) und nach einem Verbindungsabbruch lädt die App wie bisher alles neu
- Neue Schnittstelle `GET /api/cards?ids=…` (höchstens 50 Karten auf einmal)

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
