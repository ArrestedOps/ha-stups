# Stufe 2: Englisch, Demo und Ankündigung – Umsetzungsplan

> **Für ausführende Agenten:** Benötigter Unter-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`).

**Ziel:** Stups läuft durchgehend auf Englisch und Deutsch (Oberfläche, Server-Meldungen, Push, Anleitung), mit Demo-GIF und Ankündigungsentwürfen; deutsche Geräte sehen unverändert Deutsch.

**Architektur:** „Deutscher Text ist der Schlüssel": `t('Karte löschen?')` mit einem englischen Katalog `de → en` je Seite (Browser, Server), Abdeckungstest erzwingt Vollständigkeit. Sprache je Person (Migration 14), im Browser aufgelöst, pro Anfrage per Kopfzeile, für Push aus der Datenbank. Drei Versionen, jede zuerst in die Beta.

**Technik:** TypeScript, Svelte 5 (Runes), Fastify, `node:sqlite`, Vitest, Playwright (WebKit), `gifenc` (neu, nur Entwicklung).

**Spec:** `docs/superpowers/specs/2026-11-02-stufe-2-englisch-design.md`

## Globale Vorgaben

- Sprachen genau `de` und `en` (Typ `Lang`); „Automatisch" ist nur eine Wahl (`LanguageChoice = 'auto' | Lang`), keine dritte Sprache.
- Auflösung im Browser: Wahl → `navigator.languages` (beginnt ein Eintrag mit „de": Deutsch) → Englisch. Anfragen tragen `X-Stups-Language: de|en`; Server: diese Kopfzeile → `Accept-Language` → Englisch.
- Personen ohne gemeldete Sprache bekommen **Push auf Deutsch**, bis ihr Gerät eine meldet.
- Zeit: 24 Stunden, Wochenbeginn Montag, Währung € in beiden Sprachen; Locale `de-DE` / `en-GB`.
- Nicht übersetzt: Eingaben der Menschen (Titel, Namen, Kommentare, eigene Stups-Texte), Namen aus Home Assistant, Protokollzeilen im Add-on-Log, Namen der Home-Assistant-Sensoren (bleiben Deutsch, siehe Übergabe).
- Katalog-Dateien: `packages/web/src/lib/i18n/en.ts`, `packages/server/src/i18n/en.ts`. Kein gemeinsames Paket.
- Bestehende Tests laufen unverändert weiter (Server: Standardsprache `de` im Test-Setup; Browser-Projekte haben schon `locale: 'de-DE'`).
- Versionen: `1.14.0-beta.N`, `1.15.0-beta.N`, `1.16.0-beta.N` in `stups-beta/config.yaml`; stabil `1.14.0`/`1.15.0`/`1.16.0` erst nach Freigabe durch den Nutzer. Jeder Push nach `beta`: CI grün abwarten.
- Beschreibungen von Commits enden mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Texte an Menschen auf Deutsch.

## Review Focus

1. **Bestehende Person ohne Sprache** (`language` ist `null`) bekommt nach dem Update weiter deutsche Push-Nachrichten (Task 13).
2. **Fehlender englischer Eintrag** zeigt den deutschen Text, nie den Schlüssel `undefined` oder Leere (Task 1).
3. **Eingaben mit Klammern:** ein Titel `{x}` oder `{n}` wird nicht ein zweites Mal als Platzhalter ersetzt (Task 1).
4. **Kaputte oder fremde Kopfzeilen:** `Accept-Language: de-CH, en;q=0.5`, `fr`, leer, Unsinn → deutsch bzw. englisch nach Regel, nie ein Fehler (Task 11).
5. **Englisch sprengt das Layout:** keine waagerechte Seitenverschiebung im englischen Projekt auf iPhone-Breite (Task 9).

---

## Teil A: 1.14.0 – Mechanismus und Oberfläche

### Task 1: Browser-Mechanismus `t`, `tn`, Sprachwahl

**Files:**
- Create: `packages/web/src/lib/i18n/index.svelte.ts`, `packages/web/src/lib/i18n/en.ts`
- Test: `packages/web/test/i18n.test.ts`

**Interfaces:**
- Produces: `type Lang = 'de' | 'en'`; `type LanguageChoice = 'auto' | Lang`; `i18n: { lang: Lang }` (`$state`); `setLanguage(lang: Lang): void`; `t(text: string, params?: Record<string, string | number>): string`; `tn(one: string, other: string, n: number): string` (ersetzt `{n}`); `resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): Lang`; `numberLocale(): 'de-DE' | 'en-GB'`; `en: Record<string, string | [string, string]>` (Einträge für `tn` sind `[eins, andere]`, die Datei beginnt leer); `useCatalog(c: Record<string, string | [string, string]>): () => void` (ersetzt den Katalog, gibt eine Funktion zurück, die ihn zurücksetzt; nur für Tests).

- [ ] **Step 1: Tests schreiben (`i18n.test.ts`)** – die Tests setzen ihren eigenen Katalog mit `useCatalog` (und stellen ihn danach zurück); `t` im Deutschen gibt den Text zurück, im Englischen den Katalogtext; `t('{n} Karten', …)`-Platzhalter werden ersetzt; **ein Wert wie `'{x}'` wird nicht erneut ersetzt** (`t('Hallo {name}', { name: '{x}' })` → `'Hallo {x}'` in beiden Sprachen); fehlender Eintrag gibt den deutschen Text; `tn('{n} Karte', '{n} Karten', 1)` und `…, 2` in beiden Sprachen; `resolveLanguage('de', ['en-US'])` = `de`, `('auto', ['de-CH','en'])` = `de`, `('auto', ['fr','en'])` = `en`, `('auto', [])` = `en`.
- [ ] **Step 2: Fehlschlag prüfen:** `pnpm --filter @stups/web exec vitest run test/i18n.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** in `index.svelte.ts` wie oben; Platzhalter in **einem** Durchgang ersetzen (`replace(/\{(\w+)\}/g, …)` mit den übergebenen Werten); Anfangswert `i18n.lang = 'en'`. `en.ts` beginnt als leeres Objekt.
- [ ] **Step 4: Grün prüfen** (derselbe Befehl) → PASS.
- [ ] **Step 5: Commit** (`Stups 1.14.0: Browser-Mechanismus für Sprachen`).

