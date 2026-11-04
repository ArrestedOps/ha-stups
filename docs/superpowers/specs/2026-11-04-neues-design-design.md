# Neues App-Design: Nachtrag zur Spec

> **ENTWURF, nicht freigegeben.** Es ist noch kein Code geschrieben, nichts committet, nichts gepusht. Dieser Text bereitet nur die Entscheidung vor. Offene Punkte stehen in Abschnitt 9 und sind **Fragen an den Nutzer**; wo eine Empfehlung steht, ist sie nicht beschlossen.

Stand 04.11.2026, Ausgangslage **Stups 1.18.2** (Repository: Beta-Version 1.18.2-beta.1, stabil 1.18.2). Grundlage ist das Briefing „Neues App-Design für Stups umsetzen" (Stand 04.11.2026, geschrieben für 1.8.0) und das Design-Paket `stups-design-export` (31 Screens, 390 × 844, nur Dunkel, `stups.css`). Die Mockups sind kein Code: abgelesen werden Aufbau, Abstände, Farben und Texte.

## 1. Ziel

Die Oberfläche bekommt das Aussehen des Mockups: dunkler, warmer Grund, kräftiges Orange mit Verlauf, farbige Symbol-Kacheln, **eine** gemeinsame Zeile für Aufgaben, Karten, Wächter, Einstellungen und Hinweise. Dazu kommen die wenigen Funktionen, die das Design mitbringt und die es in 1.18.2 noch nicht gibt: **Symbol pro Karte**, **Filter-Sheet**, **Mitteilungen** (Glocke), Wochenleiste und Stats-Leiste, Wächter-Ablauf mit Verlauf der Entität.

Nicht Ziel: ein anderes Navigationsmodell erzwingen, Funktionen aus 1.18.2 streichen (Zuhause, Gefunden, Weitergeben, Fairness, Rolle Kind, Haus-Kanäle), die Desktop-Fassung.

## 2. Befund: Briefing gegen Repository

Das Briefing nimmt 1.8.0 an. Seitdem sind zehn Minor-Versionen und mehrere Stufen (1 bis 4) dazugekommen. Vieles, was es als neu beschreibt, gibt es schon.

