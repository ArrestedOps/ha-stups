# Neues App-Design – Umsetzungsplan

> **ENTWURF, nicht freigegeben.** Es ist noch kein Code geschrieben, nichts committet, nichts gepusht. Der Plan setzt voraus, dass die Spec `docs/superpowers/specs/2026-11-04-neues-design-design.md` und ihre offenen Fragen (Abschnitt 9) geklärt und freigegeben sind. Wo eine Phase an einer Frage hängt, steht die Frage dabei.

> **Für ausführende Agenten:** Benötigter Unter-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`).

**Ziel:** Stups bekommt das Aussehen des Mockups (Tokens, eine gemeinsame Zeile, Symbol-Kacheln, Sheets, Leiste) und die wenigen neuen Funktionen (Symbol pro Karte, Filter, Mitteilungen, Wächter-Ablauf mit Verlauf). Ausgangslage: **1.18.2** (vier Reiter, Heute, Zuhause, Gefunden, Rolle Kind, Fairness, Personenbilder, Deutsch/Englisch).

**Architektur:** Zuerst ein Gestaltungssystem (Tokens im `@theme`, Bausteine unter `components/ui/`), dann Bildschirm für Bildschirm darauf umgestellt. Server fasst nur in Phase 3 (Migration 22: Symbol an Karten), Phase 4 (Verlauf-Route) und Phase 6 (Posteingang, Migration 23) an. Reine Logik (Symbol-Erkennung, Filter, Gruppierung, Posteingang) in testbaren Funktionen.

**Technik:** TypeScript, Fastify, `node:sqlite`, Svelte 5, Tailwind 4, Vitest (feste Uhr), Playwright (WebKit, iPhone).

**Spec:** `docs/superpowers/specs/2026-11-04-neues-design-design.md`

## Globale Vorgaben

- **Jede Phase ist ein eigenes Release, zuerst in die Beta-App** (`stups-beta/config.yaml`: `X.Y.0-beta.1`, Changelog `stups-beta/CHANGELOG.md`, Ablauf nach `docs/entwicklung.md` Abschnitt Beta). Stabil (`stups/`) erst nach Freigabe (Spec Frage 20). Vorher `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` grün. Den Zweig prüfen: Der Auftrag nennt `main` als Beta-Zweig, die Entwicklerdoku `beta`.
- **Testgetrieben:** erst der fehlschlagende Test, dann die Umsetzung. Zeitregeln immer mit fester Uhr, Browser-Tests nie von der Tageszeit abhängig.
- **Migrationen nur mit Sicherung und Migrationstest.** `openDb` legt die Sicherung an (letzte fünf). Der Test baut eine Datenbank im Vorgängerstand mit Beispieldaten (Karten, Wächter, Stupse, Kind-Person), öffnet sie, prüft: Daten unverändert, neue Spalten mit Standardwert, Sicherung vorhanden, Version erhöht; ein misslingender Schritt rollt zurück (Muster `packages/server/test/db.test.ts`). Eine freigegebene Migration wird nie geändert, nur eine neue angehängt.
- **Der Slug `stups` (und `stups_beta`) wird nie geändert**, nichts wird deinstalliert, kein Datenordner umbenannt.
- **Kinder-Rechte:** Jede neue Route ist für Kinder verboten, bis sie in `packages/server/src/api/child-guard.ts` (`ALLOWED`) **und** im Test `child-guard.test.ts` freigegeben ist. Für jede neue Route steht im Plan ausdrücklich „Kind: verboten" oder „Kind: erlaubt, gefiltert auf eigene Karten". `test/fixtures/api-routes.json` und `shape.test.ts` mit `UPDATE_SHAPE=1` neu erzeugen.
- **i18n:** Jeder neue Text in `t()`, `tn()` oder `tx()` mit Eintrag in `packages/web/src/lib/i18n/en.ts` und, wo der Server Text erzeugt, `packages/server/src/i18n/en.ts`. Die Abdeckungstests (`i18n-coverage.test.ts` in Web und Server) laufen in `pnpm test`. Neue Suchwortlisten (Symbole) zweisprachig. Browser-Projekt `english` bleibt grün.
- **Design-Tokens als Tailwind-`@theme`:** Alle Farben, Verläufe, Radien, Abstände stehen in `app.css`. **Keine Hex-Werte** und keine Tailwind-Paletten (`text-white`, `bg-black`) in Komponenten. Ein Test (Quelltext-Suche wie `i18n-coverage`) hält das fest; die heutigen Ausnahmen (`Avatar.svelte`, `AccentPicker.svelte`, `lib/image.ts`, `Lightbox`, `ConfirmDialog`, `CardSheet`) werden in Phase 1 bereinigt oder mit einem begründeten Eintrag in der Ausnahmeliste versehen.
- **Akzentfarbe je Person bleibt** (`lib/accent.ts`, Kopie `server/src/accent.ts`, `accent-color.test.ts`): Der Orange-Verlauf wird aus `--accent`/`--accent2` gebildet, nicht fest.
- **Hell und Dunkel** wie bisher nach System (Spec Frage 1: beide behalten). Jeder neue Baustein bekommt beide Werte; Browser-Projekte `hell` und `dunkel` laufen.
- **Barrierefreiheit mindestens auf heutigem Stand:** Fokusring, `aria-label` an Symbol-Knöpfen, 44-px-Ziele, `role`/`aria-checked` an Segmented und Toggle, Kontraste: Text auf Orange mindestens **3,5 : 1 an jedem Punkt des Verlaufs** (heute 3,54 : 1), Nebentexte 4,5 : 1 (Spec Abschnitt 7). Ein Kontrast-Test rechnet die Token-Paare nach.
- **Stufe-4-Regeln bleiben, bis du sie ausdrücklich aufhebst** (Spec Fragen 14 bis 16): kein Emoji außer in Stupsen-Texten, Illustration nur im Leerzustand, Türkis für „vom Haus" mit Wort oder Zeichen dazu, Fairness ohne Rangliste, Weitergeben und Übernehmen für Kinder verboten.
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
| 2 | Hauptscreens: Heute, Boards, Zuhause, Karte, Karten-Menü, Stupsen | 1.20.0-beta.1 | keine | XL |
| 3 | Symbol pro Karte, Neue Aufgabe, Termin-Sheet, Kategorie inline | 1.21.0-beta.1 | **22** | XL |
| 4 | Wächter-Editor: Ablauf, Assistent, Verlauf | 1.22.0-beta.1 | keine | L |
| 5 | Restliche Screens (Kalender, Boards verwalten, Einstellungen, Personen, Push, Dashboard-Button, Docker, Dialoge) | 1.23.0-beta.1 | keine | L |
| 6a | Filter | 1.24.0-beta.1 | keine | M |
| 6b | Mitteilungen | 1.25.0-beta.1 | **23** | L |

(Profilfotos fallen aus Phase 6 weg: seit Stufe 4 umgesetzt.)

---

## Phase 0: Entscheidungen und Spikes (kein Release, kein Code im Produkt)

Voraussetzung für alles Weitere.

- [ ] Fragen 1 bis 20 der Spec einzeln klären; Antworten in die Spec eintragen, Stand und „freigegeben" setzen.
- [ ] **Spike Symbol-Bibliothek:** 300 Symbole aus `@mdi/js` auswählen (Liste aus dem Mockup `NeueAufgabe`/`SymbolWaehlen` als Kern), Größe gemessen (roh, gzip), Build-Skript als Entwurf; prüfen, ob HA die mdi-Pfade über eine stabile Schnittstelle liefert (nach meinem Stand nein). Ergebnis in zwei Sätzen in die Spec (Frage 5).
- [ ] **Spike Kontrast:** Token-Entwurf (dunkel und hell) mit einem kleinen Skript nachrechnen; Verlauf des Orange so wählen, dass Weiß darauf überall mindestens 3,5 : 1 hat.
- [ ] **Spike Zeile:** `ListRow` als Wegwerf-Seite mit Wischen aus `CardItem` ausprobieren (Fingerbewegung, Haken-Fläche 32 × 44, rechtes Element), ob das Wischen mit der 68-px-Zeile gut greift.
- [ ] Prüfen, ob „x / y Geräte erreichbar" (Mockup Push-Stand) aus `GET /api/push/status` schon ableitbar ist.
- [ ] Beta-Zweig klären (`main` oder `beta`) und die Versionsnummern der Phasen bestätigen.

**Abnahme:** freigegebene Spec, Bibliotheksentscheidung, Kontrastwerte.

---

## Phase 1: Gestaltungssystem (1.19.0-beta.1)

**Ziel:** Tokens, Schrift und die zehn Bausteine; alle bestehenden Screens nutzen sie; **keine Funktionsänderung**. Neu aussehen darf es, anders bedienen nicht.

**Dateien:** `packages/web/src/app.css`, `packages/web/src/main.ts`, `packages/web/src/components/ui/*.svelte` (neu), `Avatar.svelte`, `AccentPicker.svelte`, `Lightbox.svelte`, `ConfirmDialog.svelte`, `CardSheet.svelte`, `Sheet.svelte`, `TabBar.svelte`, `TopBar.svelte`, `Group.svelte`, `Row.svelte`, `package.json` (Inter statt Bricolage, falls Frage 14 so entschieden).

- [ ] **1.1 Test:** Quelltext-Test „keine Hex-Werte und keine Palettenfarben in Komponenten" (mit Ausnahmeliste), schlägt zuerst fehl. Test „Kontrast der Token-Paare" (Text auf Fläche, Weiß auf Orange an beiden Verlaufsenden, Nebentext) für Hell und Dunkel.
- [ ] **1.2** Tokens im `@theme`: Flächen, Linien, Text, Akzentverlauf (aus `--accent`/`--accent2`), Kachelfarben (8 × Verlauf und Symbolfarbe, hell und dunkel), Banner (lila, warm), Radien, Abstände, Schatten. Das Muster der vorhandenen Variablen beibehalten; `accent.ts` (Web und Server) liefert den Verlauf.
- [ ] **1.3** Schrift: Inter lokal (`@fontsource-variable/inter`), nur benötigte Schnitte; Bricolage entfernen, falls entschieden. Test: kein Verweis auf externe Schrift-Adressen im gebauten Ergebnis (kein CDN).
- [ ] **1.4** Bausteine mit je einem Komponententest (Rendern, Zustände, `aria`): `Tile`, `Chip`, `Segmented`, `Toggle`, `SectionHeader`, `Banner`, `StatsBar`, `ListRow` (genau ein rechtes Element, Varianten Aufgabe, Einstellung, Banner, gefährlich), Sheet-Kopf und -Fuß (großer Knopf).
- [ ] **1.5** `Avatar` wird Kreis, Rückfallfarbe aus Token; `AccentPicker` und `lib/image.ts`: Hex nur noch in der Ausnahmeliste mit Begründung (Verlaufsring, Weiß für Transparenz).
- [ ] **1.6** Bestehende Screens auf die Bausteine umstellen, ohne Verhalten zu ändern: `TabBar`/`TopBar` (Reiterleiste im neuen Stil; Spec Frage 8), `Sheet`, `Group`/`Row` (Einstellungen), `ColumnTabs` → `Segmented`, Knöpfe, Checkboxen → `Toggle`. `Row.svelte` (Beschriftung/Wert) in `SettingRow` umbenennen, wenn der Name mit `ListRow` kollidiert.
- [ ] **1.7** Hell-Satz der Tokens, Prüfung beider Themen mit `dunkel`/`hell`-Projekten.
- [ ] **1.8** e2e nachziehen (Selektoren), Screenshots neu, Release 1.19.0-beta.1.

**Verbleib:** Alle Funktionen der umgestellten Komponenten (Wischen, Ziehen, Tastatur, Fokus) durch die bestehenden e2e (`1-board`, `3-columns`, `11-reiter`, `15-kompakt`, `19-farbe`, `23-kind`, `25-einstellungen`) abgesichert.

**Abnahme:** Alle Tests grün; bestehende Screens nutzen die neuen Bausteine; Hell und Dunkel stimmig; Kontrastwerte nicht schlechter als 1.18.2; kein Hex in Komponenten.

---

## Phase 2: Hauptscreens (1.20.0-beta.1)

**Ziel:** Heute, Boards, Zuhause, Karten-Detail, Karten-Menü, Stupsen im neuen Design. Keine Datenbank.

**Abhängig von:** Fragen 7 bis 10 (Reiter, Rolle Kind, Fairness), 15, 16.

**Dateien:** `TodayView.svelte`, `App.svelte` (Boards-Zweig, besser in `BoardsView.svelte` ausgelagert), `HomeView.svelte`, `CardItem.svelte`, `ColumnList.svelte`, `ColumnTabs.svelte`, `CardSheet.svelte`, `CardProps.svelte`, `CardMenu.svelte`, `NudgeSheet.svelte`, `lib/today.ts`, `lib/filters.ts`, neu `lib/week.ts`.

- [ ] **2.1 Test + Funktion** `lib/week.ts`: die sieben Tage der Woche mit Punkten (Farben aus Kategorie oder Dringlichkeit, höchstens drei), reine Funktion mit fester Uhr und Zeitzone des Haushalts.
- [ ] **2.2 Test + Funktion** Gruppierung Überfällig, Heute, Diese Woche, Später aus `GET /api/today` bzw. `GET /api/schedule` (Zeitgrenzen 23:59/00:00 in der Zeitzone des Haushalts, wie `store/today.ts`). Falls die Antwort `GET /api/today` nicht reicht (nur bis Ende morgen), wird `GET /api/schedule` benutzt; **kein** neuer Server-Weg ohne Entscheidung.
- [ ] **2.3 Heute:** Kopf (Wortmarke, Avatar), Stats-Leiste (heute fällig, überfällig, erledigt; Bedeutung von „erledigt" festlegen und testen: erledigt heute), Wochenleiste, Stups-Banner (nur wenn ein offener Stups an mich da ist, aus `openNudges`), „Vom Haus", Chips (Meine, Alle, Person), Gruppen, „Bei den anderen" mit Weg zu „Diese Woche". Kind: ohne „Wer", ohne „Bei den anderen", Weitergeben/Übernehmen verboten (bestehende Tests `23-kind`, `24-heute`).
- [ ] **2.4 Boards:** Kopf mit Board-Auswahl-Leiste, Chips, Kategorien-Chips, `Segmented` für Spalten, `ListRow` mit Wischen und Ziehen (`svelte-dnd-action` auf Zeilen der neuen Form prüfen), Plus-Knopf. Ab 1024 px Spalten nebeneinander wie heute. Budget und Suche bleiben erreichbar.
- [ ] **2.5 Zuhause:** Abschnitte als `SectionHeader` + `ListRow` (Stupsen als rechtes Element, Merken entfällt oder bleibt als `…`: klären, ob es „Merken" gibt; `GET /api/home` kennt es nicht), Zähler mit drei Balken, Leerzustand mit Roboter (Spec Frage 4), „weitere Geräte gefunden"-Banner (Frage 11).
- [ ] **2.6 Karte:** `CardSheet` mit Kopf (Kachel, Titel), Eigenschaften als Chips, Banner „… stupsen", Beschreibung, Checkliste, Links und Anhänge, Kommentare, Verlauf. Kommentare und Anhänge laufen unverändert (Kind darf sie an eigenen Karten).
- [ ] **2.7 Karten-Menü** (Verschieben nach als Auswahl-Chips, Öffnen, Stupsen, Duplizieren, Löschen mit „30 Tage im Papierkorb") und **Stupsen** (An wen, Nachricht, Vorschau der Push-Nachricht, Hinweis Ruhezeit). Texte mit Emoji nur, wenn Frage 14 so entschieden ist.
- [ ] **2.8** Browser-Tests nachziehen, Screenshots (de, en), Release 1.20.0-beta.1, Testliste (`docs/testliste.md`) um die neuen Punkte ergänzen.

**Verbleib:** Wischen in den nächsten Status, Ziehen am Desktop, Sammelfilter, Budget, Suche, Gestupst-Filter (`Gestupst {n}`), Weitergeben, Übernehmen, Zähler, Entität-fehlt-Hinweis, Offline-Hinweis.

**Abnahme:** Funktionen wie in 1.18.2, Screens nach Mockup, Kind-Ansicht ohne verbotene Teile, Englisch ohne Überlauf (`18-english`).

---

## Phase 3: Symbol pro Karte und Neue Aufgabe (1.21.0-beta.1, Migration 22)

**Ziel:** Jede Karte hat Symbol und Farbe; Symbolwahl; Termin-Sheet; Kategorie inline; Notiz getrennt.

**Abhängig von:** Fragen 3, 5, 18.

**Migration 22:** `alter table cards add column icon text; … icon_color text; … icon_source text check (icon_source in ('auto','manual'))`. Standard null. Keine Massenänderung der vorhandenen Karten.

**Dateien Server:** `migrations.ts`, `store/types.ts`, `store/validate.ts`, `store/cards.ts`, `store/templates.ts`, `store/watchers.ts`, `watcher-types.ts`, `watchers.ts`, `automation-cards.ts`, `transfer.ts`, `api/cards.ts`, Kopieren/Wiederholung (`recurrence.ts`, Duplizieren). **Web:** `lib/api.ts`, `lib/symbols/*` (neu), `NewCardSheet.svelte`, `CardProps.svelte`, `CardSheet.svelte`, neu `SymbolSheet.svelte`, `DateSheet.svelte`, `ui/Tile`.

- [ ] **3.1 Migrationstest zuerst:** Datenbank im Stand 21 mit Karten (offen, erledigt, archiviert, im Papierkorb), Wächtern, Vorlagen, Stupsen und Kind-Person; Test öffnet sie, Daten gleich, `icon*` null, Sicherung vorhanden, Version 22, Rückfall bei Fehler. Dann Migration 22.
- [ ] **3.2 Server-Tests und -Umsetzung:** Karte anlegen und ändern mit Symbol und Farbe (Form geprüft, ungültig → 400, nie 500); Duplizieren, Wiederholung und Board-Vorlage übernehmen das Symbol; Wächter-Karte aus `card_json.icon` oder aus Entität (Tabelle nach `device_class`/Domäne); Export/Umzug (`transfer.ts`) nimmt die Felder mit und liest ältere Exporte ohne sie; Delta-Sync liefert das Feld; Form-Fixtures neu (`UPDATE_SHAPE=1`). **Kind:** keine neue Freigabe nötig (Karten ändern bleibt verboten); Test bleibt grün, Kind sieht das Symbol.
- [ ] **3.3 Bibliothek:** Build-Skript wählt die 300 Symbole aus `@mdi/js` (Entwicklungsabhängigkeit) und schreibt `lib/symbols/paths.ts`; Suchwörter `keywords.de.ts` und `keywords.en.ts`; Test: jedes Symbol hat Pfad und Suchwörter in beiden Sprachen, Größe unter einer festgelegten Grenze, keine Doppelungen.
- [ ] **3.4 Erkennung (Tabellentest):** `detect(title, lang)` → Symbol oder null; Beispiele aus dem Mockup („Müll raus", „Waschmaschine ausräumen", „Bad putzen", „Milch kaufen"), Mehrdeutigkeit (erster Treffer nach Gewicht), Groß/Klein, Umlaute, Pluralformen, Englisch.
- [ ] **3.5 Neue Aufgabe:** Symbol-Kachel mit Funken-Abzeichen, entfernbarer Chip „Symbol: …", erkannte Teile als Chips (besteht), Zeile „Termin" öffnet das Termin-Sheet, Kategorie inline (Name, Farbe, Anlegen), Notiz als eigenes Feld, „Mehr" mit Checkliste und Foto/Link, „Wer zuerst heimkommt" ausgeblendet (Frage 3). Bestehende Schnell-Eingabe-Tests (`17-schnelleingabe`, `quickadd*.test.ts`) bleiben grün.
- [ ] **3.6 Symbol-Sheet:** Suche (auch ähnliche Wörter: Normalisierung, Teiltreffer, Tippfehlertoleranz einfach), Vorschläge zum Titel, „zuletzt benutzt" (`localStorage`, mit Rückfall ohne), sechs Bereiche, Farbe Auto oder fest, „Nichts gefunden" mit Hinweis. Tastatur und Beschriftungen.
- [ ] **3.7 Termin-Sheet:** Monatskalender (Pfeiltasten, `aria`), Uhrzeit als zwei Listen (`role="listbox"`) mit Tastatur, „Kein Termin", „Übernehmen"; Zeitzone des Geräts wie `lib/datetime.ts`; die Regel „Geplant nur mit Termin nach heute" (`columnForNew`, `followDue`) bleibt. Test mit fester Uhr rund um Mitternacht.
- [ ] **3.8** Optionaler Knopf „Symbole aus Titeln erkennen" in den Einstellungen (nur wenn Frage 18 so entschieden), `icon_source = 'auto'`; Test.
- [ ] **3.9** e2e (Symbol erkennen, ändern, Farbe, Termin-Sheet, Kategorie inline, Kind sieht Symbole), Screenshots, Release 1.21.0-beta.1. Vor dem Aufspielen auf die normale App: Sicherung der normalen App (nach `docs/entwicklung.md`).

**Abnahme:** Migration 22 mit Sicherung und Test; Karten ohne Symbol zeigen das Standardsymbol; Suche findet „Wäsche" bei „Waschmaschine"; Termin-Sheet per Tastatur bedienbar.

---

## Phase 4: Wächter-Editor (1.22.0-beta.1)

**Ziel:** Ablauf (Bearbeiten) und Assistent (Anlegen, vier Schritte) mit Verlauf der Entität. Keine Datenbank.

**Abhängig von:** Fragen 6, 11, 12.

**Dateien:** `WatcherSheet.svelte`, `WatcherSentence.svelte`, `DryRunPanel.svelte`, `WatchersList.svelte`, `FoundSheet.svelte`, `lib/watchers.ts`, `lib/watcher-types.ts`, Server `api/watchers.ts`, `ha.ts`, `dry-run.ts`, `home.ts`.

- [ ] **4.1 Test + Server:** `GET /api/watchers/history?entity=&hours=3` über `ha.getHistory`: Zeitfenster 1 bis 24 Stunden begrenzt, höchstens 20 000 Zustände, Zahlenwerte als Punkte (Nicht-Zahlen als Stufen), ohne Recorder oder ohne Verbindung ein Zustand „keine Daten", nie 500. **Kind: verboten** (Test in `child-guard.test.ts`); Mitglied darf lesen wie `GET /api/watchers`. Fixtures neu.
- [ ] **4.2 Test + Funktion:** Auslösepunkt im Verlauf (gleiche Logik wie `dryRun`, nicht doppelt schreiben: `dry-run.ts` liefert die Zeitpunkte), Schwellen-Linie, Beschriftung „heute 10:58 ausgelöst".
- [ ] **4.3 „An wen":** Reihenfolge der Rotation mit Fotos, wer als Nächstes dran ist, wer unterwegs ist; Server liefert die Reihenfolge (aus `watchers.ts`/`presence.ts`, ohne die Rotation weiterzuschalten). **Kind: verboten.**
- [ ] **4.4 Bearbeiten (Ablauf):** WENN, DANN KARTE, AN WEN, ERLEDIGT SICH SELBST als Karten, Feinschliff als Chips, Knöpfe Testen und Speichern. Jede Einstellung des heutigen `WatcherSheet` bleibt erreichbar (Tabelle Verbleib, `watcher-form.test.ts`). Nicht-Administratoren sehen alles lesend (`watcher-readonly`).
- [ ] **4.5 Anlegen (Assistent):** vier Schritte mit Fortschrittsleiste, Schritt 1 mit Verlauf und Schwellen-Regler (beides barrierefrei: `input type=range` mit Beschriftung), Vorlagen und Gefunden münden in Schritt 1, Schritt 4 mit Zusammenfassungssatz. Zuweisungsarten: alle sieben (`fixed`, `rotation`, `rotation_present`, `all_present`, `first_home`, `suggest`, `none`) erreichbar.
- [ ] **4.6** Platz für das Vorschlags-Banner „passende Automationen" (nur Platzhalter, keine Funktion; Frage 11).
- [ ] **4.7** e2e (`10-waechter`, `26-zuhause-waechter`, `27-gefunden-waechter` nachziehen; neu: Assistent bis „Wächter anlegen", Verlauf mit nachgebautem HA `/mock/history`), Screenshots, Release 1.22.0-beta.1.

**Verbleib:** Sperrzeit, Zähler (`Erst beim N-ten Mal`), Erinnern, Fälligkeit, Priorität, Kategorien, Erledigen-Bedingung, Testkarte, Zähler zurücksetzen, Pausieren, Löschen, Probelauf über 7 Tage (bleibt als „Testen"), Gefunden-Vorlagen mit Ausblenden und Zurückholen.

**Abnahme:** Ein neuer Wächter lässt sich im Assistenten in unter einer Minute anlegen; kein Feld des alten Satzes geht verloren; ohne HA kein Absturz.

---

## Phase 5: Restliche Screens (1.23.0-beta.1)

**Ziel:** Kalender, Boards verwalten, Einstellungen, Personen, Push-Stand, Dashboard-Button, Docker-Screens, Dialoge im neuen Design. Fast nur Optik.

**Dateien:** `CalendarView.svelte`, `SlotSheet.svelte`, `BoardSwitcher.svelte`, `BoardSettings.svelte`, `ArchiveSheet.svelte`, `TrashSheet.svelte`, `SettingsSheet.svelte`, `settings/*.svelte`, `PeopleSheet.svelte`, `PersonDelivery.svelte`, `HouseChannels.svelte`, `WeekSheet.svelte`/`FairnessView.svelte`, `AuthView.svelte`, `PasskeySettings.svelte`, `NoAccess.svelte`, `ConfirmDialog.svelte`, `Toasts.svelte`, `Lightbox.svelte`.

- [ ] **5.1 Kalender:** Kopf mit Tag/Woche/Monat/Liste als `Segmented`, Wochenraster, freie Zeit antippen (`SlotSheet`), Monat mit Punkten und Tagesliste. Liste bleibt (Agenda).
- [ ] **5.2 Boards verwalten:** `BoardSwitcher` mit Board-Kacheln (`boards.icon`/`boards.color`, falls vorhanden), neue Boards über Vorlagen-Chips; `BoardSettings` (Name, Archivierung, Spalten mit Erledigt-Haken, Kategorien), Archiv, Papierkorb.
- [ ] **5.3 Einstellungen:** Zeilenoptik; Zeile Tageszusammenfassung (Frage 19: Anzeige oder `settings`-Eintrag mit Vorrang vor der Add-on-Option; Test); Fuß mit echter Version. Alle Seiten aus `settingsGroups` bleiben, Sichtbarkeit nach Rolle unverändert (`settingsPages.test.ts`).
- [ ] **5.4 Personen:** Zeile mit Foto, Rolle, Geräte, Ruhezeit; „Wartet auf Freigabe", „Person hinzufügen"; Kind-Einstellungen (Sichtbarkeit, Bestätigung) und Haus-Kanäle bleiben erreichbar.
- [ ] **5.5 Push-Stand und Dashboard-Button:** „x / y Geräte erreichbar" (Server-Ergänzung ohne Migration, falls nötig; **Kind: verboten**), Lösungs-Banner; Vorschau-Karte und YAML (Sensorname aus `channel.ts`, Beta mit `stups_beta`).
- [ ] **5.6 Docker-Screens und Dialoge:** `AuthView`, Konto/Passkeys, `NoAccess`, `ConfirmDialog`, `Toasts`, Foto-Ansicht. Docker bekommt nichts Neues, nur Optik (`standalone*.spec.ts` grün).
- [ ] **5.7 Fairness („Diese Woche")** im neuen Stil, ohne Rangliste, Prozente, Punkte (`22-fairness`).
- [ ] **5.8** `Row.svelte`/`SettingRow` aufgelöst, tote Komponenten und Klassen entfernt (Prüfung mit `pnpm lint`), e2e, Screenshots, Release 1.23.0-beta.1.

**Abnahme:** Jeder Screen des Mockups hat sein Gegenstück; Einstellungen: nichts aus 1.18.2 verloren (Verbleib-Tabelle der Stufe 4 bleibt gültig).

---

## Phase 6a: Filter (1.24.0-beta.1)

**Ziel:** Filter-Sheet für Heute, Kalender und Boards. Keine Datenbank, kein neuer Server-Weg.

**Abhängig von:** Frage 17.

- [ ] **6a.1 Test + Funktion** `ScheduleFilter` erweitert: Wer, Wann (Überfällig, Heute, Diese Woche, Später, Ohne Termin), Boards, Priorität, nur mit offenem Stups, nur von Wächtern, Erledigte (letzte 7 Tage), Sortierung (Fälligkeit, Priorität, Neueste); Trefferzahl; reine Funktionen in `lib/schedule.ts`/`lib/filters.ts`, feste Uhr.
- [ ] **6a.2** Merkzettel `stups.schedule`: ältere Fassungen ohne neue Felder lesen weiter, unbekannte Personen und Boards fallen weg (Test, wie `store.svelte.ts` heute).
- [ ] **6a.3** Sheet „Filter" (Chips mit Zahlen, Segmented, Zeilen mit Schalter, Fuß „N Aufgaben anzeigen", „Zurücksetzen"); Zahlen werden gegen die Auswahl gerechnet, nicht gegen Alle.
- [ ] **6a.4** Boards-Chips (Nur meine, Gestupst, Kategorien) an dasselbe Modell, ohne Verhalten zu verlieren; Kind: Filter „Wer" nicht sichtbar.
- [ ] **6a.5** e2e, Screenshots, Release 1.24.0-beta.1.

**Abnahme:** Auswahl bleibt pro Gerät; Trefferzahl stimmt; keine Geschwindigkeitseinbuße bei 300 Karten (`4-perf`).

---

## Phase 6b: Mitteilungen (1.25.0-beta.1, Migration 23)

**Ziel:** Glocke mit Verlauf, Ungelesen-Punkt, „Alle gelesen", Filter-Chips.

**Abhängig von:** Frage 2.

**Migration 23:** `alter table users add column inbox_seen_at text`. Standard null (= alles ungelesen? Besser: bei der Migration auf „jetzt" setzen, damit die Glocke nicht mit Altlasten startet; im Test festhalten).

**Dateien:** `migrations.ts`, neu `store/inbox.ts`, neu `api/inbox.ts`, `api/child-guard.ts`, `store/people.ts`, Web `lib/api.ts`, neu `lib/inbox.ts`, `InboxSheet.svelte`, `TopBar.svelte`.

- [ ] **6b.1 Migrationstest zuerst** (Stand 22 mit Stupsen, Kommentaren, Erledigungen, Wächterläufen, Kind-Person), dann Migration 23.
- [ ] **6b.2 Store-Tests:** Abfrage je Person aus `nudges`, `completions`, `comments`, `card_events`, `watcher_runs`, `sent_notifications`; höchstens 14 Tage und 100 Einträge; **Person A sieht nichts von Person B** (Stupse an andere, Karten anderer); gelöschte und archivierte Karten; Papierkorb; Zeitzone; Reihenfolge; gleichzeitige Einträge stabil sortiert. Indexe prüfen (EXPLAIN), bei Bedarf in Migration 23 ergänzen (nur Indexe, keine Umbauten).
- [ ] **6b.3 Routen:** `GET /api/inbox`, `PUT /api/me/inbox-seen`. **Kind: erlaubt, aber gefiltert auf Einträge zu eigenen Karten und Stupse an das Kind; fremde Boards erscheinen nie** (Test in `child-guard.test.ts` und `child-visibility.test.ts`; sonst wäre es ein Datenleck). Fixtures neu.
- [ ] **6b.4 Oberfläche:** Glocke mit Punkt (ungelesen = `at > inbox_seen_at`), Sheet mit Gruppen Heute/Gestern/Älter, Filter-Chips (Alle, Stupse, Wächter, Erledigt, Kommentare), Tippen öffnet die Karte, „Alle gelesen". Texte aus Art und Daten über `t()`; Emoji nur in Stupsen-Einträgen (Frage 14). Glocke erscheint **erst jetzt**, vorher nicht.
- [ ] **6b.5** Live-Sync: Punkt aktualisiert sich über `ui.rev`; kein Dauerabruf.
- [ ] **6b.6** e2e (zwei Personen: Stups senden, andere Person sieht ihn, liest alle; Kind sieht nur eigenes), Screenshots, Release 1.25.0-beta.1; Sicherung der normalen App vor dem Aufspielen.

**Abnahme:** Kein Eintrag, der die Person nichts angeht; Kind-Filter getestet; Migration 23 mit Sicherung.

---

## Review Focus (für jede Phase)

- Funktion verloren? Gegen die Verbleib-Tabellen und die Browser-Tests prüfen.
- Kind: neue Route ohne Freigabe-Eintrag, Freigabe ohne Kindfilter, Sichtbarkeit fremder Boards.
- Migrationen: nur `add column`, Standardwerte, Sicherung, Test mit realistischen Daten, Wiederholbarkeit.
- Alte Zustände: gemerkter Reiter und Kalenderansicht, alter Merkzettel `stups.schedule`, Karten ohne Symbol, Wächter ohne `icon`, Export aus älterer Version.
- Home Assistant nicht erreichbar: Verlauf, Gefunden, Bilder, Probelauf zeigen einen Zustand, nie 500 und nie weiße Seite.
- Tokens: kein Hex, Kontrast, Hell und Dunkel, Akzentfarbe je Person (auch Gelb und Blau).
- Englisch: Überlauf an Segmented, Chips und Zeilen mit „…" ohne Verlust der Bedeutung (Titel einzeilig, Meta kürzt).
- Leistung: Zeilen mit Verlauf und Schatten bei 300 Karten (`4-perf`), Wischen flüssig.
- Fotos aus dem Paket nirgends im Repository (`git ls-files | grep avatar-` leer).