### Task 2: Abdeckungstest (Browser)

**Files:**
- Create: `packages/web/test/i18n-coverage.test.ts`

**Interfaces:**
- Consumes: `en` aus Task 1.

- [ ] **Step 1: Test schreiben:** liest alle `.svelte` und `.ts` unter `packages/web/src` (außer `i18n/`), findet per regulärem Ausdruck jeden Aufruf `t('…')`, `t("…")`, `` t(`…`) `` (nur ohne `${}`) und `tn('…', '…', …)` und prüft: (a) für jeden Text steht ein Eintrag in `en` (`tn`: Tupel), (b) kein Eintrag in `en` ist ungenutzt, (c) die Platzhalter `{name}` stimmen zwischen Schlüssel und englischem Text überein, (d) `tn`-Tupel enthalten beide `{n}`.
- [ ] **Step 2:** Laufen lassen → PASS (es gibt noch keine Aufrufe und keine Einträge; ab Task 5 hält der Test jede weitere Übersetzung vollständig). Zusätzlich ein Selbsttest des Prüfers: ein vorgetäuschter Quelltext mit `t('Neu')` ohne Eintrag lässt die Prüfung (a) fehlschlagen.
- [ ] **Step 3: Commit.**

### Task 3: Migration 14 und Sprache je Person (Server)

**Files:**
- Modify: `packages/server/src/migrations.ts` (Version 14), `packages/server/src/store/people.ts`, `packages/server/src/store/types.ts` (`User.languageChoice: 'auto' | 'de' | 'en'`), `packages/server/src/store.ts` (Rückgabeobjekt), `packages/server/src/api/access.ts`
- Test: `packages/server/test/language.test.ts`, `packages/server/test/fixtures/*.json` (neu erzeugen)

**Interfaces:**
- Produces: Spalten `users.language text` (zuletzt gemeldete Sprache) und `users.language_choice text` (`null` = Automatisch); `store.setLanguage(userId: string, v: { choice: 'auto' | 'de' | 'en'; effective: 'de' | 'en' }): void`; `store.languageOf(userId: string): 'de' | 'en' | null`; Route `PUT /api/me/language` (Body `{ choice, effective }`, 204, ungültige Werte → 400); `GET /api/me` liefert `user.languageChoice`. *(Verfeinerung zu Spec 4.2: zwei Spalten statt einer, weil „Automatisch" und „noch nichts gemeldet" sonst nicht zu trennen sind.)*