| Briefing sagt | Stand 1.18.2 | Folge |
|---|---|---|
| Ausgangslage 1.8.0, drei Reiter (Aufgaben, Boards, Wächter) und eine Agenda | **Vier Reiter**: Heute, Boards, Kalender, Zuhause (`lib/tabs.ts`). Die Agenda ist als Ansicht „Liste" in den Kalender gezogen. Für Kind und Docker ohne HA sind es drei Reiter | **Kollision**, siehe Fragen 7 bis 9. Reiter und Seiten lassen sich nicht 1:1 aus dem Mockup übernehmen |
| Kanban/Liste-Umschalter entfällt, Spalten-Tabs auf dem Handy, ab Tablet nebeneinander | Gibt es: `ColumnTabs` mobil, ab 1024 px Spalten nebeneinander (`App.svelte`) | Nur Optik (Segmented) |
| Board-Wechsel mit Vorlagen | `BoardSwitcher` mit Vorlagenliste (eingebaut und eigene), Vorschau der Anzahl Spalten, Kategorien, Karten | Optik; Vorlagen als Auswahl-Chips statt Dropdown |
| Schnell-Eingabe mit entfernbaren Chips „falls noch nicht umgesetzt" | Umgesetzt (Stufe 1, `lib/quickadd`, `QuickText`, `QuickChips`, deutsch und englisch) | Nur Optik; das Symbol-Abzeichen kommt dazu |
| Profilfotos aus HA, gecacht, Ingress-tauglich (6.10) | Umgesetzt (Migration 20, `avatars.ts`, `api/people-avatar.ts`, `Avatar.svelte`, Upload) | Nur Form: Avatar ist heute ein abgerundetes Quadrat (9 px), im Mockup ein Kreis |
| „Falls Englisch schon umgesetzt ist": Texte über Sprach-Schlüssel | Umgesetzt (`t()`, `tn()`, `tx()`, Kataloge `en.ts` in Web und Server, Abdeckungstests) | Alle neuen Texte zweisprachig |
| Verlauf der Entität (3 Std.), vorher prüfen, ob das Supervisor-Token die HA-History darf | Das Token darf es: `ha.getHistory` (`history/history_during_period`) und `POST /api/watchers/dry-run` laufen seit Stufe 4 (7 Tage, höchstens 20 000 Zustände, `DryRunPanel`) | Keine Prüfung mehr nötig. Neu ist nur ein Abruf „letzte 3 Stunden" mit Schwellen-Linie |
| Wächter bearbeiten als Ablauf, anlegen als Assistent | Heute ein **Satz** mit antippbaren Feldern, „Mehr Regeln", Vorlagen, Probelauf, Gefunden (Stufe 4, `WatcherSheet`, `WatcherSentence`) | **Kollision** mit einer bewussten Stufe-4-Entscheidung, siehe Frage 12 |
| Wächter-Reiter: Wartet auf jemanden, Läuft gerade, Kommt bald, Ruhig | Genau diese Abschnitte gibt es als **Zuhause** (`HomeView`, `GET /api/home`) | Nur Optik; das Mockup „Wächter" ist funktional schon „Zuhause" |
| Banner „Stups hat 3 passende Automationen gefunden", gehört zu einem anderen Auftrag | In 1.18.x gibt es etwas anderes mit ähnlichem Platz: „Stups hat N weitere Geräte gefunden" (`FoundSheet`, Vorlagen-Erkennung) | **Namensverwechslung**, siehe Frage 11 |
| Einstellungen: Wächter-Zeile entfällt, Zusammenfassung als Zeile, Dashboard unter „Home Assistant", Umzug unter „Daten" | Einstellungen sind schon Unterseiten (`settingsGroups`): Wächter unter Haushalt, Dashboard und Kopfzeile unter Home Assistant, Umzug unter Hilfe und Daten | Optik. Neu ist nur die Zeile **Tageszusammenfassung mit Uhrzeit** |
| Personen & Zugriff mit Foto, Rolle, Geräten, Ruhezeit, „Wartet auf Freigabe", „Person hinzufügen" | Gibt es (`PeopleSheet`); Ruhezeit der eigenen Person zog nach „Benachrichtigungen" | Optik, Zeilenaufbau |
| Warum kommt nichts? mit „x / y Geräte erreichbar" | Gibt es als Seite mit Stand-Bericht (`PushReport`, `PersonDelivery`) | Prüfen, ob die Zahl x/y schon geliefert wird; sonst kleine Server-Ergänzung ohne Migration |
| Nicht erwähnt | **Rolle Kind** (Erlaubnisliste in `child-guard.ts`, Bestätigung durch Eltern), **Fairness „Diese Woche"** (`WeekSheet`), Weitergeben, Erst vorschlagen, Wenig Zeit, Haus-Kanäle, Beta-Kanal, Akzentfarbe je Person | Müssen im neuen Design einen Platz behalten, siehe Fragen 9, 10, 13 |
| Nicht erwähnt | Stufe 4 verbietet ausdrücklich **Emoji, Illustrationen, Kennzahl-Kacheln**, setzt **Bricolage Grotesque** (lokal) und **Türkis als zweite Stimme** (nur „vom Haus") | Das Mockup tut das Gegenteil, siehe Fragen 14 bis 16 |

**Was wirklich neu ist:** Symbol pro Karte (Migration), Symbolwahl mit Suche, Termin-Sheet mit Uhrzeit-Rad, Kategorie im Formular anlegen, Filter-Sheet, Stats-Leiste, Wochenleiste mit Punkten, Stups-Banner oben, Mitteilungen (Server-Abfrage, Lese-Marker), Ablauf-Ansicht und Assistent im Wächter-Editor mit 3-Stunden-Verlauf, Zeile Tageszusammenfassung, Foto-Ansicht mit Original und Sichern (prüfen), Gestaltungssystem selbst (Tokens, Bausteine).

## 3. Abgleichstabelle

Umfang: **Optik** = nur Aussehen und Aufbau, keine neue Funktion; **Funktion** = neue Oberfläche oder neue Logik ohne Datenbank; **Migration** = neue Spalte oder Tabelle.

| Mockup | Heutige Komponente (1.18.2) | Umfang | Kollision mit 1.18.2 |
|---|---|---|---|
| `Main` (Aufgaben) | `TodayView` (Start), `AgendaView` (jetzt Kalender › Liste), `TabBar`, `TopBar` | Funktion (Stats, Wochenleiste, Stups-Banner, Chips, Gruppen) | **Hoch**: Mockup-Reiter „Aufgaben" ist weder Heute noch Agenda. Fragen 7 und 8 |
| `Boards` | `App.svelte` (Boards-Zweig), `ColumnTabs`, `ColumnList`, `CardItem` | Optik; Chips Meine/Alle/Person neu geordnet | Mittel: heute zwei Filtermodelle (`ui.filter` in Boards, `ui.sf` in Agenda/Kalender); Wischen und Ziehen in `CardItem` bleiben |
| `Waechter` | `HomeView` (Zuhause) | Optik | Hoch bei Stufe-4-Regeln (Fragen 14 bis 16); der Name „Wächter" im Mockup steht für Zuhause; das Hero-Bild ist eine Illustration (Fragen 4 und 16) |
| `NeueAufgabe` | `NewCardSheet`, `CardProps`, `QuickText`, `QuickChips` | Funktion (Symbol, Kategorie inline, Notiz getrennt) | Gering. „Wer zuerst heimkommt" für Karten: Frage 3 |
| `SymbolWaehlen` | neu | Funktion + **Migration** (`cards.icon` …) | Keine; Bibliothek siehe Frage 5 |
| `TerminWaehlen` | native Felder in `CardProps`, `RecurrenceEditor` | Funktion (eigener Monatskalender, Uhrzeit-Rad) | Barrierefreiheit (Abschnitt 7) |
| `Filter` | `ScheduleFilterBar` (Wer, Boards, Erledigte), Boards-Chips | Funktion (Wann, Priorität, offener Stups, nur Wächter, Sortierung, Trefferzahl) | Mittel: zwei Filtermodelle zusammenführen (Frage 17) |
| `KarteDetail` | `CardSheet`, `CardProps` | Optik; Eigenschaften als Chips | Gering |
| `KarteMenu` | `CardMenu` | Optik | Gering. Mockup „Löschen: 30 Tage im Papierkorb" stimmt mit 1.18.2 überein |
| `Stupsen` | `NudgeSheet` | Optik, Vorschau der Push-Nachricht | Emoji in den Texten (Frage 14); Texte kommen aus `lib/nudge` und Server-Katalog |
| `Foto` | `Lightbox` | Optik; Zeilen Sichern, Original, Entfernen prüfen | Gering |
| `KalenderWoche`, `KalenderMonat` | `CalendarView`, `SlotSheet` | Optik | Mittel: Mockup kennt „Tag/Woche/Monat", 1.18.2 zusätzlich „Liste" |
| `BoardWechseln` | `BoardSwitcher` | Optik; Board-Kachel nutzt `boards.icon`/`boards.color` (Spalten gibt es, die Oberfläche nutzt sie nicht) | Gering, keine Migration |
| `BoardEinstellungen`, `Archiv`, `Papierkorb` | `BoardSettings`, `ArchiveSheet`, `TrashSheet` | Optik | Gering |
| `WaechterC` (bearbeiten) | `WatcherSheet`, `WatcherSentence`, `DryRunPanel` | Funktion (Ablauf aus Karten, 3-Std.-Verlauf, Reihenfolge mit Fotos) | **Hoch**: ersetzt den „Satz" (Frage 12); Rechte: Nicht-Administratoren lesen nur |
| `WaechterB` bis `B4` (anlegen) | `WatcherSheet` + Vorlagen + `FoundSheet` | Funktion (Assistent in 4 Schritten) | Hoch, wie oben; Vorlagen und Gefunden müssen im Assistenten Platz finden |
| `Einstellungen` | `SettingsSheet`, `settings/*Page` | Optik; Zeile Tageszusammenfassung neu | Gering. Mockup zeigt „Wächter" nicht mehr in den Einstellungen, 1.18.2 hat dort die Verwaltung (Haushalt › Wächter); bleibt |
| `Personen` | `PeopleSheet` | Optik | Gering |
| `PushStand` | `settings/PushReport`, `PersonDelivery` | Optik; x/y Geräte prüfen | Gering |
| `DashboardButton` | `settings/DashboardPage` | Optik; Vorschau-Karte | Sensorname: heute `sensor.stups_heute_faellig` (Beta: `sensor.stups_beta_…`) stimmt |
| `Mitteilungen` | neu | Funktion + eine kleine **Migration** (Lese-Marker), Server-Route | Rolle Kind; Datenquellen siehe Frage 2 |
| `Anmelden`, `Konto` | `AuthView`, `AccountPage`, `PasskeySettings` | Optik | Docker bekommt nichts Neues (Stufe 4), nur Optik |
| `KeinZugriff` | `NoAccess` | Optik | Keine |
| `Dialoge` | `ConfirmDialog`, `Toasts` | Optik | Keine |
| (im Mockup nicht vorhanden) | `WeekSheet` (Fairness), `FoundSheet`, Haus-Kanäle in `PeopleSheet`/`HouseChannels`, `BetaPage`, Rolle Kind überall | Optik, **Platz nötig** | Frage 10 und 13 |

## 4. Gestaltungssystem

### 4.1 Tokens

- Alle Werte als Tailwind-`@theme` in `app.css`; **keine Hex-Werte in Komponenten**. Heute erfüllen das schon fast alle: ein Zähl-Lauf findet außerhalb von `app.css` nur vier Stellen (`Avatar.svelte` Textfarbe und Rückfallfarbe, `AccentPicker.svelte` Verlaufsring, `lib/image.ts` Weiß für Transparenz) und wenige Tailwind-Paletten in `Lightbox`, `ConfirmDialog`, `CardSheet` (`text-white`, `bg-black`). Ein Test (Quelltext-Suche, Vorbild `i18n-coverage.test.ts`) hält das künftig fest.
- Das vorhandene Schema bleibt: Variablen in `:root` (dunkel) und im `prefers-color-scheme: light`-Block, darüber `@theme inline`. Neu dazu: Kachel-Verläufe (`--tile-orange-from/-to/-fg` … acht Farben), Banner-Verläufe (lila, warm), Radien (16 Box, 26 Sheet, 18 Knopf, 11 Kachel), Abstände (12 Rand, 8 Box, 14 Block), Touch-Ziel 44.
- **Akzentfarbe je Person bleibt** (`AccentPicker`, `lib/accent.ts`, Kopie in `server/src/accent.ts`, Test `accent-color.test.ts`). Der Orange-Verlauf des Mockups (`#FF8A1F → #E85D04`) ist deshalb nicht fest, sondern wird aus `--accent2`/`--accent` gebildet. Das Mockup zeigt nur die Standardfarbe.
- Schrift: **Inter 400 bis 800, lokal** gebündelt (`@fontsource-variable/inter`, OFL), kein Google-CDN (die Mockups laden Inter von `fonts.googleapis.com`; im Add-on geht das nicht, Ingress und Datenschutz, Stufe 4). Bricolage Grotesque entfällt, wenn Frage 14 so entschieden wird.

### 4.2 Bausteine

Die zehn Bausteine des Briefings, als Svelte-Komponenten unter `components/ui/`. Namensfalle: `components/Row.svelte` gibt es schon, es ist die **Beschriftung-und-Wert-Zeile der Einstellungen**. Die neue Zeile heißt `ListRow`; `Row.svelte` bleibt, bis Phase 5 die Einstellungen umbaut, und wird dann entweder in `ListRow` aufgelöst oder in `SettingRow` umbenannt.

| Baustein | Anmerkung zum Bestand |
|---|---|
| `ListRow` (68 px; Haken, Kachel, Titel, Meta, genau ein rechtes Element) | ersetzt die Zeilen in `TodayView`, `CardItem`, `HomeView`, `WatchersList`, `Group`+`Row`. `CardItem` behält Wischen und Ziehen; die Wisch-Fläche wird die neue Zeile |
| `Tile` (34, 42, 52) | neu; Farbe aus der Kartenfarbe oder der Kategorie |
| `Chip`, `Segmented`, `Toggle` | `ColumnTabs`, `AccentPicker`-Knöpfe, Checkboxen (`input type=checkbox` in `WatcherSheet`) werden ersetzt; Toggle bekommt `role="switch"` |
| `SectionHeader` (mit Zähler, Einklappen) | ersetzt die `h2` in `TodayView`/`HomeView` |
| `Sheet` (Radius 26, Kopf links/Mitte/rechts, Fuß mit großem Knopf) | `Sheet.svelte` besteht und kann den Fuß-Slot bekommen; Verhalten (Tastatur, Wischen, Escape) bleibt |
| `TabBar` | heute eine schwebende Kapsel mit vier Reitern; Mockup ist eine flache Leiste. Frage 8 |
| `StatsBar` (3 Zellen) | neu |
| `Avatar` | Form wird Kreis; Bild und Initiale wie heute |
| `Banner` (lila, warm) | neu; ersetzt die Türkis-Karten „Vom Haus" nicht (Frage 15) |

### 4.3 Bild für „Deine Wächter"

Das Mockup liefert ein Hero-Bild (`waechter-karte.png`, 159 KB, Text im Bild, nicht scharf) und den Roboter allein (`waechter-robot.png`, 162 KB). Text bleibt echter Text und übersetzbar. 162 KB für ein Bild, das auf 60 px erscheint, ist zu groß: als SVG nachzeichnen oder auf höchstens 10 KB als WebP verkleinern. Herkunft und Rechte des Bilds klären, das Repository ist öffentlich (Frage 4). Die `avatar-*.png` werden nicht kopiert und nicht ins Repository gelegt; Screenshots und Tests benutzen erfundene Bilder.

## 5. Navigation und Seiten (Vorschlag, hängt an den Fragen 7 bis 10)

- **Vier Reiter bleiben** (Heute, Boards, Kalender, Zuhause); Kind und Docker ohne HA sehen drei. Leiste im neuen Stil.
- **Kopfzeile** (`TopBar`): Logo und Wortmarke „stups.", rechts Glocke (erst ab Mitteilungen, vorher nicht anzeigen: kein toter Knopf), Avatar. **Kein Zahnrad**: Der Avatar öffnet weiter die Einstellungen (Stufe 4); das Mockup zeigt Zahnrad und Avatar nebeneinander, das wäre eine doppelte Tür. „‹ Dashboard" im Add-on bleibt.
- **Heute** behält seine Aufgabe (was ist für mich dran, was kam vom Haus) und bekommt: Stats-Leiste, Wochenleiste, Stups-Banner („X stupst dich" mit Text des offenen Stupses, Quelle `openNudges`), Chips Meine/Alle/Person und die Gruppen Überfällig, Heute, Diese Woche, Später. „Vom Haus" bleibt oben, solange es Karten gibt. „Bei den anderen" und der Weg zu „Diese Woche" (Fairness) bleiben als eine Zeile am Ende. Details in Frage 7.
- **Kalender**: Tag, Woche, Monat, Liste (Agenda). Das Mockup-Kalender-Symbol auf der Wochenleiste öffnet den Kalender-Reiter. Gruppierte Liste („Überfällig … Später") ist eine sinnvolle Variante der Liste, falls Frage 7 anders ausgeht.
- **Zuhause**: Optik wie `Waechter`; Hero-Bild nur im Leerzustand.
- **Boards**: Kopf mit Board-Auswahl-Leiste (öffnet `BoardSwitcher`), Chips (Meine/Alle/Personen, Filter), Kategorien-Chips, Segmented für Spalten, Zeilen; ab 1024 px Spalten nebeneinander wie heute.

## 6. Neue Funktionen im Einzelnen

### 6.1 Symbol pro Karte (Migration 22)

- **Daten:** `cards.icon text` (mdi-Name ohne Präfix, z. B. `washing-machine`; null = Standard „Aufgabe"), `cards.icon_color text` (Name aus den acht Kachel-Farben; null = Auto), `cards.icon_source text check in ('auto','manual')`. Nur `alter table … add column` (kein Umbau der Tabelle). Standard bleibt null; **keine** Massenerkennung in der Migration, sondern auf Wunsch ein Knopf „Symbole aus Titeln erkennen" (Entscheidung offen, Frage 18). Boards behalten `icon`/`color`, die schon existieren.
- **Server:** `store/validate.ts` prüft Form (`^[a-z0-9-]{1,48}$`, Farbe aus der Liste); ob der Name zur Bibliothek gehört, weiß nur die Oberfläche (unbekannt = Standardsymbol). Kartenfeld in `Card`, Delta-Sync, Kopieren (Duplizieren), Wiederholung (`CarryField`: Symbol wird immer übernommen), Board-Vorlagen (`templates.ts`, Karten mit Symbol), Wächter-Kartenvorlage (`card_json` bekommt optional `icon`, kein Schema-Umbau), Automations-Karten (`automation-cards.ts`, optional `icon`), Export/Umzug (`transfer.ts`), Papierkorb/Archiv.
- **Oberfläche:** reine Funktion `lib/symbols/detect.ts` (Titel → Symbol, deutsch und englisch, Tabelle statt Heuristik, testbar), `lib/symbols/library.ts` (Auswahl, siehe Frage 5), Sheet „Symbol wählen" (Suche, Vorschläge, zuletzt benutzt in `localStorage`, Bereiche, Farbe Auto oder fest). Das Funken-Abzeichen zeigt `icon_source = 'auto'`. Ändert jemand den Titel und die Quelle ist `auto`, wird neu erkannt; bei `manual` nie.
- **Wächter-Karten:** Symbol der Entität (`attributes.icon`, oft nicht gesetzt) mit Rückfall auf eine Tabelle nach `device_class` und Domäne (waschmaschine, Fenster, Batterie, Saugroboter …).
- **Kind:** Kein Kind legt oder ändert Karten (Erlaubnisliste), also keine neue Freigabe. Kinder sehen die Symbole.

### 6.2 Neue Aufgabe

Termin über eine Zeile, die das Sheet „Termin wählen" öffnet (Monatskalender, Uhrzeit, „Kein Termin"); keine Schnellwahl-Chips. Kategorie inline anlegen (Name, Farbe, „Anlegen"; `api.addCategory` gibt es, heute nur in `BoardSettings`; die Rechte der bestehenden Route gelten unverändert, ein Kind legt ohnehin nichts an). Notiz als eigenes Feld (`description`). Unter „Mehr" Checkliste und Foto/Link. „Wer zuerst heimkommt" bei Handkarten: nach Empfehlung ausgeblendet (Frage 3).

### 6.3 Filter

Sheet „Filter" mit Wer, Wann (Überfällig, Heute, Diese Woche, Später, Ohne Termin), Boards, Priorität, „Nur mit offenem Stups", „Nur von Wächtern", „Erledigte anzeigen (letzte 7 Tage)", Sortierung (Fälligkeit, Priorität, Neueste), Knopf mit Trefferzahl. Reine Funktion in `lib/filters.ts`/`lib/schedule.ts` erweitert (`ScheduleFilter`), Auswahl pro Gerät im Merkzettel (`stups.schedule`, ältere Merkzettel bleiben lesbar, Test). Keine Datenbank, kein neuer Server-Weg: alles aus `GET /api/schedule` und den Kartenfeldern (`openNudges`, `watcherId`, `priority`, `completedAt`).

### 6.4 Mitteilungen (Glocke)

- **Was es wirklich gibt:** `nudges` (Absender, Empfänger, Text, Antwort `ack`/`done`/`later`, Zeiten), `completions` (wer, wann), `comments`, `card_events` (nur **moved, reopened, due**), `watcher_runs` (Ergebnis `created`, `assigned`, `passed`, `suggested`, `claimed` …, mit Karte und Zuständigen), `sent_notifications` (Art due/reminder/nag/summary, je Person, Status sent/skipped/failed, Zeit). Das ist das „Push-Protokoll". **Es gibt keinen Posteingang je Person und keinen Gelesen-Zustand.**
- **Überfällig** ist keine Meldung, die irgendwo steht, sondern eine Eigenschaft einer Karte; als Eintrag kommt sie aus `sent_notifications` (`nag`, `due`) oder wird aus der Karte abgeleitet. Vorschlag: nur aus `sent_notifications` (was die Person wirklich bekommen hat).
- **Server:** `GET /api/inbox?since=` baut die Liste aus den genannten Tabellen für **die anfragende Person** (an sie gestupst, auf ihre Karten, von ihr gestupst und beantwortet, Wächter-Karten für sie, Kommentare auf ihren Karten, Erledigungen auf Karten, die sie angelegt oder gestupst hat), höchstens 14 Tage und 100 Einträge, nach Zeit. Keine neue Tabelle für die Einträge selbst. Indexe auf `nudges`, `comments`, `completions` nach Zeit prüfen (EXPLAIN im Test).
- **Gelesen:** `users.inbox_seen_at text` (Migration 23); „Alle gelesen" setzt jetzt; ein Eintrag gilt als ungelesen, wenn `at > inbox_seen_at`. Einzelne Einträge lassen sich so nicht lesen; das reicht für den Punkt an der Glocke. `PUT /api/me/inbox-seen`.
- **Kind:** darf `GET /api/inbox` und `PUT /api/me/inbox-seen`, aber der Server filtert auf Einträge zu **eigenen** Karten und zu Stupsen an das Kind (wie die Sichtbarkeitsregeln in `child-guard.ts`: Boards ohne eigene Karten gibt es für das Kind nicht). Der Test in `child-guard.test.ts` wird um beide Routen und um „fremdes Board erscheint nicht" erweitert.
- Texte der Einträge entstehen in der Oberfläche aus Art und Daten (zweisprachig, `t()`), nicht als fertiger Satz aus dem Server, damit die Sprache der Person gilt.

### 6.5 Wächter-Editor

- **Bearbeiten:** Ablauf aus Karten WENN → DANN KARTE → AN WEN → ERLEDIGT SICH SELBST, Feinschliff als Chips; Knöpfe „Testen" (heutiger Probelauf, `POST /api/watchers/dry-run`) und „Speichern". Alle Felder des heutigen Satzes bleiben erreichbar (Sperrzeit, Zähler, Erinnern, Fälligkeit, Erledigen-Bedingung); nichts, was `WatcherSheet` kann, darf verloren gehen (Tabelle „Verbleib" im Plan, abgesichert durch `watcher-form.test.ts` und Browser-Test).
- **Anlegen:** Assistent in vier Schritten (Wenn, Dann, Wer, Feinschliff) mit Zusammenfassungssatz am Ende. Die Vorlagen (Gefunden) münden in Schritt 1 mit vorbelegten Werten. Die Zuweisungsarten des Mockups entsprechen den Modi `fixed`, `rotation_present`, `first_home`, `all_present`, `none`; `rotation` (alle, auch Abwesende) und `suggest` („Erst vorschlagen") fehlen im Mockup und werden unter „Wer" ergänzt.
- **Verlauf der Entität:** neue Route `GET /api/watchers/history?entity=&hours=3` (nur Administratoren und Mitglieder wie `GET /api/watchers`; Kind verboten) über `ha.getHistory`, bei Zahlenwerten mit Schwellen-Linie und Markierung des Auslösepunkts; ohne Recorder oder ohne Verbindung ein Hinweis statt Diagramm (wie `DryRunPanel`). Kein Datenbank-Eingriff.
- **„An wen" mit Fotos:** Reihenfolge, wer als Nächstes dran ist, wer unterwegs ist (`presence.ts`, `home.ts` liefern das schon für die Zuweisung; eine kleine Abfrage `GET /api/watchers/:id/order` oder Felder in `GET /api/watchers` ergänzen).
- **Vorschlags-Banner:** Platz vorsehen, Inhalt erst mit dem Auftrag „Automationen als Auslöser" (Frage 11).

### 6.6 Einstellungen, Personen, Sonstiges

- Zeile **Tageszusammenfassung** mit Uhrzeit: heute ist `daily_summary_time` nur eine Add-on-Option (`config.ts`, Standard 08:00), keine Einstellung in der App. Soll die App sie ändern, braucht es einen Eintrag in `settings` (Schlüssel/Wert, **keine Migration**) und Vorrang vor der Add-on-Option; sonst nur Anzeige. Entscheidung offen (Frage 19).
- „Zurück zum Dashboard", HA-Kopfzeile, Dashboard-Button, Umzug: Inhalt wie heute, Zeilenoptik.
- Das Mockup nennt die Version „Stups 1.8.0"; die App zeigt die echte Version aus der Konfiguration.

## 7. Barrierefreiheit (mindestens heutiger Stand)

Nachgerechnet (WCAG-Kontrast), Mockup-Farben gegen den heutigen Stand:

| Paar | Verhältnis | Befund |
|---|---|---|
| Weiß auf Orange-Verlauf `#FF8A1F` (oberer Rand) | **2,36 : 1** | schlechter als heute (Weiß auf `#f2500f`: 3,54 : 1) |
| Weiß auf `#E85D04` (unterer Rand) | 3,50 : 1 | auf heutigem Stand |
| Orange-Text `#FF8A1F` auf `#0E0D0D` | 8,23 : 1 | gut |
| Hinweis `#A29DA0` auf `#171415` | 6,86 : 1 | gut |
| Platzhalter `#7A7577` auf `#171415` | 4,04 : 1 | knapp unter 4,5 |
| Trenner „•" `#57525A` auf `#171415` | 2,41 : 1 | nur Zierde, Bedeutung steckt im Text |
| Kachel-Symbol Orange `#FFF1E6` auf `#FF9124` | 2,03 : 1 | unter 3 : 1; Symbol ist Zierde (`aria-hidden`), Titel trägt die Bedeutung |
| Kachel-Symbol Grün `#ECFFD6` auf `#62A11F` | 2,99 : 1 | knapp |
| Ring des Erledigt-Kreises `#71717A` auf `#171415` | 3,79 : 1 | gut (Bedienelement, 3 : 1) |

Folgerungen: Das Orange der Knöpfe wird für Text auf Orange so abgedunkelt, dass **jeder Punkt des Verlaufs mindestens 3,5 : 1** erreicht (z. B. oberer Rand `#E05A00`: 3,73 : 1, `#D94F00`: 4,14 : 1). Das ändert den Glanz leicht und gehört in die Abnahme von Phase 1. Platzhalter und Nebentexte nie unter 4,5 : 1. Dazu bleibt: Fokusring (`:focus-visible`), Beschriftungen an allen Symbol-Knöpfen (`aria-label`), 44-px-Ziele (Haken: Fläche 32 × 44), `prefers-reduced-motion`, `role`/`aria-checked` an Segmented und Toggle, Reihenfolge per Tastatur.

Neue Risiken: **Uhrzeit-Rad** (Mockup) und **eigener Monatskalender** sind als eigene Steuerelemente nur mit viel Sorgfalt barrierefrei; Vorschlag: zwei Listen (`role="listbox"`, Pfeiltasten), Eingabe per Tastatur zusätzlich möglich, das native `<input type="time">` als Rückfall im Test. **Farbe nie als einziger Träger**: „vom Haus" braucht neben Farbe ein Wort oder Zeichen (Frage 15).

## 8. Rechte, Daten, Betrieb

- **Kinder-Rechte:** Jede neue Route ist für Kinder verboten, bis sie in `api/child-guard.ts` (`ALLOWED`) und im Test `child-guard.test.ts` (liest `test/fixtures/api-routes.json`) freigegeben ist. Neue Routen: `GET /api/inbox`, `PUT /api/me/inbox-seen` (beide mit Kindfilter, siehe 6.4), `GET /api/watchers/history` und eventuell `GET /api/watchers/:id/order` (verboten). Kartenfelder für Symbol laufen über bestehende Routen (`PATCH /api/cards/:id`, verboten für Kinder).
- **Migrationen:** 22 (Symbol an Karten) in Phase 3, 23 (Lese-Marker) in Phase 6. Beide nur `alter table add column`, beide mit Sicherung davor (macht `openDb`, letzte fünf Sicherungen) und mit Migrationstest nach dem Muster von `db.test.ts` („keeps data and backs up the file before applying a newer migration"): Datenbank im Stand 21 mit Beispielkarten, Wächtern, Stupsen aufbauen, öffnen, Daten gleich, Sicherung da, Version erhöht, Rückfall bei Fehler. Der Slug `stups` (und `stups_beta`) wird **nie** geändert, nichts wird deinstalliert.
- **Form-Absicherung:** `test/shape.test.ts` und `test/fixtures/api-routes.json` mit `UPDATE_SHAPE=1` neu erzeugen und mitnehmen.
- **i18n:** Jeder neue Text steht in `t()`/`tn()`/`tx()` mit Eintrag in beiden Katalogen (`web/src/lib/i18n/en.ts`, `server/src/i18n/en.ts`); Abdeckungstests laufen in `pnpm test`; neue Suchwörter für Symbole in zwei Sprachen. Die Texte des Mockups (z. B. „Conny stupst dich! 👋") werden Schlüssel.
- **Beta zuerst:** Jede Phase ist ein eigenes Beta-Release (`X.Y.0-beta.1` in `stups-beta/config.yaml`, Changelog). Stabil erst nach Freigabe (Frage 20). `main` ist laut Auftrag der Beta-Zweig; die Entwicklerdoku nennt dafür den Zweig `beta`: vor dem ersten Release abgleichen.
- **Screenshots:** nach jeder Phase `node e2e/screenshots.mjs` (deutsch und `--lang en`), neben die Mockups gelegt. Beispieldaten erfunden, keine Fotos aus dem Paket.

## 9. Offene Fragen an den Nutzer

Die sechs Fragen des Briefings (1 bis 6) und die beim Lesen gefundenen (7 bis 20). Empfehlungen stehen im Abschlussbericht und hier knapp; **keine ist beschlossen**.

1. **Hellmodus.** Empfehlung: **beide behalten**, Hell aus den Tokens ableiten. Heute laufen alle Farben über Variablen mit Hell- und Dunkelsatz (`app.css`); außerhalb davon gibt es vier Hex-Stellen. Hell kostet in Phase 1 rund 25 zusätzliche Variablen (Kachel-Verläufe, Banner, Chips) und die Browser-Projekte `hell`/`dunkel` laufen schon. Nur-Dunkel würde eine vorhandene Funktion streichen.
2. **Mitteilungen jetzt oder später.** Empfehlung: **eigenes Release danach** (Phase 6). Es braucht eine Server-Abfrage über sechs Tabellen, einen Lese-Marker (Migration 23), einen Kindfilter und Tests; Glocke bis dahin nicht anzeigen.
3. **„Wer zuerst heimkommt" für normale Karten.** Empfehlung: **nur Wächter**, im Formular ausblenden. `first_home` lebt in der Warte-Logik der Wächter (`watcher_waiting`, Anwesenheit); für Handkarten wäre eine eigene Tabelle, Push-Regel und ein Rückfall nötig (Migration, neues Verhalten).
4. **Bild „Deine Wächter".** Empfehlung: Roboter als Bild, Text echt und zweisprachig, **nur im Leerzustand und im Kopf von Zuhause, nicht dauerhaft über der Liste**; Bild verkleinern (162 KB sind zu viel); Herkunft und Rechte klären (öffentliches Repository). Das Hero-Bild in Originalauflösung abwarten.
5. **Symbol-Bibliothek.** Empfehlung: **rund 300 Symbole fest einbauen**, Suche nur darüber. `@mdi/js` hat rund 7 400 Symbole und 6,5 MB entpackt; 300 Pfade sind roh etwa 60 bis 80 KB (gzip um 25 KB), per Build-Skript aus `@mdi/js` (nur Entwicklungsabhängigkeit) gezogen. „Alle HA-Symbole bei Verbindung" nicht in diesem Auftrag: nach meinem Stand liefert HA die mdi-Pfade über keine stabile Schnittstelle (sie stecken in den Frontend-Paketen), das ist vor einer Zusage in einem kurzen Spike zu prüfen.
6. **Reihenfolge gegenüber den offenen Aufträgen.** Empfehlung: **Design zuerst**, aber Phase 4 (Wächter-Editor) erst nach der Entscheidung über „Automationen als Auslöser", weil der Editor dessen Auslöser aufnehmen muss. `briefing-stups-ausbau.md` liegt nicht im Repository und nicht im Paket; ich konnte die Frage nicht an seinem Inhalt prüfen.
7. **Was ist Reiter 1: „Aufgaben" (Mockup) oder „Heute" (1.18.2)?** Empfehlung: **Reiter bleibt „Heute"**, bekommt Stats, Wochenleiste, Stups-Banner, Chips und gruppierte Liste; „Vom Haus" bleibt oben.
8. **Drei Reiter oder vier?** Empfehlung: **vier**. Zuhause ist die Stufe-4-Entscheidung („Wächter als sichtbarer Kern") und das Mockup „Wächter" ist funktional schon Zuhause.
9. **Wohin gehören Kalender und Zuhause?** Empfehlung: Kalender bleibt eigener Reiter (Tag/Woche/Monat/Liste), das Kalender-Symbol der Wochenleiste springt dorthin; Zuhause bleibt Reiter; das Mockup nennt ihn „Wächter", 1.18.2 „Zuhause" (Stufe 4: zeigt den Zustand, nicht die Regeln). Empfehlung: Name „Zuhause" behalten.
10. **Verhältnis zu Rolle Kind und Fairness.** Empfehlung: Kind sieht dieselbe Optik mit drei Reitern, ohne Wächter, ohne Filter „Wer", ohne „Bei den anderen"; Fairness („Diese Woche") bleibt über die Zeile am Ende von Heute, ohne Rangliste, auch im neuen Stil.
11. **Namensfeld „Automationen gefunden".** Empfehlung: Banner im Zuhause heißt vorerst **„Stups hat N weitere Geräte gefunden"** (1.18.2); der Text „passende Automationen" und sein Verhalten gehören erst zum späteren Auftrag.
12. **Satz oder Ablauf im Wächter-Editor?** Empfehlung: **Ablauf und Assistent aus dem Mockup**, der Satz bleibt als Zusammenfassung (Schritt 4) und als kurze Anzeige im Ablauf. Das ersetzt eine Stufe-4-Entscheidung, darum Freigabe nötig.
13. **Wo bleiben Fairness, Haus-Kanäle, Beta, Gefunden im Mockup?** Empfehlung: Orte wie in 1.18.2 (Einstellungen › Haushalt/Home Assistant/Hilfe und Daten; Gefunden über Zuhause), nur im neuen Stil.
14. **Emoji, Schrift.** Das Mockup nutzt Emoji in Texten und Inter; Stufe 4 verbot Emoji und setzte Bricolage Grotesque. Empfehlung: Emoji **nur in Stupsen-Texten** (Vorlagen, Banner „X stupst dich", Push-Vorschau), nirgends sonst; Inter statt Bricolage, lokal.
15. **Türkis „vom Haus" und Kachel-Farben.** Das Mockup kennt keine zweite Stimme und nutzt Türkis frei als Kachelfarbe. Empfehlung: Türkis bleibt als Markierung für Karten und Abschnitte vom Haus (zusätzlich mit Wort oder Zeichen); Kachelfarbe Türkis bleibt in der Symbolpalette, damit das Mockup stimmt.
16. **Kennzahl-Leiste und Illustration.** Stufe 4 verbot Kennzahl-Kacheln und Illustrationen. Empfehlung: **Stats-Leiste erlauben** (nur eigene Zahlen, keine Rangliste, kein Vergleich), Illustration nur im Leerzustand (siehe 4).
17. **Ein Filtermodell oder zwei?** Empfehlung: **ein** Filtermodell (`ScheduleFilter` erweitert) für Heute, Kalender und Boards, Auswahl je Gerät; die Kategorien-Chips der Boards bleiben als Schnellwahl.
18. **Bestehende Karten und Symbole.** Empfehlung: Migration setzt nichts (null = Standard); ein einmaliger, **von der Person ausgelöster** Knopf „Symbole aus Titeln erkennen" statt stiller Massenänderung.
19. **Tageszusammenfassung in der App einstellbar?** Empfehlung: Ja, als Eintrag in `settings` mit Vorrang vor der Add-on-Option, ohne Migration; sonst nur Anzeige.
20. **Stabil pro Phase oder gesammelt?** Empfehlung: Beta pro Phase; **stabil erst nach Phase 2** (erster zusammenhängender Eindruck), danach jeweils nach Phase 3, 5 und 6.

---

## Entscheidungen vom 04.11.2026 (Rückmeldung des Auftraggebers, ersetzen abweichende Empfehlungen oben)

| Thema | Entscheidung |
|---|---|
| Reiter | **3 Reiter wie im Mockup** (Aufgaben, Boards, Wächter). Heute und Kalender gehen in Aufgaben auf, Zuhause heißt wieder Wächter. Das hebt die Stufe-4-Entscheidung für vier Reiter auf. |
| Heute / Kind / Fairness | In Aufgaben integriert: „Vom Haus“ oben (nur Erwachsene), Stats, Wochenleiste, Fairness „Diese Woche“ als Zeile am Ende ohne Rangliste. Kinder sehen nur ihre Karten, ohne Wächter-Reiter und ohne „Wer“-Filter. |
| Hellmodus | Beide Modi bleiben, Hell wird aus den Tokens abgeleitet. |
| Wächter-Editor | Ablauf aus Karten und 4-Schritte-Assistent. Der Satz bleibt als Zusammenfassung. Hebt die Stufe-4-Entscheidung zum „Satz“ auf. |
| Mitteilungen | Eigenes Release danach (Phase 6b, mit Migration für den Lese-Marker). |
| Symbol-Bibliothek | Rund 300 mdi-Symbole fest eingebaut (Build-Skript aus `@mdi/js`, eigene deutsche Suchwörter). |
| Stil | Dem Mockup folgen (Emoji in Stups-Texten, Stats-Leiste, Illustration im Leerzustand). **Inter wird lokal ausgeliefert** über `@fontsource-variable/inter` (OFL-1.1, wie bisher Bricolage), kein CDN. Weiß auf Orange wird so abgedunkelt, dass der Kontrast mindestens dem heutigen Stand (3,54:1) entspricht. |
| Reihenfolge | Erst ein Beta-Release mit den Fixes aus dem Code-Review (Anmelde-Umgehung im Container-Betrieb, Diagnose-Routen, „Rückgängig“ löscht Folgekarte), jeweils mit Test. Danach Phase 0 und 1. |
| Bild „Deine Wächter“ | Roboter als verkleinertes Bild, Text echt und übersetzbar, nur im Leerzustand und im Kopf von Wächter. Original und Rechte liefert der Auftraggeber nach. |
| „Wer zuerst heimkommt“ | Nur bei Wächtern, im Karten-Formular ausgeblendet. Im Wächter-Assistenten (Schritt 3 „Wer“) wählbar sind die vorhandenen Modi `fixed` (immer dieselbe Person), `rotation` (reihum), `rotation_present`, `all_present`, `first_home`, `suggest`, `none`. **Vorausgewählt ist `rotation` (reihum)**; kein Server-Umbau nötig. Hinweis: „Fair“ heißt hier Reihum, nicht nach Aufwand gewichtet. |
| Filter | Ein gemeinsames Modell (`ScheduleFilter` erweitert) für Aufgaben und Kalender, Auswahl pro Gerät gemerkt. |
| Bestehende Karten | Migration setzt nur das Standard-Symbol. Einstellungen bekommen „Symbole aus Titeln erkennen“, von der Person selbst ausgelöst. |

Noch offen (bis zur Freigabe gilt die Empfehlung der Abschnitte oben): Türkis „vom Haus“ (Empfehlung: bleibt, zusätzlich mit Wort oder Zeichen), Tageszusammenfassung in der App einstellbar (Empfehlung: ja, `settings`-Eintrag ohne Migration), Banner-Text zu Automationen (Empfehlung: vorerst „weitere Geräte gefunden“), stabile Releases je Phase (Empfehlung: Beta pro Phase, stabil nach Phase 2, 3, 5 und 6).
