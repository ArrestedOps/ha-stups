# Änderungen

## 1.15.0

*English first, German version below.*

This version combines everything that ran in the beta app as 1.13.1, 1.14.0 and 1.15.0.

- **Stups is available in English.** If your device (iPhone, browser) reports English, Stups shows the interface in English: board, cards, agenda, calendar, watchers, settings, messages. **A German device keeps seeing German, nothing changes for it.** Settings › Language: "Automatic", "Deutsch" or "English"; it applies to you on all your devices and takes effect at once
- **Quick entry understands English:** `Take out trash tomorrow 7pm @Ben #Home every week !!`, also `in 3 days`, `next Monday`, `Dec 1`, `at 18:30`, `every 2 weeks`, `important`. Times, dates and weekdays follow the language
- **Push messages, the daily summary, nudges and error messages arrive in the language of the person.** The server remembers the language your device last reported (or your choice in Settings). **Anyone who has not reported a language yet keeps getting German push messages** until the app has been opened once. Nudge templates arrive in the recipient's language, your own texts stay as written
- A new board gets its columns ("Open", "Planned", "In progress", "Done", or the German names) in the language of the person; existing boards and names you chose stay. Watcher run notes appear in the language of the interface, and the app options in Home Assistant are available in English. The names of the Home Assistant sensors stay German for now
- **Your own colour.** Settings › Colour: a colour wheel on which you tap or drag your favourite hue. Buttons, the active tab, the plus button and coloured text follow at once. It applies to you on all your devices, everyone picks their own; "Orange (default)" restores the original look. Light and dark are calculated separately, and the text on buttons stays readable for every hue. The urgency bars on cards (red, orange, yellow) stay as they are
- **The plus button always creates an open card**, even when "Done" or "In progress" is showing; if you pick a date after today, the card goes to "Planned". On the desktop there is only the one orange plus button instead of one per column, as on the phone
- **Settings gear.** A subtle gear without a frame at the top right of every tab (Boards, Agenda, Calendar, Watchers) opens the settings; the way through the board name stays
- **Fixed:** ticking two boxes quickly under "Carry over to the next card" could lose the first one when the server was slow. They are now saved in order and the display follows your tap at once
- **Faster:** "People & access" opens at once in the standalone container; without Home Assistant it used to wait 2 to 3 seconds for a Home Assistant that does not exist
- **Documentation:** README, app documentation and Docker guide are now in English (the German versions stay as `*.de.md`), with English screenshots and a short demo GIF
- Database: two new columns for the language and the hue of the person (migrations 14 and 15, with a backup beforehand as always)

**Deutsch**

Diese Version fasst die Versionen 1.13.1, 1.14.0 und 1.15.0 zusammen, die zuvor in der Beta-App liefen.

