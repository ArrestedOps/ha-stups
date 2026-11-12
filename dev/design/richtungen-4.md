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