- [ ] **Step 1: Tests schreiben:** Migration 14 auf einer Datenbank im Stand 13 (Muster: `watcher-data.test.ts`, „Migration 10") lässt Daten unverändert und setzt beide Spalten `null`; `setLanguage` speichert, `languageOf` liest, `choice: 'auto'` schreibt `language_choice = null`; `PUT /api/me/language` mit `{choice:'en',effective:'en'}` → 204 und `/api/me` zeigt `languageChoice: 'en'`; `{choice:'fr'}` → 400; ohne Zugriff (nicht freigegeben) → 403.
- [ ] **Step 2: Fehlschlag prüfen:** `pnpm --filter @stups/server exec vitest run test/language.test.ts`.
- [ ] **Step 3: Implementieren:** Migration `alter table users add column language text; alter table users add column language_choice text;`; Store-Methoden in `store/people.ts` (über `run`), `toUser` ergänzt `languageChoice` (`null` → `'auto'`); Route in `api/access.ts`.
- [ ] **Step 4:** Fixtures: `UPDATE_SHAPE=1 pnpm --filter @stups/server exec vitest run test/shape.test.ts`; danach `pnpm --filter @stups/server exec vitest run` komplett → PASS.
- [ ] **Step 5: Commit.**

### Task 4: Sprachauswahl im Browser (Start, Einstellung, Kopfzeile)

**Files:**
- Modify: `packages/web/src/lib/api.ts` (Kopfzeile `X-Stups-Language`, `api.setLanguage`; `User.languageChoice`), `packages/web/src/lib/store.svelte.ts`, `packages/web/src/components/SettingsSheet.svelte`
- Test: `packages/web/test/language-choice.test.ts`

**Interfaces:**
- Consumes: Task 1 (`resolveLanguage`, `setLanguage`), Task 3 (Route).
- Produces: `applyLanguage(choice: LanguageChoice): void` in `store.svelte.ts` (setzt `i18n.lang` über `resolveLanguage(choice, navigator.languages)`, merkt sich die Wahl in `localStorage['stups.lang']`); `changeLanguage(choice: LanguageChoice): Promise<void>` (wendet an und meldet `api.setLanguage(choice, i18n.lang)`).

- [ ] **Step 1: Test (reine Logik):** `languageFromStorage(raw: string | null): LanguageChoice` in `lib/i18n/index.svelte.ts` ergänzen und testen: `null`/Unsinn → `'auto'`, `'de'`/`'en'` → derselbe Wert.
- [ ] **Step 2–3:** Implementieren: Beim Start **vor** dem ersten Anzeigen die gemerkte Wahl anwenden (auch für Anmeldeseiten); nach `api.me()` die Wahl des Servers anwenden und, falls `me.user.languageChoice` oder die aufgelöste Sprache vom Gemeldeten abweicht, `api.setLanguage` aufrufen (nur bei `choice === 'auto'` meldet der Browser seine Sprache, sonst die feste Wahl). Kopfzeile aus `i18n.lang`. In `SettingsSheet.svelte` eine Zeile „Sprache" mit `SelectField` (Automatisch / Deutsch / English; die Namen der Sprachen werden **nicht** übersetzt); Auswahl ruft `changeLanguage`.
- [ ] **Step 4:** `pnpm --filter @stups/web exec vitest run` und `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit.**

### Task 5: Zeit- und Datumsformate in beiden Sprachen

**Files:**
- Modify: `packages/web/src/lib/datetime.ts` (Wochentage/Monate, `formatDue`, Relativtexte), `calendar.ts`, `schedule.ts`, `urgency.ts`, `nudge.ts`, `filters.ts`, `activity.ts`
- Test: die vorhandenen Tests `datetime.test.ts`, `calendar.test.ts`, `schedule.test.ts`, `urgency.test.ts`, `nudge.test.ts`, `filters.test.ts`, `activity.test.ts` bekommen je einen Block `describe('English')` mit `setLanguage('en')` (danach zurück auf `de`)

**Interfaces:**
- Consumes: Task 1.

- [ ] **Step 1: Tests:** je Datei mindestens: `formatDue` heute/morgen/Wochentag/Datum auf Englisch in 24-Stunden-Schreibweise (`today 19:00`, `tomorrow 19:00`, `Mon 19:00`, `1 Dec`), Mehrzahl mit `tn` („1 day overdue", „3 days overdue"), Wochentage und Monate in `calendar.ts` auf Englisch beginnend mit Montag.
- [ ] **Step 2:** Fehlschlag prüfen (`vitest run`).
- [ ] **Step 3:** Texte mit `t`/`tn` umhüllen, `WEEKDAYS`/`MONTHS` in Funktionen verwandeln, die nach `i18n.lang` wählen; `Intl.DateTimeFormat` mit `numberLocale()`; alle neuen Texte in `en.ts` eintragen.
- [ ] **Step 4:** `vitest run` komplett + Abdeckungstest → PASS.
- [ ] **Step 5: Commit.**

### Task 6: Schnell-Eingabe auf Englisch

**Files:**
- Modify: `packages/web/src/lib/quickadd/dictionary.ts` (zweiter Eintrag `en` in `DICTIONARIES`), `labels.ts` (Chip-Texte mit `t`), `index.ts` (Sprache aus `i18n.lang`), `components/QuickText.svelte`, `QuickChips.svelte`
- Test: `packages/web/test/quickadd.test.ts`, `quickaddLabels.test.ts` (Englisch-Blöcke)

**Interfaces:**
- Consumes: `Dictionary` (vorhanden), `ctx.lang`.

- [ ] **Step 1: Tests:** `parse('Take out trash tomorrow 7pm @Ben #Home every week !!', ctx_en)` ergibt Titel „Take out trash", fällig morgen 19:00, Person Ben, Kategorie Home, wöchentlich, Priorität hoch; zusätzlich: `next Monday`, `in 3 days`, `every 2 weeks`, `every Friday 6:30pm`, `Dec 1`, `1 December`, `important`; ein Titel ohne Treffer bleibt unverändert; der Test „jede Sprache hat alle Schlüssel" (vorhanden) bleibt grün.
- [ ] **Step 2:** Fehlschlag prüfen.
- [ ] **Step 3:** Englisches Wörterbuch ausfüllen (`today`, `tomorrow`, `weekdays`, `months`, `next`, `datePrefix: ['on','by']`, `timePrefix: ['at']`, `timeWord: []` plus `am/pm`-Zeiten falls die Regel sie nicht kennt: Regel in `index.ts` um `19pm`-freies `7pm`/`7:30pm` erweitern), Chips über `t`. Die Standardsprache der Eingabe folgt `i18n.lang`.
- [ ] **Step 4:** Tests + Abdeckungstest → PASS.
- [ ] **Step 5: Commit.**

### Task 7: Kern der Oberfläche (Board, Karten, Navigation, Hinweise)

**Files:**
- Modify: `lib/store.svelte.ts` (Hinweise, `errorText`), `lib/api.ts` (Fehlertexte des Clients, z. B. keine Verbindung), `lib/cardMeta.ts`, `lib/swipe.ts`, `App.svelte`, `components/{CardItem,ColumnList,ColumnTabs,BoardHeader,BoardSwitcher,Toasts,ConfirmDialog,CardMenu,AgendaView,CalendarView,SlotSheet,SearchBar,FilterChips,…}.svelte` (alle Komponenten, die das Board, die Navigation und die Hinweise bilden; Liste per `Grep` nach Umlauten und deutschen Wörtern ergänzen)
- Test: `i18n-coverage.test.ts` (Task 2)

**Interfaces:**
- Consumes: Task 1, 2.

- [ ] **Step 1:** `git grep -nE "[äöüÄÖÜß]|Karte|Neu|Abbrechen|Löschen"` über `packages/web/src` als Arbeitsliste notieren; Text in Vorlagen als `{t('…')}`, in Attributen (`aria-label`, `title`, `placeholder`) als `t('…')`.
- [ ] **Step 2:** Jeden umhüllten Text mit englischem Eintrag in `en.ts` versehen (kurz, im Ton der App: „Done", „Undo", „New card", „Overdue", „Search").
- [ ] **Step 3:** `pnpm --filter @stups/web exec vitest run` (Abdeckungstest muss grün sein), `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 4:** `pnpm build && pnpm exec playwright test -c e2e/playwright.config.ts e2e/1-board.spec.ts e2e/16-agenda.spec.ts --project=dunkel` → PASS (Oberfläche bleibt auf Deutsch gleich).
- [ ] **Step 5: Commit.**

### Task 8: Karten-Fenster, Neue Karte, Wiederholung, Stupsen

**Files:**
- Modify: `components/{CardSheet,CardProps,NewCardSheet,RecurrenceEditor,CategoryPicker,NudgeSheet,AttachmentList,Comments,Checklist,Links,…}.svelte`, `lib/recurrence.ts`, `lib/carry.ts`, `lib/nudge.ts`
- Test: vorhandene Tests (`recurrence.test.ts`, `carry.test.ts`, `nudge.test.ts`) mit Englisch-Blöcken, Abdeckungstest.

**Interfaces:**
- Consumes: Task 1, 2, 5.

- [ ] **Step 1:** Tests für `recurrence.ts`/`carry.ts`-Beschreibungen auf Englisch („Every 2 weeks on Monday", „Every day").
- [ ] **Step 2–3:** Umhüllen und Katalog wie Task 7; **Stups-Vorlagen:** die Server-Liste `templates` (deutsche Texte) wird im Client mit `t(text)` angezeigt, die englischen Einträge stehen in `en.ts`.
- [ ] **Step 4:** `vitest run`, `typecheck`, `lint`, Browser-Tests `3-recurrence`, `6-nudge`, `17-schnelleingabe` → PASS.
- [ ] **Step 5: Commit.**

### Task 9: Einstellungen, Personen, Passkeys, Archiv, Papierkorb, Anmeldung

**Files:**
- Modify: `components/{SettingsSheet,PeopleSheet,PasskeySettings,ArchiveSheet,TrashSheet,AuthView,BoardSettings,BoardsSheet,TransferSection,…}.svelte`
- Test: Abdeckungstest.

**Interfaces:**
- Consumes: Task 1, 2.

- [ ] **Step 1–2:** Umhüllen, Katalog.
- [ ] **Step 3:** `vitest run`, `typecheck`, `lint`; Browser-Tests `5-people`, `9-papierkorb`/`archiv` (die Dateinamen per `Glob` finden), `13-standalone`/`15-passkey` → PASS.
- [ ] **Step 4: Commit.**

### Task 10: Wächter-Oberfläche

**Files:**
- Modify: `components/{WatcherSheet,WatchersView}.svelte`, `lib/watchers.ts`, `lib/watcher-types.ts`
- Test: `watchers.test.ts` (Englisch-Block für `conditionText`, `watcherLine`, `RUN_TEXT`), Abdeckungstest.

**Interfaces:**
- Consumes: Task 1, 2.

- [ ] **Step 1:** Test: `conditionText` und `watcherLine` auf Englisch („Washing machine finished: power below 5 W for 2 min").
- [ ] **Step 2–3:** Umhüllen, Katalog (Vorlagen `TEMPLATES` inklusive).
- [ ] **Step 4:** `vitest run`, `typecheck`; Browser-Test `10-waechter` → PASS. Erst danach `grep -rnE "[äöüÄÖÜß]" packages/web/src --include=*.svelte --include=*.ts` durchsehen: Treffer außerhalb von `t(`, Kommentaren und `i18n/` sind übersehene Texte → nachziehen. Abdeckungstest grün.
- [ ] **Step 5: Commit.**

### Task 11: Browser-Projekt `english`, Prüfung auf deutsche Reste

**Files:**
- Create: `e2e/18-english.spec.ts`
- Modify: `e2e/playwright.config.ts` (Projekt `english`: `locale: 'en-GB'`, `colorScheme: 'dark'`, gleicher Server wie `dunkel`; in `dunkel` und `hell` per `testIgnore` ausschließen)

**Interfaces:**
- Consumes: alles aus Teil A.

- [ ] **Step 1: Tests schreiben** (Name, Prüfung): „Kernabläufe auf Englisch" – Board, Agenda, Kalender, Einstellungen, Karten-Fenster, „New card" mit `Take out trash tomorrow 7pm !!` → Chips, Karte angelegt, erledigt mit „Undo"-Hinweis; nach jedem Schritt: `innerText` der Seite enthält **keines** der Wörter `Karte|Speichern|Abbrechen|Einstellungen|Löschen|Neu|Fertig|Heute|Morgen|überfällig|Erledigt` (Wortgrenzen); **keine waagerechte Verschiebung:** `document.documentElement.scrollWidth <= window.innerWidth` in jeder Ansicht. „Sprache wechseln" – Einstellungen › Language › Deutsch: Oberfläche sofort deutsch, `GET /api/me` zeigt `languageChoice: 'de'`; danach zurück auf Automatisch. „Fehlermeldung": eine API-Anfrage mit ungültigen Daten liefert den Hinweis auf Englisch (greift erst in Teil B; Test hier mit `test.fixme`).
- [ ] **Step 2:** `pnpm build && pnpm e2e` (alles) → die zwei bekannten Wackler `5-people:102` und `3-recurrence:73` einzeln wiederholen; sonst PASS.
- [ ] **Step 3: Commit.**

### Task 12: Doku, Beta-Veröffentlichung 1.14.0-beta.1

**Files:**
- Modify: `docs/testliste.md` (Abschnitt 21 „Englisch (seit 1.14.0)"), `docs/entwicklung.md` (Abschnitt „Sprachen"), `stups-beta/CHANGELOG.md`, `stups-beta/config.yaml`

- [ ] **Step 1:** Testliste: iPhone auf Englisch stellen (Einstellungen › Sprache), Kernabläufe, Layout der kompakten Karten, Datums-/Zeitangaben, Umschalten auf Deutsch, deutsches Gerät unverändert. `entwicklung.md`: Regeln (`t` immer mit Text als Schlüssel, Katalog, Abdeckungstest, Sprache pro Person, Kopfzeile). Changelog und `version: "1.14.0-beta.1"`.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, commit, `git push origin beta`, CI grün abwarten (`gh run watch`), Beta in Home Assistant aktualisieren (`check_updates`, `update` auf `2aee07f1_stups_beta`).
- [ ] **Step 3: Warten auf die Freigabe des Nutzers** (Beta am iPhone getestet oder ausdrücklich ohne Test freigegeben). Dann stabil: `stups/config.yaml` auf `1.14.0`, `stups/CHANGELOG.md` (zweisprachig, Englisch zuerst), Screenshots (`node e2e/screenshots.mjs`), nach `main` (`git push origin beta:main`), CI abwarten, normale App aktualisieren.

---

## Teil B: 1.15.0 – Server, Push, Add-on-Texte

### Task 13: Server-Mechanismus und Sprache je Anfrage

**Files:**
- Create: `packages/server/src/i18n/index.ts`, `packages/server/src/i18n/en.ts`, `packages/server/test/setup.ts`
- Modify: `packages/server/vitest.config.ts` (`setupFiles: ['test/setup.ts']`), `packages/server/src/api.ts` (Hook), `packages/server/src/errors.ts` (Standardtexte), `packages/server/src/main.ts` (Standardsprache `en`)
- Test: `packages/server/test/i18n.test.ts`, `packages/server/test/i18n-coverage.test.ts`

**Interfaces:**
- Produces: `type Lang = 'de' | 'en'`; `t(text: string, params?: Record<string, string | number>): string`; `tn(one: string, other: string, n: number): string`; `withLanguage<T>(lang: Lang, fn: () => T): T` (AsyncLocalStorage); `currentLanguage(): Lang`; `setDefaultLanguage(lang: Lang): void`; `parseLanguage(header: string | undefined): Lang | null` (liest `X-Stups-Language` und `Accept-Language`: nach Gewichtung, erstes `de*` → `de`, erstes `en*` → `en`, sonst `null`); `en: Record<string, string | [string, string]>`.

- [ ] **Step 1: Tests schreiben:** `parseLanguage('de-CH, en;q=0.5')` = `de`, `('fr')` = `null`, `('')`/`undefined`/`';;;'` = `null`, `('en-GB,de;q=0.4')` = `en`; `t` verhält sich wie im Browser (Token-Test aus Task 1, fehlender Eintrag → deutscher Text, `{x}`-Wert wird nicht erneut ersetzt); `withLanguage('en', () => t('Kein Zugriff'))` = `'No access'`, außerhalb gilt die Standardsprache; ein Fastify-Test: Anfrage mit `x-stups-language: en` an eine Route, die einen `NotFoundError` wirft, liefert `{ error: 'Not found' }`, ohne Kopfzeile (Testsetup `de`) `'Nicht gefunden'`, `accept-language: en` ebenso Englisch; Abdeckungstest wie Task 2, aber für `packages/server/src`.
- [ ] **Step 2:** Fehlschlag prüfen.
- [ ] **Step 3:** Implementieren; Hook `onRequest`: `withLanguage(parseLanguage(x-stups-language) ?? parseLanguage(accept-language) ?? currentLanguage(), done)` (der Rückruf läuft **innerhalb** des Kontexts); `errors.ts`: Standardtexte `t('Kein Zugriff')`/`t('Nicht gefunden')` beim Konstruieren; 500-Antwort `t('Interner Fehler')`. `main.ts` ruft `setDefaultLanguage('en')`; `test/setup.ts` ruft `setDefaultLanguage('de')`.
- [ ] **Step 4:** Alle Server-Tests (`pnpm --filter @stups/server exec vitest run`) → PASS.
- [ ] **Step 5: Commit.**

### Task 14: Fehlermeldungen übersetzen (Store, Prüfungen, Routen)

**Files:**
- Modify: `packages/server/src/store/*.ts`, `validate.ts`, `api/*.ts`, `accounts.ts`, `passkeys.ts`, `session-auth.ts`, `ingress.ts`, `beta-gate.ts`, `transfer.ts`, `automation.ts`, `i18n/en.ts`
- Test: `i18n-coverage.test.ts` (Server), `packages/server/test/errors-en.test.ts`

**Interfaces:**
- Consumes: Task 13.

- [ ] **Step 1: Test:** je Quelle ein Beispiel unter `withLanguage('en', …)`: Validierung („Please choose a message or write one"), nicht gefunden, 409 (`The card is already done`), `GET /api/cards?ids=` mit 51 Kennungen („At most 50 cards at a time", Mehrzahl über `tn`); alle Meldungen werden an der **Wurfstelle** übersetzt: `new ValidationError(t('…', {…}))`.
- [ ] **Step 2–3:** Arbeitsliste per `git grep -nE "(Validation|Forbidden|NotFound|Conflict|App)Error\(" packages/server/src`; jede Meldung umhüllen und im Katalog eintragen. Log-Zeilen (`app.log`, `log(…)`) bleiben unverändert.
- [ ] **Step 4:** Alle Server-Tests → PASS (Standardsprache `de` lässt die bestehenden unverändert).
- [ ] **Step 5: Commit.**

### Task 15: Push, Zusammenfassung, Stups-Vorlagen in der Sprache des Empfängers

**Files:**
- Modify: `packages/server/src/notifications.ts`, `push.ts`, `ntfy.ts`, `store/nudges.ts` (Text beim Zustellen), `i18n/en.ts`
- Test: `packages/server/test/notifications-language.test.ts`

**Interfaces:**
- Consumes: Task 3 (`store.languageOf`), Task 13.
- Produces: `pushLanguage(store: Store, userId: string): Lang` (`store.languageOf(userId) ?? 'de'`) in `notifications.ts`; Texte jeder Nachricht entstehen innerhalb von `withLanguage(pushLanguage(…), …)` **je Empfänger**.

- [ ] **Step 1: Tests:** gleiche fällige Karte, zwei Empfänger – einer mit `language = 'en'`, einer mit `null`: der erste bekommt „Due now"/englischen Titel und Knopf „Done", der zweite die bisherigen deutschen Texte (**Review-Fokus 1**); Tageszusammenfassung („Due today: 2 · Overdue: 1"); „Nachhaken" („Overdue since …"); ein Stups mit Vorlage `think` wird beim Zustellen in der Sprache des Empfängers gerendert (`t(NUDGE_TEMPLATES[template])`), ein Stups mit eigenem Text bleibt unverändert; Beta-Präfix „Beta ·" bleibt.
- [ ] **Step 2:** Fehlschlag prüfen.
- [ ] **Step 3:** Implementieren (Schnittstellen der Benachrichtigung nicht ändern; nur Textbildung in den Sprachkontext heben; `nudges.text` bleibt als Ablage für eigene Texte, bei Vorlagen zählt `template`).
- [ ] **Step 4:** Alle Server-Tests → PASS.
- [ ] **Step 5: Commit.**

### Task 16: Wächter-Texte (Meldungen und Läufe)

**Files:**
- Modify: `packages/server/src/watchers.ts`, `watcher-types.ts`, `ha.ts`, `watcher-data.ts` (Notiz-Format), `packages/web/src/lib/watchers.ts` (`noteText`), `i18n/en.ts`
- Test: `packages/server/test/watchers-language.test.ts`, `packages/web/test/watchers.test.ts`

**Interfaces:**
- Produces: Serverseitig `note(key: string, params?: Record<string, string | number>): string` (liefert `JSON.stringify({ k: key, p: params })`, der deutsche Text ist der Schlüssel); clientseitig `noteText(note: string | null): string` (`{"k":…}` → `t(k, p)`, alles andere unverändert, damit **alte Notizen weiter lesbar** bleiben).

- [ ] **Step 1: Tests:** Server: ein Lauf schreibt `{"k":"Karte „{title}“ angelegt","p":{…}}`; Client: `noteText` gibt auf Englisch „Card "…" created", Altbestand (`'Karte angelegt'`) bleibt wie er ist, kaputtes JSON bleibt Text.
- [ ] **Step 2–3:** Implementieren; Validierungsfehler der Wächter (`watcher-types.ts`) wie Task 14.
- [ ] **Step 4:** `pnpm test`, Browser-Test `10-waechter` → PASS.
- [ ] **Step 5: Commit.**

### Task 17: Add-on-Texte (`translations/en.yaml`), englische Fehlermeldung im Browser

**Files:**
- Create: `stups/translations/en.yaml`, `stups-beta/translations/en.yaml`
- Modify: `packages/server/test/addon-files.test.ts`, `e2e/18-english.spec.ts` (`test.fixme` aus Task 11 entfernen)

- [ ] **Step 1: Test:** in `addon-files.test.ts`: für beide Apps hat `en.yaml` genau die Schlüssel von `de.yaml` (Optionsnamen und Beschreibungen).
- [ ] **Step 2:** Fehlschlag prüfen, Dateien schreiben (Texte aus `de.yaml` übersetzen), Test grün. Im englischen Browser-Projekt prüft die Fehlermeldung (zu lange Stups-Nachricht / leerer Titel) den englischen Hinweis.
- [ ] **Step 3:** `pnpm e2e` (alles) → PASS bis auf die bekannten Wackler. Commit.

### Task 18: Doku, Beta-Veröffentlichung 1.15.0-beta.1

**Files:**
- Modify: `docs/testliste.md` (Abschnitt 22), `docs/entwicklung.md` (Server-Sprache, Notiz-Format, Hinweis: Sensor-Namen bleiben Deutsch), `stups-beta/CHANGELOG.md`, `stups-beta/config.yaml`

- [ ] **Step 1:** Testliste: Push auf Englisch (Fälligkeit, „Erledigt"-Knopf in Englisch, Tageszusammenfassung, Stups), deutsches Gerät unverändert, Wächter-Aktivität auf Englisch. Changelog, Version `1.15.0-beta.1`.
- [ ] **Step 2:** Prüfungen, Push, CI, Beta aktualisieren wie in Task 12.
- [ ] **Step 3: Warten auf Freigabe**, dann stabil `1.15.0` wie in Task 12 Schritt 3 (zweisprachiger Changelog, Screenshots, `main`, CI, normale App).

---

## Teil C: 1.16.0 – Doku, Demo, Ankündigung

### Task 19: Englische Doku, deutsche Fassungen bleiben

**Files:**
- Create: `README.de.md`, `stups/DOCS.de.md`, `stups-beta/DOCS.de.md`, `docs/docker.de.md`, `docs/entwicklung.de.md` (je der bisherige Text, im Kopf Link zur englischen Fassung)
- Modify: `README.md`, `stups/DOCS.md`, `stups-beta/DOCS.md`, `docs/docker.md`, `docs/entwicklung.md` (Englisch, im Kopf Link zur deutschen Fassung, englische Fassung ist maßgeblich)
- Test: `packages/server/test/addon-files.test.ts` (DOCS-Dateien beider Apps vorhanden, Kopflink zeigt auf existierende Datei)

- [ ] **Step 1:** Test für die Kopflinks schreiben, Fehlschlag prüfen.
- [ ] **Step 2:** Deutsche Dateien kopieren (`git mv` nicht verwenden, die Historie bleibt an den englischen Namen), die englischen schreiben; Testliste und Spec-Dokumente bleiben Deutsch.
- [ ] **Step 3:** Test grün, Commit.

### Task 20: Screenshots in beiden Sprachen

**Files:**
- Modify: `e2e/screenshots.mjs` (Aufrufparameter `--lang en|de`, Browserkontext `locale`, Beispieldaten in der Sprache), `README.md` (Bilder `docs/images/en/…`), `README.de.md` (Bilder `docs/images/…` wie bisher)
- Create: `docs/images/en/*.png` (erzeugt)

- [ ] **Step 1:** Parameter einbauen: ohne Angabe wie bisher (Deutsch, Ordner `docs/images`), `--lang en` → Ordner `docs/images/en`, englische Beispieldaten (Karten „Take out trash", „File tax return", Personen Anna/Ben).
- [ ] **Step 2:** `pnpm build && node e2e/screenshots.mjs --lang en && node e2e/screenshots.mjs`; Bilder ansehen (Board, Agenda, Wächter): kein deutscher Text in den englischen. Commit.

### Task 21: Demo-GIF

**Files:**
- Create: `e2e/demo.mjs`, `docs/images/demo.en.gif`, `docs/images/demo.de.gif`, `packages/server/test/demo-gif.test.ts` (liest die GIF-Dateien: Kennung `GIF89a`, Größe < 3 MB)
- Modify: Wurzel-`package.json` (Entwicklungsabhängigkeit `gifenc`), `README.md`/`README.de.md` (GIF unter dem Kopf)

**Interfaces:**
- Produces: `node e2e/demo.mjs --lang en|de` schreibt `docs/images/demo.<lang>.gif` (iPhone-Ansicht, höchstens 20 Sekunden).

- [ ] **Step 1: Test:** `demo-gif.test.ts` (Dateien vorhanden, `GIF89a`, kleiner als 3 MB, Breite ≤ 390 Pixel aus dem Kopf der Datei).
- [ ] **Step 2:** Fehlschlag prüfen. `pnpm add -wD gifenc` (exakte Version in `package.json`, Lizenz prüfen).
- [ ] **Step 3:** `demo.mjs` nach dem Muster von `screenshots.mjs` (Server mit erfundenen Daten, WebKit, Einzelbilder per Screenshot, Zusammensetzen mit `gifenc` und Palette über `quantize`): Abfolge Schnell-Eingabe tippen → Chips → anlegen → per Wischen erledigen → Agenda → Wächter-Karte erscheint live; Bilder vor dem Zusammensetzen auf 390 Pixel Breite verkleinern.
- [ ] **Step 4:** Beide GIFs erzeugen, ansehen (Einzelbilder prüfen), Test grün, Commit.

### Task 22: Ankündigungsentwürfe

**Files:**
- Create: `docs/announcements/ha-community.en.md`, `reddit.en.md`, `github-release.en.md`, `forum-de.md`

- [ ] **Step 1:** Je Text: was Stups ist (ein Satz), Nutzen (Wächter, Stupsen, Push mit „Erledigt", Schnell-Eingabe), das GIF (`docs/images/demo.en.gif`/`demo.de.gif`, Rohlink auf GitHub), Installation (Knopf „Zu Home Assistant hinzufügen", Beta-Adresse), **ehrliche Aussage zur Lizenz** (PolyForm Strict: Quelltext einsehbar, kein Open Source, Nutzung privat erlaubt), Bitte um Rückmeldung. Reddit kurz (unter 200 Wörter), Forum ausführlicher, Release-Text als Liste. Im Kopf jeder Datei: „Entwurf, nicht veröffentlicht".
- [ ] **Step 2:** Selbstprüfung: keine erfundenen Zahlen, keine Versprechen („nie", „sicher"), Links stimmen (Repository, Beta-Adresse).
- [ ] **Step 3:** Commit.

### Task 23: Beta 1.16.0-beta.1 und Freigabe

**Files:**
- Modify: `docs/testliste.md` (Abschnitt 23: README, GIF, englische Add-on-Texte in Home Assistant), `stups-beta/CHANGELOG.md`, `stups-beta/config.yaml` (`1.16.0-beta.1`)

- [ ] **Step 1:** Prüfungen, Push nach `beta`, CI, Beta aktualisieren.
- [ ] **Step 2: Warten auf Freigabe**, dann stabil `1.16.0` (zweisprachiger Changelog, Screenshots beider Sprachen, `main`, CI, normale App). Die Ankündigungen übergibt der Assistent dem Nutzer zum Veröffentlichen; er veröffentlicht selbst nichts.

---

## Selbstprüfung gegen die Spec

- 4.1 Mechanismus → Tasks 1, 2, 13; Abdeckungstest beider Seiten → 2, 13.
- 4.2 Sprache → Tasks 3, 4, 13, 15 (Push aus Datenbank, `null` → Deutsch).
- 4.3 drei Versionen → Teile A, B, C.
- 4.4 Tests → in jedem Task; Projekt `english` → 11, 17; Server-Setup `de` → 13.
- 4.5 Doku → 19, 20, Changelog in 12/18/23.
- 4.6 GIF → 21; 4.7 Ankündigungen → 22.
- 3.3 Stups-Vorlagen beim Zustellen → 15; Notizen der Wächter (in der Spec nicht erwähnt, beim Planen gefunden) → 16.
- Offen gegenüber der Spec: Namen der Sensoren in Home Assistant bleiben Deutsch (eigene Entscheidung nötig, siehe Übergabe).