- **Stups gibt es jetzt auf Englisch.** Meldet dein Gerät (iPhone, Browser) Englisch, zeigt Stups die Oberfläche auf Englisch: Board, Karten, Agenda, Kalender, Wächter, Einstellungen, Hinweise. **Ein deutsches Gerät sieht weiter Deutsch, es ändert sich nichts.** Einstellungen › Sprache: „Automatisch", „Deutsch" oder „English", gilt für dich auf allen Geräten, der Wechsel wirkt sofort
- Die **Schnell-Eingabe** versteht Englisch: `Take out trash tomorrow 7pm @Ben #Home every week !!`, auch `in 3 days`, `next Monday`, `Dec 1`, `at 18:30`, `every 2 weeks`, `important`. Zeiten, Datum und Wochentage folgen der Sprache
- **Push-Nachrichten, Tageszusammenfassung, Stupse und Fehlermeldungen** kommen in der Sprache der Person. Der Server merkt sich die Sprache, die dein Gerät zuletzt gemeldet hat (oder deine Wahl in den Einstellungen). **Wer noch keine Sprache gemeldet hat, bekommt Push weiter auf Deutsch**, bis die App einmal geöffnet wurde. Stups-Vorlagen erscheinen beim Empfänger in dessen Sprache, eigene Texte bleiben, wie sie geschrieben wurden
- Ein neues Board bekommt seine Spalten („Open", „Planned", „In progress", „Done" bzw. die deutschen Namen) in der Sprache der Person; bestehende Boards und Namen, die du vergeben hast, bleiben. Die Notizen der Wächter-Läufe erscheinen in der Sprache der Oberfläche, die Optionen der App in Home Assistant gibt es auch auf Englisch. Die Namen der Home-Assistant-Sensoren bleiben vorerst deutsch
- **Eigene Farbe.** Einstellungen › Farbe: ein Farbkreis, auf dem du deinen Lieblingsfarbton antippst oder ziehst. Knöpfe, aktiver Reiter, Plus-Knopf und farbige Schrift folgen sofort. Die Farbe gilt für dich auf allen Geräten, jede Person wählt ihre eigene; „Orange (Standard)" stellt das bisherige Aussehen wieder her. Hell und Dunkel werden einzeln berechnet, die Schrift auf den Knöpfen bleibt bei jedem Farbton gut lesbar. Die Dringlichkeitsbalken an den Karten bleiben, wie sie sind
- **Der Plus-Knopf legt immer in „Offen" an**, auch wenn gerade „Erledigt" oder „In Arbeit" geöffnet ist; wählst du einen Termin nach heute, landet die Karte in „Geplant". Am Desktop gibt es nur noch den einen orangen Plus-Knopf statt eines Knopfes je Spalte, wie auf dem Handy
- **Zahnrad für die Einstellungen.** Oben rechts in der Kopfzeile jedes Reiters (Boards, Agenda, Kalender, Wächter) sitzt ein dezentes Zahnrad ohne Rahmen; der Weg über den Board-Namen bleibt
- **Fehler behoben:** Wer unter „Für die nächste Karte übernehmen" zwei Häkchen schnell hintereinander setzte, konnte das erste verlieren, wenn der Server langsam antwortete. Die Häkchen werden jetzt der Reihe nach gespeichert, die Anzeige folgt sofort deinem Tipp
- **Schneller:** „Personen & Zugriff" öffnet sich im eigenen Container sofort; ohne Home Assistant wartete es 2 bis 3 Sekunden auf einen Home Assistant, den es nicht gibt
- **Dokumentation:** README, Anleitung der App und Docker-Anleitung gibt es jetzt auf Englisch (die deutschen Fassungen bleiben als `*.de.md`), mit englischen Bildern und einem kurzen Demo-GIF
- Datenbank: zwei neue Spalten für Sprache und Farbton der Person (Migration 14 und 15, vorher wie immer eine Sicherung)

## 1.13.0

Diese Version fasst die Versionen 1.10.0 bis 1.13.0 zusammen, die zuvor in der Beta-App liefen.

