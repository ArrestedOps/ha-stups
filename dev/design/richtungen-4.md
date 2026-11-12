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

## Stand: alle Seiten, Einstellungen, Dialoge (Prototyp `ios/aufgaben.html`)

- Entscheidung: keine Dauer-Schätzung und kein Fortschrittsring. Die Live-Aufgabe zeigt nur die laufende Zeit. Fertig tippen, dann ist die Aufgabe erledigt.
- Neu: Boards (Liste, Board mit Segment Offen/Geplant/In Arbeit/Erledigt, Menü, Board-Einstellungen, Löschwarnung), Kalender mit echten Tagen, Wächter (Liste, Detail mit gezeichnetem Verlauf und Schwelle, Assistent in vier Schritten).
- Einstellungen als Unterseiten im Blatt: Benachrichtigungen, Sprache und Farbe (Hell/Dunkel/System und Akzentfarbe wirken sofort), Personen und Zugriff, Konto und Anmeldung, Dashboard, Warum kommt nichts an, Papierkorb, Vorlagen, Termine, Feedback.
- Dialoge: Warnung, Aktionsblatt, Termin (Kalender und Zeiträder), Wiederholung, Stupsen mit Vorschau der Mitteilung, Kartenmenü, Diese Woche (Verteilung ohne Rangliste).
- Start: Anmelden, Noch kein Zugriff, Einrichtung in vier Schritten.
- Oben in der Aufgabenliste: „Seiten“ öffnet eine Übersicht, aus der jede Seite direkt aufgerufen wird.
- Dunkelmodus über die gleichen Tokens, Desktop als Split-Ansicht, „Bewegung reduzieren“ wird respektiert.

## Rückmeldung: Aufgabe anlegen, Kalender, Wächter

- **Neue Aufgabe** hat jetzt alle Felder der echten App: Symbol (automatisch erkannt, mit Funken, änderbar), Titel mit Erkennung (Datum, Uhrzeit, @Person, #Kategorie, !Priorität, „jeden Donnerstag“), Chips zum Zurücknehmen, Board und Spalte, Termin, Wiederholung, Erinnerung, Zuständige, Priorität, Kategorie (auch neu anlegen), Notiz, Checkliste, Foto/Link, dazu Aufwand, Kosten und Bestätigung.
- **Tastatur:** Das Blatt folgt der sichtbaren Fläche (`visualViewport`) und bleibt über der Tastatur. Auf Touchgeräten gibt es keinen Autofokus, das Formular ist zuerst komplett zu sehen. Über der Tastatur sitzt eine Leiste mit Schnellwahl (Heute, Morgen, Abends, @ Person, # Kategorie, ! Wichtig), beim Tippen von @ oder # schlägt sie Personen und Kategorien vor, dazu „Fertig“.
- **Zweites Blatt** für Termin (Monat, Zeiträder), Wiederholung (Wie oft, Wochentage, Tag im Monat, Plan bleibt fest oder neu zählen, Toleranz, nächste Termine als Vorschau), Erinnerung (vorab, Nachhaken, Ablauf), Symbol.
- **Kalender:** Tag, Woche (Standard), Monat, Liste. Woche und Tag als Zeitleiste mit Jetzt-Linie, überlappende Einträge nebeneinander, Antippen einer freien Zeit legt eine Aufgabe mit dieser Zeit an. Am Computer volle Breite.
- **Wächter:** Suche, Bereiche wie in der echten App (Mit Problem, Wartet auf jemanden, Läuft gerade, Kommt bald), danach Kategorien. Große Kategorien (über 8) öffnen eine eigene Seite: Zusammenfassung (niedrig, bald leer, in Ordnung), Suche, Umschalter Kritisch, Räume, Alle. Kleine klappen inline auf. „Gefunden“ als Blatt mit Mehrfachauswahl und „Alle einrichten“.
- **Wächter anlegen** wie in der echten App: Vorlage, dann Wenn (Entität suchen, Bedingung Unter/Über/Zustand, länger als, Verlauf, Probelauf), Dann (Titel, Symbol, Board, Spalte, Priorität, Fälligkeit, Kategorien, Vorschau), Wer (Zuweisung, wer kommt infrage, nur wer zu Hause ist, Rückfall), Feinschliff (erledigt sich selbst, Stupsen, N-tes Mal, Sperrzeit, keine zweite Karte, Fairness, Name, Kategorie, Beschreibung).

## Feinschliff nach Rückmeldung

- Kein „+“ oben rechts mehr bei Boards, Kalender und Wächter: Das „+“ in der Leiste ist die einzige Stelle für „Neu“. Boards haben am Listenende die Zeile „Neues Board“, Wächter die Schaltfläche „Neuen Wächter anlegen“.
- Wächter: Jede Kategorie öffnet eine eigene Seite, einheitlich wie bei Batterien (große Kategorien mit Kritisch/Räume/Alle, kleine mit Zusammenfassung und Liste). Keine aufklappenden Gruppen mehr. Bei einer Suche kommt eine flache Trefferliste.
- Sprache: „Karte“ heißt überall „Aufgabe“.
- Priorität: Eigene Segmentreihe mit größerer Höhe, Flagge und Text in einer Zeile, Farbe je Stufe (grau, orange, rot).

## Stupse sind wieder da, „Läuft gerade“ ist raus

- Stupsen ist das Herz der App und steht oben in Aufgaben: eine orange Stups-Karte mit winkender Hand, Absender, Aufgabe, Nachricht und den Schnellantworten Erledigt, Mach ich, Später (wie in der Push-Mitteilung). Mehrere Stupse: „1 weiterer Stups“ klappt die nächsten auf.
- Betroffene Zeilen sind getönt und tragen „Mia stupst dich“; selbst Gestupstes steht als „Du hast Ben gestupst“. Am Tab Aufgaben zeigt ein Zähler die offenen Stupse. In den Details steht der Stups mit denselben Antworten.
- Stupsen sendet jetzt für die gewählte Aufgabe: Person, Nachricht, Vorschau, danach „Du hast … gestupst“ in der Zeile.
- Entfernt: die Live-Aufgabe „Läuft gerade“ samt „Jetzt starten, die Zeit läuft mit“. Das bleibt erstmal draußen.
