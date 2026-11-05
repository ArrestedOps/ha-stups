# Neues App-Design – Umsetzungsplan

> **Freigegeben am 04.11.2026.** Umsetzung läuft phasenweise; der Stand je Aufgabe steht in den Kästchen. Maßgeblich sind die Entscheidungen am Ende der Spec.

> **Vorausgehendes Release, nicht Teil dieses Plans:** Vor Phase 0 und 1 kommt ein eigenes Beta-Release mit den Sicherheits- und Datenfixes aus dem Code-Review (Anmelde-Umgehung im Container-Betrieb, Diagnose-Routen, „Rückgängig" löscht Folgekarte), jeweils mit Test. Es wird getrennt geplant und umgesetzt; die Phasen unten setzen es voraus, und ihre Versionsnummern sind danach neu zu prüfen.

> **Für ausführende Agenten:** Benötigter Unter-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`).

**Ziel:** Stups bekommt das Aussehen des Mockups (Tokens, eine gemeinsame Zeile, Symbol-Kacheln, Sheets, Leiste) und die wenigen neuen Funktionen (Symbol pro Karte, Filter, Mitteilungen, Wächter-Ablauf mit Verlauf). Ausgangslage: **1.18.2** (vier Reiter Heute, Boards, Kalender, Zuhause; Gefunden, Rolle Kind, Fairness, Personenbilder, Deutsch/Englisch). Zielbild: **drei Reiter** (Aufgaben, Boards, Wächter).

**Architektur:** Zuerst ein Gestaltungssystem (Tokens im `@theme`, Bausteine unter `components/ui/`), dann Bildschirm für Bildschirm darauf umgestellt; die Navigation wird in Phase 2 von vier auf drei Reiter umgebaut. Server fasst nur in Phase 3 (Migration 22: Symbol an Karten), Phase 4 (Verlauf-Route) und Phase 6b (Posteingang, Migration 23) an. Reine Logik (Symbol-Erkennung, Filter, Gruppierung, Posteingang) in testbaren Funktionen.

**Technik:** TypeScript, Fastify, `node:sqlite`, Svelte 5, Tailwind 4, Vitest (feste Uhr), Playwright (WebKit, iPhone).

**Spec:** `docs/superpowers/specs/2026-11-04-neues-design-design.md`

## Globale Vorgaben

- **Jede Phase ist ein eigenes Release, zuerst in die Beta-App** (`stups-beta/config.yaml`: `X.Y.0-beta.1`, Changelog `stups-beta/CHANGELOG.md`, Ablauf nach `docs/entwicklung.md` Abschnitt Beta). Stabil (`stups/`) erst nach Freigabe (Spec Frage 20, noch offen; Empfehlung: nach Phase 2, 3, 5 und 6b). Vorher `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` grün. Den Zweig prüfen: Der Auftrag nennt `main` als Beta-Zweig, die Entwicklerdoku `beta`.
- **Testgetrieben:** erst der fehlschlagende Test, dann die Umsetzung. Zeitregeln immer mit fester Uhr, Browser-Tests nie von der Tageszeit abhängig.
- **Migrationen nur mit Sicherung und Migrationstest.** `openDb` legt die Sicherung an (letzte fünf). Der Test baut eine Datenbank im Vorgängerstand mit Beispieldaten (Karten, Wächter, Stupse, Kind-Person), öffnet sie, prüft: Daten unverändert, neue Spalten mit Standardwert, Sicherung vorhanden, Version erhöht; ein misslingender Schritt rollt zurück (Muster `packages/server/test/db.test.ts`). Eine freigegebene Migration wird nie geändert, nur eine neue angehängt.
- **Der Slug `stups` (und `stups_beta`) wird nie geändert**, nichts wird deinstalliert, kein Datenordner umbenannt.
- **Kinder-Rechte:** Jede neue Route ist für Kinder verboten, bis sie in `packages/server/src/api/child-guard.ts` (`ALLOWED`) **und** im Test `child-guard.test.ts` freigegeben ist. Für jede neue Route steht im Plan ausdrücklich „Kind: verboten" oder „Kind: erlaubt, gefiltert auf eigene Karten". `test/fixtures/api-routes.json` und `shape.test.ts` mit `UPDATE_SHAPE=1` neu erzeugen.
- **i18n:** Jeder neue Text in `t()`, `tn()` oder `tx()` mit Eintrag in `packages/web/src/lib/i18n/en.ts` und, wo der Server Text erzeugt, `packages/server/src/i18n/en.ts`. Die Abdeckungstests (`i18n-coverage.test.ts` in Web und Server) laufen in `pnpm test`. Neue Suchwortlisten (Symbole) zweisprachig. Browser-Projekt `english` bleibt grün.
- **Design-Tokens als Tailwind-`@theme`:** Alle Farben, Verläufe, Radien, Abstände stehen in `app.css`. **Keine Hex-Werte** und keine Tailwind-Paletten (`text-white`, `bg-black`) in Komponenten. Ein Test (Quelltext-Suche wie `i18n-coverage`) hält das fest; die heutigen Ausnahmen (`Avatar.svelte`, `AccentPicker.svelte`, `lib/image.ts`, `Lightbox`, `ConfirmDialog`, `CardSheet`) werden in Phase 1 bereinigt oder mit einem begründeten Eintrag in der Ausnahmeliste versehen.
- **Akzentfarbe je Person bleibt** (`lib/accent.ts`, Kopie `server/src/accent.ts`, `accent-color.test.ts`): Der Orange-Verlauf wird aus `--accent`/`--accent2` gebildet, nicht fest.
- **Hell und Dunkel** wie bisher nach System (entschieden: beide bleiben, Hell wird aus den Tokens abgeleitet). Jeder neue Baustein bekommt beide Werte; Browser-Projekte `hell` und `dunkel` laufen.
- **Barrierefreiheit mindestens auf heutigem Stand:** Fokusring, `aria-label` an Symbol-Knöpfen, 44-px-Ziele, `role`/`aria-checked` an Segmented und Toggle, Kontraste: Text auf Orange mindestens **3,5 : 1 an jedem Punkt des Verlaufs** (heute 3,54 : 1), Nebentexte 4,5 : 1 (Spec Abschnitt 7). Ein Kontrast-Test rechnet die Token-Paare nach.
- **Stufe-4-Regeln: aufgehoben und beibehalten** (Entscheidungen vom 04.11.2026). Aufgehoben: vier Reiter, Satz als Wächter-Editor, Bricolage Grotesque, Verbot von Emoji, Kennzahl-Leiste und Illustration. Erlaubt ist jetzt: Emoji in Stups-Texten, Stats-Leiste (nur eigene Zahlen), Illustration (Roboter, verkleinert) im Leerzustand und im Kopf von Wächter; Schrift Inter, lokal. Bleibt: Türkis für „vom Haus" mit Wort oder Zeichen dazu (Frage 15 noch offen, Empfehlung so), Fairness ohne Rangliste, Weitergeben und Übernehmen für Kinder verboten, Kinder sehen nur ihre Karten, kein Wächter-Reiter, kein „Wer"-Filter.
- **Keine Funktion geht verloren:** Vor jeder Phase die Liste „was kann der heutige Bildschirm" aus dem Quelltext und den Browser-Tests ziehen; jede Funktion bleibt erreichbar (Tabelle „Verbleib" je Phase, abgesichert durch bestehende e2e-Tests, die höchstens mit neuen Selektoren nachgezogen werden).
- **Personenfotos aus dem Paket** (`assets/avatar-*.png`) nie ins Repository, auch nicht in Tests, Screenshots oder Beispieldaten.
- **Screenshots:** Nach jeder Phase `node e2e/screenshots.mjs` und `--lang en`, Ergebnis neben die Mockups.
- **Store aus Teilen** (`store/*.ts`), Form-Fixtures wie oben. Desktop-Fassung ist nicht Teil dieses Plans. Stabil (`main`/`stups/`) wird ohne Freigabe nicht angefasst.
- Commits: deutsch, „Neues Design, Phase N, Aufgabe M: …", mit den Attributionszeilen aus der Sitzung. Es wird erst committet, wenn dieser Plan freigegeben ist.

## Größenschätzung

S = bis etwa 1 Sitzung, M = 2 bis 3, L = 4 bis 6, XL = mehr. Grob und ohne Gewähr; Phase 2 und 4 sind die größten Brocken, weil dort viel Verhalten (Wischen, Ziehen, Sätze, Probelauf) in neue Optik wandert.

| Phase | Inhalt | Release | Migration | Größe |
|---|---|---|---|---|
| 0 | Entscheidungen, Spikes (Symbole, Kontrast, Zeile) | keins | keine | S |
| 1 | Gestaltungssystem, bestehende Screens nutzen es | 1.19.0-beta.1 | keine | L |
| 2 | Drei Reiter; Aufgaben (mit Heute, Kalender-Ansichten, Vom Haus, Fairness), Boards, Wächter, Karte, Karten-Menü, Stupsen | 1.20.0-beta.1 | keine | XL |
| 3 | Symbol pro Karte (300 mdi-Symbole), Neue Aufgabe, Termin-Sheet, Kategorie inline, Knopf Symbole erkennen | 1.21.0-beta.1 | **22** | XL |
| 4 | Wächter-Editor: Ablauf, 4-Schritte-Assistent (Satz als Zusammenfassung), Verlauf | 1.22.0-beta.1 | keine | L |
| 5 | Restliche Screens (Optik der Kalender-Ansichten, Boards verwalten, Einstellungen, Personen, Push, Dashboard-Button, Docker, Dialoge) | 1.23.0-beta.1 | keine | L |
| 6a | Filter (ein Modell für Aufgaben und Kalender) | 1.24.0-beta.1 | keine | M |
| 6b | Mitteilungen (eigenes Release danach) | 1.25.0-beta.1 | **23** | L |

(Profilfotos fallen aus Phase 6 weg: seit Stufe 4 umgesetzt. Das Fix-Beta vor Phase 0 steht nicht in der Tabelle, es gehört nicht zu diesem Plan.)

---

## Phase 0: Entscheidungen und Spikes (kein Release, kein Code im Produkt)

Voraussetzung für alles Weitere.

- [ ] Voraussetzung prüfen: Fix-Beta (Sicherheits- und Datenfixes) ist erschienen. Die vier offenen Punkte der Spec (Frage 11, 15, 19, 20) klären, Antworten in die Spec eintragen, Stand und „freigegeben" setzen.
- [ ] **Vom Auftraggeber nachzuliefern:** Original und Rechte des Roboter-Bilds; bis dahin Platzhalter. Lizenz von Inter (OFL-1.1, `@fontsource-variable/inter`) im Repository vermerken, wie bisher bei Bricolage.
- [ ] **Spike Symbol-Bibliothek:** (entschieden: rund 300 mdi-Symbole fest eingebaut, eigene deutsche Suchwörter) die 300 Symbole aus `@mdi/js` auswählen (Liste aus dem Mockup `NeueAufgabe`/`SymbolWaehlen` als Kern), Größe messen (roh, gzip), Build-Skript als Entwurf. „Alle HA-Symbole" ist nicht Teil des Auftrags. Ergebnis in zwei Sätzen in die Spec.
- [ ] **Spike Kontrast:** Token-Entwurf (dunkel und hell) mit einem kleinen Skript nachrechnen; Verlauf des Orange so wählen, dass Weiß darauf überall mindestens 3,5 : 1 hat.
- [ ] **Spike Tabs:** `lib/tabs.ts` und `tabs.test.ts` auf drei Reiter durchspielen (alte gemerkte Namen `today`, `agenda`, `calendar`, `home`, `watchers`; Kind und Docker ohne HA mit zwei Reitern); Liste der e2e-Specs, die den Reiter „Kalender" oder „Zuhause" benennen (`11-reiter`, `15-kompakt`, `20-haus`, `22-fairness`, `23-kind`, `24-heute`, `26-zuhause-waechter`, `27-gefunden-waechter`, `18-english`).
- [ ] **Spike Zeile:** `ListRow` als Wegwerf-Seite mit Wischen aus `CardItem` ausprobieren (Fingerbewegung, Haken-Fläche 32 × 44, rechtes Element), ob das Wischen mit der 68-px-Zeile gut greift.
- [ ] Prüfen, ob „x / y Geräte erreichbar" (Mockup Push-Stand) aus `GET /api/push/status` schon ableitbar ist.
- [ ] Beta-Zweig klären (`main` oder `beta`) und die Versionsnummern der Phasen bestätigen.

**Abnahme:** freigegebene Spec, Auswahl der 300 Symbole und Größe, Kontrastwerte, Liste der betroffenen e2e-Specs.

---

## Phase 1: Gestaltungssystem (1.19.0-beta.1)

**Ziel:** Tokens, Schrift und die zehn Bausteine; alle bestehenden Screens nutzen sie; **keine Funktionsänderung**. Neu aussehen darf es, anders bedienen nicht.

**Dateien:** `packages/web/src/app.css`, `packages/web/src/main.ts`, `packages/web/src/components/ui/*.svelte` (neu), `Avatar.svelte`, `AccentPicker.svelte`, `Lightbox.svelte`, `ConfirmDialog.svelte`, `CardSheet.svelte`, `Sheet.svelte`, `TabBar.svelte`, `TopBar.svelte`, `Group.svelte`, `Row.svelte`, `package.json` (Inter statt Bricolage, entschieden).

- [x] **1.1 Test:** Quelltext-Test „keine Hex-Werte und keine Palettenfarben in Komponenten" (mit Ausnahmeliste), schlägt zuerst fehl. Test „Kontrast der Token-Paare" (Text auf Fläche, Weiß auf Orange an beiden Verlaufsenden, Nebentext) für Hell und Dunkel. *(erledigt, `test/design-tokens.test.ts`)*
- [x] **1.2** Tokens im `@theme`: Flächen, Linien, Text, Akzentverlauf (aus `--accent`/`--accent2`), Kachelfarben (8 × Verlauf und Symbolfarbe, hell und dunkel), Banner (lila, warm), Radien, Abstände, Schatten. Das Muster der vorhandenen Variablen beibehalten; `accent.ts` (Web und Server) liefert den Verlauf. *(erledigt; Verlauf `--accent` → `--accent-end`, Weiß überall ≥ 3,5 : 1)*
- [x] **1.3** Schrift: Inter lokal (`@fontsource-variable/inter`, OFL-1.1), nur benötigte Schnitte; Bricolage entfernen. Test: kein Verweis auf externe Schrift-Adressen im gebauten Ergebnis (kein CDN). *(erledigt: Inter lokal, Bricolage entfernt, Test gegen Schriftserver)*
- [x] **1.4** Bausteine mit je einem Komponententest (Rendern, Zustände, `aria`): `Tile`, `Chip`, `Segmented`, `Toggle`, `SectionHeader`, `Banner`, `StatsBar`, `ListRow` (genau ein rechtes Element, Varianten Aufgabe, Einstellung, Banner, gefährlich), Sheet-Kopf und -Fuß (großer Knopf). *(erledigt in `components/ui/`: `Tile`, `Chip`, `Segmented`, `Toggle`, `SectionHeader`, `Banner`, `StatsBar`, `ListRow`, `CtaButton`, `SheetFooter`; `test/ui-components.test.ts`)*
- [x] **1.5** `Avatar` wird Kreis, Rückfallfarbe aus Token; `AccentPicker` und `lib/image.ts`: Hex nur noch in der Ausnahmeliste mit Begründung (Verlaufsring, Weiß für Transparenz). *(erledigt: Avatar rund, `AccentPicker`, `Lightbox`, `ConfirmDialog`, `CardSheet` ohne feste Farben; keine Ausnahmeliste nötig)*
- [x] **1.6** Bestehende Screens auf die Bausteine umstellen, ohne Verhalten zu ändern: `TabBar`/`TopBar` (Reiterleiste im neuen Stil, **noch mit den heutigen vier Reitern**; der Umbau auf drei folgt in Phase 2), `Sheet`, `Group`/`Row` (Einstellungen), `ColumnTabs` → `Segmented`, Knöpfe, Checkboxen → `Toggle`. `Row.svelte` (Beschriftung/Wert) in `SettingRow` umbenennen, wenn der Name mit `ListRow` kollidiert. *(teilweise: `TabBar` (noch vier Reiter), `Sheet`, `Group`, `ColumnTabs` → `Segmented`, Plus-Knopf, Schalter „HA-Kopfzeile“. **Verschoben:** `CardItem` → `ListRow` in Phase 2, die übrigen 20 Checkboxen → `Toggle` in Phase 5 mit den Einstellungen, weil die Browser-Tests dort `role=checkbox` nutzen; `Row` behält den Namen, er kollidiert nicht mit `ListRow`)*
- [x] **1.7** Hell-Satz der Tokens, Prüfung beider Themen mit `dunkel`/`hell`-Projekten. *(erledigt, Projekte `dunkel` und `hell` grün)*
- [x] **1.8** e2e nachziehen (Selektoren), Screenshots neu, Release 1.19.0-beta.1. *(erledigt: 198 Browser-Tests grün, Screenshots de/en neu, Release 1.19.0-beta.1)*

**Verbleib:** Alle Funktionen der umgestellten Komponenten (Wischen, Ziehen, Tastatur, Fokus) durch die bestehenden e2e (`1-board`, `3-columns`, `11-reiter`, `15-kompakt`, `19-farbe`, `23-kind`, `25-einstellungen`) abgesichert.

**Abnahme:** Alle Tests grün; bestehende Screens nutzen die neuen Bausteine; Hell und Dunkel stimmig; Kontrastwerte nicht schlechter als 1.18.2; kein Hex in Komponenten.

---

## Phase 2: Drei Reiter und Hauptscreens (1.20.0-beta.1)

**Ziel:** Navigation mit drei Reitern (Aufgaben, Boards, Wächter); Aufgaben nimmt Heute und Kalender auf (mit „Vom Haus", Stats, Wochenleiste, Fairness-Zeile), Boards, Wächter (vormals Zuhause), Karten-Detail, Karten-Menü, Stupsen im neuen Design. Keine Datenbank.

**Abhängig von:** Frage 15 (Türkis „vom Haus", noch offen). Reiter, Kind, Fairness, Stats-Leiste und Illustration sind entschieden.

**Dateien:** `lib/tabs.ts`, `test/tabs.test.ts`, `store.svelte.ts` (Start-Reiter, `stups.tab`, `stups.schedule`), `App.svelte` (Boards-Zweig, besser in `BoardsView.svelte` ausgelagert), `TabBar.svelte`, `TodayView.svelte` (wird zur Aufgaben-Seite), `AgendaView.svelte`, `CalendarView.svelte`, `SlotSheet.svelte`, `WeekSheet.svelte`, `HomeView.svelte` (zeigt den Reiter Wächter), `CardItem.svelte`, `ColumnList.svelte`, `ColumnTabs.svelte`, `CardSheet.svelte`, `CardProps.svelte`, `CardMenu.svelte`, `NudgeSheet.svelte`, `lib/today.ts`, `lib/filters.ts`, `lib/i18n/*.ts` (Reitername), neu `lib/week.ts`. Server: `api/child-guard.ts` und `child-guard.test.ts` nur prüfen (keine neue Route); Wächter-Routen bleiben für Kinder verboten.

- [x] **2.1 Test + Funktion** `lib/tabs.ts`: `Tab = 'tasks' | 'boards' | 'watchers'`. `migrateTab` führt `today`, `agenda`, `calendar` zu Aufgaben, `home`, `watchers` zu Wächter, Unbekanntes zu Aufgaben. `startTab`: Start immer Aufgaben, gemerkt wird nur Boards. `visibleTabs`: Wächter nur mit Home Assistant und nie für ein Kind, also **zwei Reiter für Kind und Docker ohne HA**. `tabs.test.ts` deckt alle alten Werte und die drei Rollen ab (Admin, Mitglied, Kind) sowie Docker mit und ohne Wächter. `TabBar` zeigt zwei oder drei Reiter. *(erledigt, `lib/tabs.ts`, `tabs.test.ts`: alle alten Werte, drei Rollen, Docker mit und ohne Wächter)*
- [x] **2.2 Test + Funktion** `lib/week.ts`: die sieben Tage der Woche mit Punkten (Farben aus Kategorie oder Dringlichkeit, höchstens drei), reine Funktion mit fester Uhr und Zeitzone des Haushalts. *(erledigt, `lib/week.ts`, `week.test.ts`. Abweichung: Die Punkte folgen der Dringlichkeit (überfällig, heute, später, erledigt), nicht der Kategorie, weil `GET /api/schedule` die Kategoriefarben nicht mitliefert. Zeitzone: die des Geräts wie überall in `lib/`, im Test fest Europe/Berlin)*
- [x] **2.3 Test + Funktion** Gruppierung Überfällig, Heute, Diese Woche, Später aus `GET /api/today` bzw. `GET /api/schedule` (Zeitgrenzen 23:59/00:00 in der Zeitzone des Haushalts, wie `store/today.ts`). Falls die Antwort `GET /api/today` nicht reicht (nur bis Ende morgen), wird `GET /api/schedule` benutzt; **kein** neuer Server-Weg ohne Entscheidung. *(erledigt, `lib/tasks.ts`, `tasks.test.ts`: Grenzen 23:59/00:00, Sonntag, UTC-Mitternacht. Quelle ist `GET /api/schedule` (zweimal: offene Karten ohne Untergrenze, bis fünf Jahre voraus; zuletzt Erledigte) plus `GET /api/today` für „Vom Haus“; kein neuer Server-Weg. „Diese Woche“ endet am Sonntag, am Sonntag ist die Gruppe leer)*
- [x] **2.4 Aufgaben:** Kopf (Wortmarke, Avatar), „Vom Haus" oben (nur Erwachsene, Türkis mit Wort oder Zeichen), Stats-Leiste (heute fällig, überfällig, erledigt; Bedeutung von „erledigt" festlegen und testen: erledigt heute; nur eigene Zahlen), Wochenleiste, Stups-Banner (nur wenn ein offener Stups an mich da ist, aus `openNudges`), Chips (Meine, Alle, Person), Gruppen, am Ende **Fairness „Diese Woche"** als Zeile (öffnet `WeekSheet`, ohne Rangliste, Prozente, Punkte) und „Bei den anderen". Der **Ansichts-Umschalter** (Empfehlung: Liste, Tag, Woche, Monat) bringt `AgendaView` und `CalendarView` samt `SlotSheet` in Aufgaben unter; Funktion unverändert, die neue Optik folgt in Phase 5.1. Gemerkte alte Kalenderansicht bleibt lesbar. Kind: kein „Wer"-Filter, kein „Bei den anderen", kein „Vom Haus", nur eigene Karten, Weitergeben und Übernehmen verboten. *(erledigt, `TasksView.svelte`. Festgelegt: „erledigt“ = heute erledigt, nur Karten mit Termin (Karten ohne Termin kommen in `GET /api/schedule` nicht vor); Chips sind der Personenfilter von `ui.sf` (Meine, Alle, Personen, Niemand), Gerät ohne Merkzettel startet bei „Meine“; Boards und „Erledigte“ stehen hinter dem Knopf „Filter“; die Fairness-Zeile heißt „Fairness diese Woche“, damit sie nicht mit der Gruppe „Diese Woche“ verwechselt wird; `AgendaView` ist weg, die Liste schaut fünf Jahre voraus statt „Weitere 60 Tage laden“; das Stups-Banner kennt nur Karten mit Termin; Kind: kein „Vom Haus“, auch nicht für eigene Wächter-Karten, diese stehen im Board)*
- [x] **2.5 Boards:** Kopf mit Board-Auswahl-Leiste, Chips, Kategorien-Chips, `Segmented` für Spalten, `ListRow` mit Wischen und Ziehen (`svelte-dnd-action` auf Zeilen der neuen Form prüfen), Plus-Knopf. Ab 1024 px Spalten nebeneinander wie heute. Budget und Suche bleiben erreichbar. *(erledigt, `BoardsView.svelte`, `CardItem` ist eine `ListRow` mit Hülle für Wischen und Ziehen; Erledigt-Kreis ist `role=checkbox`; Titel einzeilig, kein Dringlichkeitsbalken mehr (Farbe der Uhrzeit trägt es). Das Chip-Modell der Boards ist unverändert, die Bindung ans gemeinsame Modell folgt in 6a)*
- [x] **2.6 Wächter (vormals Zuhause):** Reiter und Texte heißen „Wächter" (Deutsch und Englisch). Abschnitte als `SectionHeader` + `ListRow` (Stupsen als rechtes Element, Merken entfällt oder bleibt als `…`: klären, ob es „Merken" gibt; `GET /api/home` kennt es nicht), Zähler mit drei Balken, Leerzustand und Kopf mit verkleinertem Roboter-Bild (Text echt, Platzhalter bis zur Lieferung des Originals), „weitere Geräte gefunden"-Banner (Frage 11, Empfehlung: dieser Text), Gefunden und Wächter-Liste bleiben hier erreichbar. *(erledigt, `WatchersView.svelte`. „Merken“ entfällt (der Server kennt es nicht); „Bald dran“ heißt „Kommt bald“; Banner „weitere Geräte gefunden“; „+“ legt einen Wächter an, „Alle Wächter verwalten“ führt in die Einstellungen; Roboter 3 KB als Platzhalter)*
- [x] **2.7 Karte:** `CardSheet` mit Kopf (Kachel, Titel), Eigenschaften als Chips, Banner „… stupsen", Beschreibung, Checkliste, Links und Anhänge, Kommentare, Verlauf. Kommentare und Anhänge laufen unverändert (Kind darf sie an eigenen Karten). *(erledigt: Kopf mit Kachel, Eigenschaften als kleine Chips, Banner „… stupsen“; Beschreibung, Checkliste, Links, Anhänge, Kommentare, Verlauf in den vorhandenen Gruppen, die Symbol-Kacheln pro Karte kommen mit Phase 3)*
- [x] **2.8 Karten-Menü** (Verschieben nach als Auswahl-Chips, Öffnen, Stupsen, Duplizieren, Löschen mit „30 Tage im Papierkorb") und **Stupsen** (An wen, Nachricht, Vorschau der Push-Nachricht, Hinweis Ruhezeit). Emoji in Stups-Texten sind entschieden erlaubt, nirgends sonst. *(erledigt, `CardMenu`, `NudgeSheet` mit Vorschau der Push-Nachricht und Hinweis zur Ruhezeit, ohne die genauen Ruhezeiten zu nennen)*
- [x] **2.9 Browser-Tests nachziehen:** `11-reiter` (drei Reiter, gemerkter Reiter, alte Werte), `24-heute` (Aufgaben, Gruppen, Ansichts-Umschalter), `26-zuhause-waechter` und `27-gefunden-waechter` (Reitername Wächter, Gefunden im Wächter-Reiter; Dateinamen bei Bedarf anpassen), `22-fairness` (Zeile am Ende von Aufgaben), `23-kind` (zwei Reiter, kein Wächter, kein „Wer"), `20-haus`, `15-kompakt`, `18-english` und die `standalone*.spec.ts` (Docker ohne HA: zwei Reiter). Screenshots (de, en), Release 1.20.0-beta.1, Testliste (`docs/testliste.md`) um die neuen Punkte ergänzen. *(erledigt: Selektoren und Texte in `11-reiter`, `24-heute`, `26-reiter-waechter` (umbenannt), `27`, `22`, `23`, `20`, `15`, `18`, `12`, `13`, `7`, `8`, `16`; neue Tests für Umschalter, Wochenleiste, alte Merkwerte; Screenshots de/en, Release 1.20.0-beta.1, Testliste Abschnitt 30)*

**Nachbesserung 1.20.1-beta.1 (nach Beanstandung: nicht 1:1 nach den Mockups).** Kopf aller Reiter mit Glocke und Zahnrad, Aufgaben in der Reihenfolge von `Main.dc.html` (kein Ansichts-Umschalter mehr, Kalender als Seite), Boards, Wächter, Karte, Menü und Stupsen nach den Entwürfen gemessen; Mitteilungen aus offenen Stupsen, Bestätigungen und Karten vom Haus (ohne neue Route, Posteingang bleibt Phase 6b); Filter-Knopf öffnet ein Blatt (bis Phase 6a); „Zurück zum Dashboard“ und „HA-Kopfzeile“ stehen in den Einstellungen. Noch offen: Kachel-Symbole pro Karte (Phase 3), Optik von Kalender und Einstellungen (Phase 5), Filter „Wann“, Priorität, Sortierung (Phase 6a), Verlauf und „Alle gelesen“ in den Mitteilungen (Phase 6b). Einzelheiten und bewusste Abweichungen: `docs/entwicklung.md`, Abschnitt „Nachbesserung nach den Entwürfen“.

**Verbleib:** Alles, was Heute und Kalender konnten (Tag/Woche/Monat/Liste, freie Zeit antippen, Heute-Gruppen, Vom Haus, Bei den anderen), Fairness, alles aus Zuhause (Wartet, Läuft, Kommt bald, Ruhig, Gefunden, Wächter-Liste, Stupsen), Wischen in den nächsten Status, Ziehen am Desktop, Sammelfilter, Budget, Suche, Gestupst-Filter (`Gestupst {n}`), Weitergeben, Übernehmen, Zähler, Entität-fehlt-Hinweis, Offline-Hinweis.

**Abnahme:** Funktionen wie in 1.18.2, nur auf drei Reitern; Screens nach Mockup; Kind-Ansicht und Docker ohne HA mit zwei Reitern und ohne verbotene Teile; kein toter Reiter und kein toter Verweis auf „Kalender" oder „Zuhause"; Englisch ohne Überlauf (`18-english`).

---

## Phase 3: Symbol pro Karte und Neue Aufgabe (1.21.0-beta.1, Migration 22)

**Ziel:** Jede Karte hat Symbol und Farbe; Symbolwahl; Termin-Sheet; Kategorie inline; Notiz getrennt.

**Abhängig von:** keinen offenen Fragen (Fragen 3, 5, 18 sind entschieden).

**Migration 22:** `alter table cards add column icon text; … icon_color text; … icon_source text check (icon_source in ('auto','manual'))`. Standard null (= Standard-Symbol „Aufgabe"). Keine Massenänderung der vorhandenen Karten; die Migration setzt nur das Standard-Symbol.

**Dateien Server:** `migrations.ts`, `store/types.ts`, `store/validate.ts`, `store/cards.ts`, `store/templates.ts`, `store/watchers.ts`, `watcher-types.ts`, `watchers.ts`, `automation-cards.ts`, `transfer.ts`, `api/cards.ts`, Kopieren/Wiederholung (`recurrence.ts`, Duplizieren). **Web:** `lib/api.ts`, `lib/symbols/*` (neu), `NewCardSheet.svelte`, `CardProps.svelte`, `CardSheet.svelte`, neu `SymbolSheet.svelte`, `DateSheet.svelte`, `ui/Tile`.

- [x] **3.1 Migrationstest zuerst:** Datenbank im Stand 21 mit Karten (offen, erledigt, archiviert, im Papierkorb), Wächtern, Vorlagen, Stupsen und Kind-Person; Test öffnet sie, Daten gleich, `icon*` null, Sicherung vorhanden, Version 22, Rückfall bei Fehler. Dann Migration 22. *(erledigt: `migration-22.test.ts` (Stand 21 mit Karten offen, erledigt, archiviert, im Papierkorb, Wächter, Stups, Kind-Person; Daten gleich, `icon*` leer, Sicherung `stups-v21-…`, Version 22, Rückfall bei Fehler))*
- [x] **3.2 Server-Tests und -Umsetzung:** Karte anlegen und ändern mit Symbol und Farbe (Form geprüft, ungültig → 400, nie 500); Duplizieren, Wiederholung und Board-Vorlage übernehmen das Symbol; Wächter-Karte aus `card_json.icon` oder aus Entität (Tabelle nach `device_class`/Domäne); Export/Umzug (`transfer.ts`) nimmt die Felder mit und liest ältere Exporte ohne sie; Delta-Sync liefert das Feld; Form-Fixtures neu (`UPDATE_SHAPE=1`). **Kind:** keine neue Freigabe nötig (Karten ändern bleibt verboten); Test bleibt grün, Kind sieht das Symbol. *(erledigt: `card-icon.test.ts` (29 Tests). Ein Symbol ohne Quellenangabe gilt als `manual`; Wächter-Symbol aus Name, `attributes.icon`, `device_class`, Domäne (`watcher-icons.ts`), Vorlage geht vor; Automationen kennen `icon` und `icon_color`; zwei neue Routen für „Symbole erkennen“ (nur Administratoren, **Kind: verboten**), Fixtures neu erzeugt; Umzug braucht keinen Code (die ganze Datenbank wandert), getestet auch mit einem Export aus Stand 21)*
- [x] **3.3 Bibliothek:** Build-Skript wählt die rund 300 Symbole aus `@mdi/js` (Entwicklungsabhängigkeit) und schreibt `lib/symbols/paths.ts`; eigene Suchwörter `keywords.de.ts` (deutsch) und `keywords.en.ts`; Test: jedes Symbol hat Pfad und Suchwörter in beiden Sprachen, Größe unter einer festgelegten Grenze, keine Doppelungen. *(erledigt: 302 Symbole, `pnpm symbols`, Pfade 127 000 Zeichen roh und 50 000 gzip (mehr als die Schätzung, siehe Spec „Ergebnisse Phase 3“), Test mit Grenzen und Prüfung beider Sprachen)*
- [x] **3.4 Erkennung (Tabellentest):** `detect(title, lang)` → Symbol oder null; Beispiele aus dem Mockup („Müll raus", „Waschmaschine ausräumen", „Bad putzen", „Milch kaufen"), Mehrdeutigkeit (erster Treffer nach Gewicht), Groß/Klein, Umlaute, Pluralformen, Englisch. *(erledigt: `symbols-detect.test.ts` (Mockup-Beispiele, Mehrdeutigkeit, Groß/Klein, Umlaute und Umschrift, Beugung, Englisch). Abweichung: „Bettwäsche wechseln“ ergibt das Bett, „Blumen gießen“ die Blume (der genauere Treffer gewinnt))*
- [x] **3.5 Neue Aufgabe:** Symbol-Kachel mit Funken-Abzeichen, entfernbarer Chip „Symbol: …", erkannte Teile als Chips (besteht), Zeile „Termin" öffnet das Termin-Sheet, Kategorie inline (Name, Farbe, Anlegen), Notiz als eigenes Feld, „Mehr" mit Checkliste und Foto/Link, „Wer zuerst heimkommt" ausgeblendet (entschieden: nur bei Wächtern). Bestehende Schnell-Eingabe-Tests (`17-schnelleingabe`, `quickadd*.test.ts`) bleiben grün. *(erledigt nach `NeueAufgabe.dc.html`, gemessen gegen das Bild (Kachel 42 px wie im Entwurf gerendert). Abweichungen: Datum und Uhrzeit sind zwei Chips, Kosten und Aufwand fehlen im Fenster (an der Karte), Titelfeld ohne Hervorhebung im Text (nur Chips), Erinnern-Schalter setzt 30 Minuten vorher und Nachhaken; die bestehenden Tests (`17-schnelleingabe`, `quickadd*.test.ts`) laufen mit den neuen Bezeichnungen)*
- [x] **3.6 Symbol-Sheet:** Suche (auch ähnliche Wörter: Normalisierung, Teiltreffer, Tippfehlertoleranz einfach), Vorschläge zum Titel, „zuletzt benutzt" (`localStorage`, mit Rückfall ohne), sechs Bereiche, Farbe Auto oder fest, „Nichts gefunden" mit Hinweis. Tastatur und Beschriftungen. *(erledigt: Vorschau 44 px wie gerendert, Liste direkt unter der Farbzeile (der Entwurf lässt 53 px leer), Pfeiltasten im Raster, Escape schließt nur das oberste Fenster, auch an bestehenden Karten (Tipp auf die Kachel; ein erkanntes Symbol folgt dem Titel))*
- [x] **3.7 Termin-Sheet:** Monatskalender (Pfeiltasten, `aria`), Uhrzeit als zwei Listen (`role="listbox"`) mit Tastatur, „Kein Termin", „Übernehmen"; Zeitzone des Geräts wie `lib/datetime.ts`; die Regel „Geplant nur mit Termin nach heute" (`columnForNew`, `followDue`) bleibt. Test mit fester Uhr rund um Mitternacht. *(erledigt: `lib/dateSheet.ts` mit festen Uhren (Winter, Sommer, Zeitlücke, andere Zeitzonen), Rad in Fünferschritten (Entwurf: Viertelstunden), auch im Karten-Fenster über „Kalender …“)*
- [x] **3.8** Knopf „Symbole aus Titeln erkennen" in den Einstellungen (entschieden, von der Person selbst ausgelöst, nie automatisch), setzt `icon_source = 'auto'` nur bei Karten ohne Symbol; Test mit fester Datenmenge, Rückfrage vor dem Lauf, Ergebnis als Zahl. *(erledigt: Einstellungen › Symbole (Haushalt, nur Administratoren), `symbols-bulk.test.ts`, e2e mit Rückfrage und Zahl)*
- [x] **3.9** e2e (Symbol erkennen, ändern, Farbe, Termin-Sheet, Kategorie inline, Kind sieht Symbole), Screenshots, Release 1.21.0-beta.1. Vor dem Aufspielen auf die normale App: Sicherung der normalen App (nach `docs/entwicklung.md`). *(erledigt: `29-symbole.spec.ts`, Ergänzung in `23-kind`, `1-board` und `17-schnelleingabe` auf die neue Bedienung gebracht; Screenshots `neue-karte`, `symbol-waehlen`, `termin-waehlen`; Release 1.21.0-beta.1. Sicherung der normalen App vor dem Aufspielen bleibt Pflicht)*

**Zusatz im selben Release (Auftrag vom 05.11.2026): Die App startet immer auf „Aufgaben“.** `startTab` liefert nur noch Aufgaben, kein Reiter wird mehr gemerkt (auch nicht Boards); die Browser-Tests wechseln über `openBoards` selbst auf Boards.

**Abnahme:** Migration 22 mit Sicherung und Test; Karten ohne Symbol zeigen das Standardsymbol; Suche findet „Wäsche" bei „Waschmaschine"; Termin-Sheet per Tastatur bedienbar.

---

## Phase 4: Wächter-Editor (1.22.0-beta.1)

**Ziel:** Ablauf (Bearbeiten) und Assistent (Anlegen, vier Schritte) mit Verlauf der Entität; der Satz bleibt als Zusammenfassung (Schritt 4) und als kurze Anzeige im Ablauf. Der Editor lebt im Reiter Wächter. Keine Datenbank.

**Abhängig von:** Frage 6 (zweiter Teil: Entscheidung über „Automationen als Auslöser", noch offen) und Frage 11 (Banner-Text, noch offen). Frage 12 ist entschieden.

**Dateien:** `WatcherSheet.svelte`, `WatcherSentence.svelte`, `DryRunPanel.svelte`, `WatchersList.svelte`, `FoundSheet.svelte`, `lib/watchers.ts`, `lib/watcher-types.ts`, Server `api/watchers.ts`, `ha.ts`, `dry-run.ts`, `home.ts`.

- [ ] **4.1 Test + Server:** `GET /api/watchers/history?entity=&hours=3` über `ha.getHistory`: Zeitfenster 1 bis 24 Stunden begrenzt, höchstens 20 000 Zustände, Zahlenwerte als Punkte (Nicht-Zahlen als Stufen), ohne Recorder oder ohne Verbindung ein Zustand „keine Daten", nie 500. **Kind: verboten** (Test in `child-guard.test.ts`); Mitglied darf lesen wie `GET /api/watchers`. Fixtures neu.
- [ ] **4.2 Test + Funktion:** Auslösepunkt im Verlauf (gleiche Logik wie `dryRun`, nicht doppelt schreiben: `dry-run.ts` liefert die Zeitpunkte), Schwellen-Linie, Beschriftung „heute 10:58 ausgelöst".
- [ ] **4.3 „An wen":** Reihenfolge der Rotation mit Fotos, wer als Nächstes dran ist, wer unterwegs ist; Server liefert die Reihenfolge (aus `watchers.ts`/`presence.ts`, ohne die Rotation weiterzuschalten). **Kind: verboten.**
- [ ] **4.4 Bearbeiten (Ablauf):** WENN, DANN KARTE, AN WEN, ERLEDIGT SICH SELBST als Karten, Feinschliff als Chips, Knöpfe Testen und Speichern. Jede Einstellung des heutigen `WatcherSheet` bleibt erreichbar (Tabelle Verbleib, `watcher-form.test.ts`). Nicht-Administratoren sehen alles lesend (`watcher-readonly`).
- [ ] **4.5 Anlegen (Assistent):** vier Schritte mit Fortschrittsleiste, Schritt 1 mit Verlauf und Schwellen-Regler (beides barrierefrei: `input type=range` mit Beschriftung), Vorlagen und Gefunden münden in Schritt 1, Schritt 4 mit Zusammenfassungssatz. Schritt 3 „Wer": alle sieben Zuweisungsarten wählbar (`fixed` immer dieselbe Person, `rotation` reihum, `rotation_present`, `all_present`, `first_home`, `suggest`, `none`), **vorausgewählt ist `rotation`**, Hinweis „Fair heißt hier reihum, nicht nach Aufwand gewichtet"; kein Server-Umbau. Test: neuer Wächter ohne Änderung der Auswahl wird mit `rotation` gespeichert.
- [ ] **4.6** Platz für das Vorschlags-Banner „passende Automationen" (nur Platzhalter, keine Funktion; Frage 11, noch offen).
- [ ] **4.7** e2e (`10-waechter`, `26-zuhause-waechter`, `27-gefunden-waechter` auf Ablauf und Assistent statt Satz nachziehen; neu: Assistent bis „Wächter anlegen" mit vorausgewähltem `rotation`, Verlauf mit nachgebautem HA `/mock/history`), Screenshots, Release 1.22.0-beta.1.

**Verbleib:** Sperrzeit, Zähler (`Erst beim N-ten Mal`), Erinnern, Fälligkeit, Priorität, Kategorien, Erledigen-Bedingung, Testkarte, Zähler zurücksetzen, Pausieren, Löschen, Probelauf über 7 Tage (bleibt als „Testen"), Gefunden-Vorlagen mit Ausblenden und Zurückholen.

**Abnahme:** Ein neuer Wächter lässt sich im Assistenten in unter einer Minute anlegen; kein Feld des alten Satzes geht verloren; ohne HA kein Absturz.

---

## Phase 5: Restliche Screens (1.23.0-beta.1)

**Ziel:** Kalender-Ansichten (in Aufgaben), Boards verwalten, Einstellungen, Personen, Push-Stand, Dashboard-Button, Docker-Screens, Dialoge im neuen Design. Fast nur Optik.

**Dateien:** `CalendarView.svelte` (jetzt Ansicht in Aufgaben), `SlotSheet.svelte`, `BoardSwitcher.svelte`, `BoardSettings.svelte`, `ArchiveSheet.svelte`, `TrashSheet.svelte`, `SettingsSheet.svelte`, `settings/*.svelte`, `PeopleSheet.svelte`, `PersonDelivery.svelte`, `HouseChannels.svelte`, `WeekSheet.svelte`/`FairnessView.svelte`, `AuthView.svelte`, `PasskeySettings.svelte`, `NoAccess.svelte`, `ConfirmDialog.svelte`, `Toasts.svelte`, `Lightbox.svelte`.

- [ ] **5.1 Kalender-Ansichten in Aufgaben:** der Ansichts-Umschalter als `Segmented`, Wochenraster, freie Zeit antippen (`SlotSheet`), Monat mit Punkten und Tagesliste. Die gruppierte Liste bleibt (Agenda). Kein eigener Reiter.
- [ ] **5.2 Boards verwalten:** `BoardSwitcher` mit Board-Kacheln (`boards.icon`/`boards.color`, falls vorhanden), neue Boards über Vorlagen-Chips; `BoardSettings` (Name, Archivierung, Spalten mit Erledigt-Haken, Kategorien), Archiv, Papierkorb.
- [ ] **5.3 Einstellungen:** Zeilenoptik; Zeile Tageszusammenfassung (Frage 19, noch offen, Empfehlung: `settings`-Eintrag mit Vorrang vor der Add-on-Option; Test); Knopf „Symbole aus Titeln erkennen" (aus 3.8) im neuen Stil; Fuß mit echter Version. Alle Seiten aus `settingsGroups` bleiben, Sichtbarkeit nach Rolle unverändert (`settingsPages.test.ts`).
- [ ] **5.4 Personen:** Zeile mit Foto, Rolle, Geräte, Ruhezeit; „Wartet auf Freigabe", „Person hinzufügen"; Kind-Einstellungen (Sichtbarkeit, Bestätigung) und Haus-Kanäle bleiben erreichbar.
- [ ] **5.5 Push-Stand und Dashboard-Button:** „x / y Geräte erreichbar" (Server-Ergänzung ohne Migration, falls nötig; **Kind: verboten**), Lösungs-Banner; Vorschau-Karte und YAML (Sensorname aus `channel.ts`, Beta mit `stups_beta`).
- [ ] **5.6 Docker-Screens und Dialoge:** `AuthView`, Konto/Passkeys, `NoAccess`, `ConfirmDialog`, `Toasts`, Foto-Ansicht. Docker bekommt nichts Neues, nur Optik (`standalone*.spec.ts` grün).
- [ ] **5.7 Fairness („Diese Woche")**: das Sheet im neuen Stil (die Zeile am Ende von Aufgaben steht seit Phase 2), ohne Rangliste, Prozente, Punkte (`22-fairness`).
- [ ] **5.8** `Row.svelte`/`SettingRow` aufgelöst, tote Komponenten und Klassen entfernt (Prüfung mit `pnpm lint`), e2e, Screenshots, Release 1.23.0-beta.1.

**Abnahme:** Jeder Screen des Mockups hat sein Gegenstück; Einstellungen: nichts aus 1.18.2 verloren (Verbleib-Tabelle der Stufe 4 bleibt gültig).

---

## Phase 6a: Filter (1.24.0-beta.1)

**Ziel:** Filter-Sheet für Aufgaben (alle Ansichten, auch Kalender), ein gemeinsames Modell. Keine Datenbank, kein neuer Server-Weg.

**Abhängig von:** nichts Offenem (entschieden: ein Modell, Auswahl pro Gerät gemerkt).

- [ ] **6a.1 Test + Funktion** `ScheduleFilter` erweitert: Wer, Wann (Überfällig, Heute, Diese Woche, Später, Ohne Termin), Boards, Priorität, nur mit offenem Stups, nur von Wächtern, Erledigte (letzte 7 Tage), Sortierung (Fälligkeit, Priorität, Neueste); Trefferzahl; reine Funktionen in `lib/schedule.ts`/`lib/filters.ts`, feste Uhr.
- [ ] **6a.2** Merkzettel `stups.schedule`: ältere Fassungen ohne neue Felder lesen weiter, unbekannte Personen und Boards fallen weg (Test, wie `store.svelte.ts` heute).
- [ ] **6a.3** Sheet „Filter" (Chips mit Zahlen, Segmented, Zeilen mit Schalter, Fuß „N Aufgaben anzeigen", „Zurücksetzen"); Zahlen werden gegen die Auswahl gerechnet, nicht gegen Alle.
- [ ] **6a.4** Die Boards-Chips (Nur meine, Gestupst, Kategorien) bleiben als Schnellwahl; ob sie an dasselbe Modell gebunden werden (Empfehlung: ja, ohne Verhalten zu verlieren), ist von der Entscheidung („Aufgaben und Kalender") nicht gedeckt und vor dem Bau zu bestätigen. Kind: Filter „Wer" nicht sichtbar.
- [ ] **6a.5** e2e, Screenshots, Release 1.24.0-beta.1.

**Abnahme:** Auswahl bleibt pro Gerät; Trefferzahl stimmt; keine Geschwindigkeitseinbuße bei 300 Karten (`4-perf`).

---

## Phase 6b: Mitteilungen (1.25.0-beta.1, Migration 23)

**Ziel:** Glocke mit Verlauf, Ungelesen-Punkt, „Alle gelesen", Filter-Chips. Entschieden: eigenes Release nach den Phasen 1 bis 6a.

**Abhängig von:** nichts Offenem (Frage 2 entschieden).

**Migration 23:** `alter table users add column inbox_seen_at text`. Standard null (= alles ungelesen? Besser: bei der Migration auf „jetzt" setzen, damit die Glocke nicht mit Altlasten startet; im Test festhalten).

**Dateien:** `migrations.ts`, neu `store/inbox.ts`, neu `api/inbox.ts`, `api/child-guard.ts`, `store/people.ts`, Web `lib/api.ts`, neu `lib/inbox.ts`, `InboxSheet.svelte`, `TopBar.svelte`.

- [ ] **6b.1 Migrationstest zuerst** (Stand 22 mit Stupsen, Kommentaren, Erledigungen, Wächterläufen, Kind-Person), dann Migration 23.
- [ ] **6b.2 Store-Tests:** Abfrage je Person aus `nudges`, `completions`, `comments`, `card_events`, `watcher_runs`, `sent_notifications`; höchstens 14 Tage und 100 Einträge; **Person A sieht nichts von Person B** (Stupse an andere, Karten anderer); gelöschte und archivierte Karten; Papierkorb; Zeitzone; Reihenfolge; gleichzeitige Einträge stabil sortiert. Indexe prüfen (EXPLAIN), bei Bedarf in Migration 23 ergänzen (nur Indexe, keine Umbauten).
- [ ] **6b.3 Routen:** `GET /api/inbox`, `PUT /api/me/inbox-seen`. **Kind: erlaubt, aber gefiltert auf Einträge zu eigenen Karten und Stupse an das Kind; fremde Boards erscheinen nie** (Test in `child-guard.test.ts` und `child-visibility.test.ts`; sonst wäre es ein Datenleck). Fixtures neu.
- [ ] **6b.4 Oberfläche:** Glocke mit Punkt (ungelesen = `at > inbox_seen_at`), Sheet mit Gruppen Heute/Gestern/Älter, Filter-Chips (Alle, Stupse, Wächter, Erledigt, Kommentare), Tippen öffnet die Karte, „Alle gelesen". Texte aus Art und Daten über `t()`; Emoji in Stups-Einträgen erlaubt, sonst nicht. Glocke erscheint **erst jetzt**, vorher nicht.
- [ ] **6b.5** Live-Sync: Punkt aktualisiert sich über `ui.rev`; kein Dauerabruf.
- [ ] **6b.6** e2e (zwei Personen: Stups senden, andere Person sieht ihn, liest alle; Kind sieht nur eigenes), Screenshots, Release 1.25.0-beta.1; Sicherung der normalen App vor dem Aufspielen.

**Abnahme:** Kein Eintrag, der die Person nichts angeht; Kind-Filter getestet; Migration 23 mit Sicherung.

---

## Review Focus (für jede Phase)

- Funktion verloren? Gegen die Verbleib-Tabellen und die Browser-Tests prüfen.
- Kind: neue Route ohne Freigabe-Eintrag, Freigabe ohne Kindfilter, Sichtbarkeit fremder Boards; Kind und Docker ohne HA haben zwei Reiter, Wächter-Reiter und Wächter-Routen bleiben verboten.
- Migrationen: nur `add column`, Standardwerte, Sicherung, Test mit realistischen Daten, Wiederholbarkeit.
- Alte Zustände: gemerkter Reiter (`today`, `agenda`, `calendar`, `home`, `watchers`) und Kalenderansicht, alter Merkzettel `stups.schedule`, Karten ohne Symbol, Wächter ohne `icon`, Export aus älterer Version.
- Home Assistant nicht erreichbar: Verlauf, Gefunden, Bilder, Probelauf zeigen einen Zustand, nie 500 und nie weiße Seite.
- Tokens: kein Hex, Kontrast, Hell und Dunkel, Akzentfarbe je Person (auch Gelb und Blau).
- Englisch: Reitername „Wächter" und neue Ansichtsnamen übersetzt (Abdeckungstests), Überlauf an Segmented, Chips und Zeilen mit „…" ohne Verlust der Bedeutung (Titel einzeilig, Meta kürzt).
- Leistung: Zeilen mit Verlauf und Schatten bei 300 Karten (`4-perf`), Wischen flüssig.
- Fotos aus dem Paket nirgends im Repository (`git ls-files | grep avatar-` leer).