- **Schnell-Eingabe (neu).** Im Fenster „Neue Karte" wird aus einer Zeile eine fertige Karte: `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!` ergibt Titel „Müll raus", fällig morgen 19:00, zuständig Ben, Kategorie Haushalt, wöchentlich, Priorität hoch. Erkannte Teile sind im Text farbig hinterlegt, darunter zeigen Chips, was Stups verstanden hat; ein Tipp auf einen Chip nimmt ihn zurück. Erkannt werden Datum (heute, morgen, Wochentage, „in 3 Tagen", „1.12.", „1. Dezember"), Uhrzeit, Wiederholung („jede Woche", „alle 2 Tage", „monatlich" …), `@Person`, `#Kategorie` und Priorität (`!`, `!!`, „wichtig")
- Eine unbekannte Person sperrt das Anlegen (sonst gäbe es keine Erinnerung); eine neue Kategorie wird nach Rückfrage angelegt. Neue Einstellung **Standard-Uhrzeit für Termine** (Einstellungen › Vorgaben, Vorgabe 09:00) für ein Datum ohne Uhrzeit
- **Kompakte Karten im Board.** Titel (höchstens zwei Zeilen) und eine Zeile mit allem Wichtigen: Termin (rot, wenn überfällig), Wiederholung, Priorität, Checkliste, Kommentare, Links, Anhänge und Kosten; Kategorien als kleine Punkte. Auf einem iPhone passen so meist fünf Karten auf den Bildschirm
- Der „+"-Knopf verdeckt nichts mehr, Spalten-Tabs und Filter-Chips zeigen mit einem Verlauf am Rand, dass man wischen kann, und im Karten-Fenster heißt der Knopf oben rechts „Fertig" statt „Speichern". Auswahlfelder sehen überall gleich aus
- **Agenda:** Karten, die weiter als 60 Tage entfernt sind, fehlten. Jetzt gibt es auch bei leerer Liste den Knopf „Weitere 60 Tage laden", und liegt im ersten Zeitraum nichts an, schaut die Agenda gleich ein Jahr voraus
- **Live-Sync schlanker.** Ändert jemand eine Karte, holen die anderen Geräte nur diese Karte nach statt das ganze Board: bei 300 Karten 1,1 KB statt 210 KB je Änderung. Bei allem anderen (Boards, Spalten, Kategorien, Personen, Stupse, Wächter, Kosten) und nach einem Verbindungsabbruch wird wie bisher alles neu geladen
- Unter der Haube nach Themen aufgeteilt (Datenteil und Schnittstelle in kleinere Dateien), ohne Änderung im Verhalten
- **Lizenz:** Stups steht ab dieser Version unter der PolyForm Strict License 1.0.0 (Nutzen und Lesen ja, Weitergeben und Verändern nein). Für 1.9.0 und früher gilt weiter die MIT-Lizenz
- Keine Migration der Datenbank

## 1.9.0

- **Neue Beta-App „Stups (Beta)".** Neue Versionen erscheinen künftig zuerst dort und erst nach dem Test in dieser App. Die Beta hat **eigene Daten** (echte Daten lassen sich einmal über Einstellungen › Umzug hineinkopieren), ein eigenes Symbol mit „BETA"-Band und einen eigenen Eintrag in der Seitenleiste. Installation: Repository `https://github.com/ArrestedOps/ha-stups#beta` in Home Assistant hinzufügen (Anleitung im README)
- In der Beta sind **Push und Wächter zunächst aus**, damit niemand Nachrichten doppelt bekommt; ein Administrator schaltet sie unter Einstellungen › Beta gezielt ein. Push-Titel beginnen mit „Beta ·", Sensoren heißen `sensor.stups_beta_…`, das Ereignis `stups_beta_create_card`
- **Der eigene Container ist jetzt ausdrücklich als Beta gekennzeichnet**, mit einem Hinweis zur Sicherheit (nie ohne HTTPS und Reverse-Proxy ins Internet, regelmäßig aktualisieren). Er bekommt vorerst keine neuen Funktionen
- **Für diese App ändert sich nichts**, außer dass die Oberfläche der Beta ein Band zeigt. Keine Migration

## 1.8.0

- **Anmelden mit Passkey im eigenen Container.** Statt das Passwort zu tippen, genügt Fingerabdruck, Gesicht oder die Bildschirmsperre. Einstellungen › Passkeys › „Passkey hinzufügen", danach zeigt die Anmeldeseite „Mit Passkey anmelden", ohne Benutzername. Das Passwort bleibt als Rückfall. Voraussetzung: `STUPS_PUBLIC_URL` ist eine https-Adresse mit Namen (nicht mit IP-Adresse). Anleitung: `docs/docker.md`
- Das Gerät muss die Person immer bestätigen (Fingerabdruck, Gesicht oder PIN). Fehlversuche zählen wie falsche Passwörter. In der Datenbank liegt nur der öffentliche Schlüssel
- **Für die App in Home Assistant ändert sich nichts:** Dort meldet weiter Home Assistant an, die Oberfläche zeigt keine Passkeys
- Datenbank: neue Tabelle für Passkeys (Migration 13, vorher wie immer eine Sicherung)

## 1.7.0

- **Der eigene Container kann sich mit Home Assistant verbinden.** Mit `HA_URL` und `HA_TOKEN` (Long-Lived-Token) bekommt er auch **Wächter, Sensoren und Push über die Companion App**, ohne selbst eine Home-Assistant-App zu sein. Angemeldet wird weiter mit den Konten in Stups. Anleitung: `docs/docker.md`
- **Personen aus Home Assistant** erscheinen unter Personen & Zugriff als Vorschläge zum Hinzufügen. Für „wer ist zu Hause" findet Stups die Person über ihren Namen
- Push-Nachrichten über die Companion App öffnen im Container Stups unter `STUPS_PUBLIC_URL`, nicht ein Panel in Home Assistant
- Vorschläge aus Home Assistant zeigen keine Personen mehr, die es in Stups schon gibt (gleicher Name)
- **Für die App in Home Assistant ändert sich nichts**

## 1.6.0

- **Push über ntfy im eigenen Container.** Ohne Home Assistant gibt es keine Companion App; jetzt kommen Erinnerungen, Stupse und die Tageszusammenfassung über einen ntfy-Server (selbst betrieben oder `ntfy.sh`). Jede Person trägt unter Personen & Zugriff ein eigenes Thema ein und abonniert es in der ntfy-App. Mit Link zur Karte und Knöpfen: „Erledigt" bei Fälligkeit, „Erledigt", „Mach ich" und „Später" beim Stups. Einrichtung und Hinweise: `docs/docker.md`
- **Knöpfe ohne Anmeldung, aber abgesichert:** Jeder Knopf trägt ein signiertes Token (Person, Aktion, 14 Tage gültig). Damit lässt sich genau diese Aktion auslösen und nichts sonst; Fälschungen werden abgewiesen
- Test-Nachricht mit „Rückweg prüfen" und ein Stand der Zustellung zeigen, ob ntfy und der Weg zurück zu Stups funktionieren
- **Für die App in Home Assistant ändert sich nichts:** Push läuft weiter über die Companion App
- Datenbank: neue Spalte für das ntfy-Thema (Migration 12, vorher wie immer eine Sicherung)

## 1.5.0

- **Stups läuft jetzt auch ohne Home Assistant**, als eigener Docker-Container (zum Beispiel auf einer Synology-NAS), mit eigenen Konten und Passwort statt Home Assistant. Boards, Agenda, Kalender, Wiederholungen und Stupsen funktionieren dort wie in der App; Wächter und Sensoren bleiben Home Assistant vorbehalten und sind im Container ausgeblendet. Anleitung und Compose-Beispiel: `docs/docker.md` im Repository
- **Für die App in Home Assistant ändert sich nichts:** gleiche Anmeldung über Home Assistant, gleiche Optionen, Daten und Oberfläche
- Eigene Anmeldung (nur im Container): Einrichtung des ersten Administrators mit einem Code aus dem Protokoll oder über `STUPS_ADMIN_USER`/`STUPS_ADMIN_PASSWORD`, Passwörter mit scrypt, Sitzungen 30 Tage, Wartezeit nach Fehlversuchen, Benutzerverwaltung unter Personen & Zugriff, Passwort ändern und Abmelden in den Einstellungen
- Neuer Image-Name `ghcr.io/arrestedops/stups` für beide Architekturen (die App nutzt weiter die Bilder mit Architektur im Namen)
- Datenbank: zwei neue Tabellen für Konten und Sitzungen (Migration 11, vorher wie immer eine Sicherung)

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
