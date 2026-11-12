# Runde 4: Stups im Stil von iOS

Auslöser: Die „Welten“ (Runde 3) und die Persönlichkeits-Varianten gefielen nicht. Gewünscht: echtes iOS-Design, sauber, animiert, maximal benutzerfreundlich.
Datei: `dev/design/mockups/ios/aufgaben.html` (eine bedienbare Seite; Handy, ab 900 px Split-Ansicht; `?theme=dark`).

## Was es zeigt (alles bedienbar)

- Großer Titel, der beim Scrollen einklappt, Unschärfe-Leiste, Suchfeld.
- Vier Kacheln (Heute, Überfällig, Diese Woche, Erledigt), Zahlen rollen beim Ändern; Antippen öffnet eine neue Seite (Push mit Parallaxe).
- Gruppierte Listen mit Abschnittsköpfen; Haken füllt sich mit Federung, die Zeile klappt weg, „Rückgängig“.
- Wischen nach rechts = erledigt, nach links = Später, Löschen (mit Gummiband).
- Antippen einer Zeile: Blatt, das sich nach unten wegziehen lässt; der Hintergrund weicht zurück.
- Symbol oben rechts: Pull-down-Menü mit Personen, funktioniert bei 9 Personen; Auswahl schaltet die Ansicht um.
- „Neue Aufgabe“: Schnelleingabe tippt sich selbst vor und erkennt Datum, Person und Board als Chips.
- Stups kommt als Banner von oben; Antippen klappt Erledigt, Bin dran, Später auf; nach oben wischen schließt.
- Desktop: Seitenleiste, Liste, Detailspalte.

## Prinzipien (für die Umsetzung in Svelte)

Systemschrift (SF auf Apple-Geräten, sonst Inter), Systemfarben, ein Tönungsorange, 44-Punkte-Ziele, Federkurve `cubic-bezier(.32,.72,0,1)`, alle Bewegungen mit Bedeutung, „Bewegung reduzieren“ respektiert, Dunkelthema aus echten iOS-Grautönen.
Offen: Boards, Wächter, Einstellungen und Dialoge im selben Stil.

## Änderungen nach Rückmeldung (Tab-Leiste und Kopf)

- **Tab-Leiste** von links nach rechts: Aufgaben, Boards, + (neue Aufgabe), Kalender, Wächter. Schwebend, als Glas (wie iOS 26); die Markierung wandert mit einer kleinen Dehnung zum neuen Tab, das + dreht sich beim Öffnen des Blatts.
- **Kopfzeile:** Stups-Logo (das echte Symbol aus `packages/web/src/assets`), Home-Assistant-Symbol (zurück zum Dashboard), Mitteilungen mit Zähler, Einstellungen. Die Personenauswahl sitzt als Pille unter dem Titel („Meine Aufgaben“).
- **Mitteilungen** und **Einstellungen** öffnen als Blätter; Kalender, Boards und Wächter sind als einfache Seiten da (Kalender mit Tagesleiste, Wächter mit Schaltern), noch nicht ausgearbeitet.
- **Neu zum Ausprobieren:** Karte „Das Zuhause meldet“ (Wächter: Waschmaschine läuft, wird fertig, ein Tipp legt die Aufgabe an).

## Änderungen nach Rückmeldung (Plus, Zahnrad, Wächter, Live-Aufgabe)

- „+“ ist jetzt eine flache orange Pille in der Glas-Tab-Leiste (kein erhöhter Kreis mehr).
- Einstellungen: echtes Zahnrad (8 Zähne), vorher sah das Symbol wie eine Sonne aus.
- Keine Wächter-Vorschläge mehr unter „Aufgaben“. Die Wächter-Seite bleibt, mit Schaltern.
- **Live-Aufgabe:** Eine laufende Aufgabe erscheint oben als dunkle Karte wie eine iOS Live Activity (Laufzeit tickt, Ring zeigt den Anteil an der geschätzten Dauer, Pause/Weiter, Fertig). In der Liste trägt die Zeile die laufende Zeit. Starten aus den Details („Jetzt starten, die Zeit läuft mit“).
