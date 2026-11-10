# Optionen in die App (Release 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Add-on übernimmt der erste Start die Optionen `users`, `access_mode`, `dashboard_path`, `daily_summary_time`, `overdue_nag_time` einmalig in die Datenbank, die App ist danach frei, und die Uhrzeit fürs Nachhaken ist in der App einstellbar.

**Architecture:** Ein neuer Store-Aufruf `importAddonOptions` (Transaktion, Merkmal `addonOptionsImported`) wird in `main.ts` nur im Modus `addon` aufgerufen; dort gelten danach feste Standardwerte statt der Optionen. Die neue Einstellung `overdueNagTime` folgt dem Muster von `dailySummaryTime` (Store, `/api/settings`, Seite in den Einstellungen). Docker bleibt, wie es ist.

**Tech Stack:** TypeScript, Fastify, SQLite (`node:sqlite`-Store in `packages/server/src/store/`), Svelte 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-optionen-in-die-app-design.md` (Release 2, das Entfernen aus dem Schema, ist **nicht** Teil dieses Plans).

## Global Constraints

- Nur Modus `addon` ändert sein Verhalten; `standalone` und `standalone-ha` (Docker) lesen `STUPS_*` und `options.json` wie bisher, samt Sperren der App bei gefüllter Liste.
- Standardwerte im Add-on: Dashboard `/`, Tageszusammenfassung `08:00`, Nachhaken `18:00`. Eine Option wird nur übernommen, wenn sie **davon abweicht** und in der App noch nichts gesetzt ist.
- Der Import entfernt niemanden und läuft genau einmal (`addonOptionsImported`).
- Ein ungültiger Wert bricht den Start nicht ab: überspringen, Warnung ins Protokoll.
- Uhrzeiten haben die Form `HH:MM` (`/^([01]\d|2[0-3]):[0-5]\d$/`); Fehlermeldung wie bei der Tageszusammenfassung: `Die Uhrzeit muss die Form HH:MM haben, zum Beispiel 09:00`.
- Jeder neue Text steht deutsch im Quelltext und englisch in `packages/web/src/lib/i18n/en.ts` bzw. `packages/server/src/i18n/en.ts` (die Abdeckungstests erzwingen es).
- Release 1 lässt `config.yaml` (Schema, Standardwerte) unverändert; nur die Namen der Optionen in den Übersetzungen bekommen „(veraltet)".
- Beta-Version nach Abschluss: `1.41.0-beta.3`.
- Testbefehle: `pnpm --filter @stups/server test`, `pnpm --filter @stups/web test`, `pnpm lint`, `pnpm typecheck`, `pnpm e2e <Datei>`. Bekannt fehlschlagend (vorher, Windows/Zeitzone, nicht anfassen): Server `migration-28`, `transfer`; Web `design-tokens`, `haSafeArea`, `statsSheet-ui`; Browser `25-einstellungen` (3).

## Review Focus

- `users` mit leeren Namen, doppelten Namen oder anderer Groß-/Kleinschreibung: kein Absturz, keine doppelten Personen (Task 2).
- Eine Person steht in der Datenbank, aber nicht in `users`: sie bleibt Person (Task 2).
- Zweiter Start mit geänderten Optionen: nichts ändert sich (Task 2).
- Ungültige Uhrzeit in `options.json`: Start gelingt, die übrigen Werte werden übernommen (Task 2).
- Ein Mitglied ohne Recht „settings" ändert die Nachhaken-Uhrzeit nicht, die API antwortet 403 (Task 1), die Seite zeigt das Feld gesperrt (Task 3).
- Docker mit gefüllter `STUPS_USERS`: App bleibt gesperrt, kein Import (Task 2).

---

### Task 1: Einstellung `overdueNagTime` (Store, API, Planer)

**Files:**
- Modify: `packages/server/src/store/types.ts` (Interface `Settings`, ca. Zeile 24)
- Modify: `packages/server/src/store/people.ts` (`getSettings`, `setSettings`, ca. Zeile 495–521)
- Modify: `packages/server/src/api/settings.ts` (`effectiveSettings`, `PUT /api/settings`)
- Modify: `packages/server/src/api/kit.ts:82-83` (Dep umbenennen)
- Modify: `packages/server/src/main.ts:302` (Dep-Name)
- Modify: `packages/server/src/notifications.ts:476`
- Modify: `packages/web/src/lib/api.ts` (Typ `Settings`, ca. Zeile 300–310; `saveSettings` ca. Zeile 827)
- Modify: `packages/web/src/components/ReminderEditor.svelte:54,79`
- Test: `packages/server/test/reminders-api.test.ts`, `packages/server/test/reminders.test.ts`, `packages/server/test/store-extras.test.ts`

**Interfaces:**
- Produces: `Settings.overdueNagTime: string | null` (eigene Uhrzeit, `null` = Standard); `store.setSettings({ overdueNagTime?: string | null })`; `GET/PUT /api/settings` liefern zusätzlich `defaultOverdueNagTime: string` und `effectiveOverdueNagTime: string`; die Dep `ApiDeps.overdueNagTime` heißt künftig `defaultOverdueNagTime?: string`.
- Produces (Web): `Settings` in `lib/api.ts` bekommt `overdueNagTime: string | null`, `defaultOverdueNagTime: string`, `effectiveOverdueNagTime: string`; `api.saveSettings` nimmt `overdueNagTime`.

- [ ] **Step 1: Failing tests schreiben**
  - `store-extras.test.ts` (Zeilen 93 und 95 vergleichen `getSettings()` mit `toEqual({…})`: dort kommt `overdueNagTime: null` dazu; neben den Tests zu `dailySummaryTime`): `store.setSettings({ overdueNagTime: '20:15' }).overdueNagTime === '20:15'`; `null` setzt auf `null` zurück; `'25:00'` und `'9:00'` werfen `ValidationError`.
  - `reminders-api.test.ts`: Die Registrierung nutzt `defaultOverdueNagTime: '19:15'`. Der bestehende Ausdruck `.body.overdueNagTime).toBe('19:15')` wird zu `effectiveOverdueNagTime`, dazu: `defaultOverdueNagTime === '19:15'`, `overdueNagTime === null`; `PUT /api/settings { overdueNagTime: '20:00' }` als Rene (Administrator) liefert `effectiveOverdueNagTime === '20:00'`; `{ overdueNagTime: '99:99' }` liefert 400; `{ overdueNagTime: null }` stellt `19:15` wieder her. Zusätzlich: Eine Person ohne Recht `settings` (das Muster steht in `test/permissions-api.test.ts` für `dailySummaryTime`) bekommt 403.
  - `reminders.test.ts` in `describe('Nachhaken: Planer')`: Karte mit `dueAt: '2026-11-04T09:00:00Z'` und Erinnerung `spec({ afterMin: 1440, everyMin: null, max: 1, atTime: null })`. Ohne App-Einstellung steht nach dem ersten `tick()` `next_at`/Zeitpunkt auf `2026-11-05T17:00:00.000Z` (18:00 Berlin, wie der bestehende `firstAt`-Test); nach `store.setSettings({ overdueNagTime: '20:00' })` auf `2026-11-05T19:00:00.000Z`. Die Zeile liest `rows()` wie die Nachbartests.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**
  Run: `pnpm --filter @stups/server exec vitest run test/store-extras.test.ts test/reminders-api.test.ts test/reminders.test.ts`
  Expected: FAIL (Feld/Antwort fehlen).

- [ ] **Step 3: Server umsetzen**
  - `store/types.ts`: `Settings.overdueNagTime: string | null` mit Kommentar „Uhrzeit des Nachhakens in Tagen/Wochen ohne eigene Uhrzeit; null = Standard".
  - `store/people.ts`: `getSettings()` liest `get('overdueNagTime')`; `setSettings` bekommt `overdueNagTime?: string | null` im Typ und einen Block wie `dailySummaryTime` (am besten beide über einen kleinen gemeinsamen Helper `putTimeSetting(key, value)`, der Löschen, Prüfen und Speichern kapselt).
  - `api/settings.ts`: `effectiveSettings()` liefert `defaultOverdueNagTime = deps.defaultOverdueNagTime ?? '18:00'` und `effectiveOverdueNagTime = s.overdueNagTime ?? default`; das alte Feld `overdueNagTime: deps.overdueNagTime ?? '18:00'` entfällt (das Feld kommt jetzt über `...s`). `PUT`: `overdueNagTime` zählt wie `dailySummaryTime` zu den Feldern mit `requirePermission(req, 'settings')` und wird an `setSettings` gereicht.
  - `api/kit.ts`: `overdueNagTime?: string` wird zu `defaultOverdueNagTime?: string` (Kommentar: Rückfall, im Add-on fest `18:00`, in Docker `STUPS_OVERDUE_NAG_TIME`). `main.ts:302`: Name anpassen (der Wert bleibt vorerst `options.overdueNagTime`, Task 2 stellt ihn für das Add-on um).
  - `notifications.ts:476`: `const defaultTime = store.getSettings().overdueNagTime ?? options.overdueNagTime;`, und der Kommentar am Feld `options` (Zeile 15) sagt, dass es der Rückfall ist.

- [ ] **Step 4: Web nachziehen**
  - `lib/api.ts`: Typ `Settings` (Feld `overdueNagTime?: string` Zeile 306 wird ersetzt durch die drei Felder aus „Interfaces"); `saveSettings` nimmt `overdueNagTime: string | null` im `Partial<{…}>`.
  - `ReminderEditor.svelte:54,79`: `ui.settings?.overdueNagTime` wird zu `ui.settings?.effectiveOverdueNagTime`.

- [ ] **Step 5: Tests und Prüfungen**
  Run: `pnpm --filter @stups/server test && pnpm --filter @stups/web test && pnpm typecheck`
  Expected: nur die bekannten Fehlschläge; die neuen Tests PASS.

- [ ] **Step 6: Commit**
  `git add -A && git commit -m "Stups 1.41.0-beta.3 (1): Uhrzeit fürs Nachhaken als Einstellung der App"`

### Task 2: Einmalige Übernahme der Add-on-Optionen

**Files:**
- Create: `packages/server/src/addon-options.ts` (Standardwerte und die Umwandlung der Optionen)
- Modify: `packages/server/src/store/types.ts` (neue Typen `AddonOptionsImport`, `AddonImportResult`)
- Modify: `packages/server/src/store/people.ts` (`importAddonOptions`; exportieren)
- Modify: `packages/server/src/store.ts` (Methode in das Store-Objekt aufnehmen, wie `importLegacyPeople` bei Zeile ~147)
- Modify: `packages/server/src/main.ts:60-75` (Aufruf) und die Stellen, die `options.*` weiterreichen (`:300-302`, `liveOptions` ca. Zeile 284)
- Test: `packages/server/test/addon-import.test.ts` (neu), `packages/server/test/runtime.test.ts` (unverändert, nur prüfen)

**Interfaces:**
- Consumes (Task 1): `store.setSettings`, `Settings.overdueNagTime`.
- Produces in `addon-options.ts`:
  - `export const ADDON_DEFAULTS = { dashboardPath: '/', dailySummaryTime: '08:00', overdueNagTime: '18:00' } as const`
  - `export function addonImportOf(raw: Options): AddonOptionsImport` (rohe Optionen → Eingabe des Imports)
  - `export function addonFallbackOptions(raw: Options): Options` (wie `raw`, aber `users: []`, `accessMode: 'selected'` und die drei Standardwerte; nur `logLevel` bleibt)
- Produces im Store: `importAddonOptions(o: AddonOptionsImport, defaults: AddonOptionsDefaults): AddonImportResult | null`, wobei `AddonOptionsImport = { users: { name: string; notify: string[] }[]; accessMode: 'everyone' | 'selected'; dashboardPath: string; dailySummaryTime: string; overdueNagTime: string }`, `AddonOptionsDefaults = { dashboardPath: string; dailySummaryTime: string; overdueNagTime: string }`, `AddonImportResult = { people: number; accessMode: 'everyone' | 'selected' | null; settings: string[] }` (`settings` nennt die übernommenen Schlüssel); Rückgabe `null`, wenn `addonOptionsImported` schon gesetzt ist.

- [ ] **Step 1: Failing tests schreiben** (`test/addon-import.test.ts`, Store mit `createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' })` wie `people.test.ts`; `const D = ADDON_DEFAULTS` und ein Helfer `input(patch)` mit leerer Liste, `accessMode: 'selected'` und den Standardwerten)
  - verwaltete Installation: vorher `store.applyManagedPeople([{name:'Anna',notify:['mobile_app_a']}], 'selected')`; Import mit `users: [Anna, Ben(notify ['mobile_app_b'])]`, `accessMode: 'everyone'` ergibt `isManaged() === false`, Personen Anna und Ben mit ihren Geräten, `getAccessMode() === 'everyone'`, Ergebnis `{ people: 2, accessMode: 'everyone', settings: [] }`.
  - eine in der Datenbank vorhandene, nicht genannte Person bleibt Person.
  - Namen: `''`, `'  '`, `'anna'` neben vorhandener `Anna`, doppelt genannter `Ben`: genau Anna und Ben, keine Duplikate, kein Wurf.
  - leeres `users`: `importLegacyPeople`-Verhalten (frische Datenbank: `getAccessMode() === 'selected'`; Datenbank mit Person: `'everyone'`), `isManaged()` falsch, `people` im Ergebnis 0.
  - Standardwerte werden nicht geschrieben: `getSettings()` hat danach `dashboardPath === null`, `dailySummaryTime === null`, `overdueNagTime === null`, `settings` ist `[]`.
  - Abweichende Werte (`'/lovelace/home'`, `'07:30'`, `'19:45'`) landen in `getSettings()`, `settings` nennt `['dashboardPath','dailySummaryTime','overdueNagTime']`; ein vorher in der App gesetztes `dailySummaryTime: '06:00'` bleibt.
  - Ungültig: `dailySummaryTime: '25:00'` und `dashboardPath: 'ohne-schraegstrich'` werden übersprungen, die übrigen Werte kommen, kein Wurf.
  - Einmalig: Zweiter Aufruf mit anderen Optionen gibt `null` zurück und ändert nichts.
  - `addonFallbackOptions(parseOptions({ users: [{name:'A',notify:[]}], dashboard_path: '/x', daily_summary_time: '05:00', overdue_nag_time: '05:30', log_level: 'debug' }))` hat `users: []`, `dashboardPath: '/'`, `dailySummaryTime: '08:00'`, `overdueNagTime: '18:00'`, `logLevel: 'debug'`.
  - Docker: `resolveRuntime({ STUPS_USERS: '[{"name":"Anna","notify":[]}]' }, files())` hat `mode !== 'addon'` (Hinweis: der Aufruf von `importAddonOptions` hängt in `main.ts` an `runtime.mode === 'addon'`; ein Test dafür steht in Step 4).

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**
  Run: `pnpm --filter @stups/server exec vitest run test/addon-import.test.ts`
  Expected: FAIL (Modul/Funktion fehlen).

- [ ] **Step 3: Implementieren**
  - `store/people.ts`, `importAddonOptions` in einer Transaktion (`tx`, verschachtelbar): gibt `null` zurück, wenn `getSetting('addonOptionsImported') !== null`. `users` mit mindestens einem nicht leeren Namen: `syncPeople(listed)` (entfernt niemanden), `putSetting('accessMode', o.accessMode)`, `legacyPeopleImported` setzen, falls leer. Sonst: `importLegacyPeople([])` aufrufen. In beiden Fällen `clearManaged()`. Danach die drei Einstellungen: nur wenn der Wert vom Default abweicht, die App-Einstellung leer ist und der Wert gültig ist (`dashboardPath` über `checkDashboardPath`, Uhrzeiten über die Zeitprüfung aus Task 1), über `setSettings` schreiben; ungültige Werte überspringen. Zuletzt `putSetting('addonOptionsImported', iso())`. Ergebnis wie in „Interfaces".
  - `store.ts`: `importAddonOptions: s.importAddonOptions`.
  - `addon-options.ts`: wie in „Interfaces".
  - `main.ts`: Im Modus `addon` `const result = store.importAddonOptions(addonImportOf(options), ADDON_DEFAULTS)`; bei Ergebnis ins Protokoll (`Aus den Add-on-Optionen übernommen: {people} Personen, Zugriff {…}, {settings}`), bei ungültigen übersprungenen Werten eine Warnung; der bisherige `if/else` mit `applyManagedPeople` bleibt für alle anderen Modi. `options` wird danach im Add-on-Modus durch `addonFallbackOptions(options)` ersetzt (`const options = runtime.mode === 'addon' ? addonFallbackOptions(runtime.options) : runtime.options`), damit `defaultDashboardPath`, `defaultDailySummaryTime`, `defaultOverdueNagTime`, Notifier und `spike.ts` nur noch die Standardwerte sehen. Der Import braucht dagegen `runtime.options` (roh), nicht die ersetzte Fassung.

- [ ] **Step 4: Verdrahtung testen**
  Die Wahl „addon → Import, sonst → alter Weg" steckt in `main.ts` und ist dort nicht einzeln aufrufbar. Dafür eine Funktion `applyStartupOptions(store, runtime, log)` in `addon-options.ts` auslagern (`main.ts` ruft sie auf) und testen: Modus `addon` mit gefülltem `users` → nicht gesperrt; Modus `standalone` mit gefülltem `users` → `isManaged() === true`, `addonOptionsImported` nicht gesetzt; zweiter Aufruf im Modus `addon` ändert nichts. Signatur: `applyStartupOptions(store: Store, runtime: { mode: Mode; options: Options }, log: { info(m: string): void; warn(m: string): void }): void`.

- [ ] **Step 5: Tests und Prüfungen**
  Run: `pnpm --filter @stups/server test && pnpm typecheck && pnpm lint`
  Expected: nur die bekannten Fehlschläge; neue Tests PASS; `runtime.test.ts` unverändert grün.

- [ ] **Step 6: Commit**
  `git add -A && git commit -m "Stups 1.41.0-beta.3 (2): Add-on-Optionen einmalig in die Datenbank übernehmen, danach gilt die App"`

### Task 3: Seite „Nachhaken um …" in den Einstellungen

**Files:**
- Create: `packages/web/src/components/settings/NagPage.svelte`
- Modify: `packages/web/src/lib/settingsPages.ts` (Typ `SettingsPageId`, Gruppe `household`, nach `summary`)
- Modify: `packages/web/src/components/SettingsSheet.svelte` (Import, Zweig `{:else if page === 'nag'}`, `valueOf`, die Tabelle der Farben/Meta, wie `summary`)
- Modify: `packages/web/src/lib/i18n/en.ts`
- Test: `packages/web/test/settingsPages.test.ts` (Sichtbarkeit), `packages/web/test/settings-nag.test.ts` (neu; Server-Rendering mit `render` wie in `test/statsSheet-ui.test.ts`)

**Interfaces:**
- Consumes (Task 1): `ui.settings.effectiveOverdueNagTime`, `ui.settings.overdueNagTime`, `ui.settings.defaultOverdueNagTime`, `api.saveSettings({ overdueNagTime })`.
- Produces: Seite `'nag'`, Titel `Nachhaken um …`, sichtbar mit `may('settings') && ctx.push` (wie `summary`).

- [ ] **Step 1: Failing test schreiben**
  - In `settingsPages.test.ts`: Die Seitenliste (`settingsPages`) enthält `nag` direkt nach `summary` für einen Administrator mit Push und nicht für ein Kind oder eine Person ohne Recht `settings`.
  - In `settings-nag.test.ts`, gerendert: zeigt die wirksame Uhrzeit (`effectiveOverdueNagTime`) im Feld; ohne Recht `settings` ist das Feld `disabled`; mit eigener Uhrzeit (`overdueNagTime !== null`) steht die Zeile „Zurücksetzen", ohne eigene der Hinweis mit `defaultOverdueNagTime`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**
  Run: `pnpm --filter @stups/web exec vitest run test/settings-nag.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementieren**
  - `NagPage.svelte` als Kopie des Musters von `SummaryPage.svelte` mit diesen Texten (deutsch, alle englisch in `en.ts`): Titel `Nachhaken um …`; Erklärung `Wenn ein Nachhaken in Tagen oder Wochen keine eigene Uhrzeit hat, kommt es zu dieser Uhrzeit. Die Uhrzeit gilt für alle; das ändern Administratoren und wer die Berechtigung „App-Einstellungen“ hat.`; Feldbeschriftung `Uhrzeit`; aria-label `Uhrzeit des Nachhakens`; Zeile `Zurücksetzen` mit Meta `Wieder die Standard-Uhrzeit nehmen ({time})`; Hinweis ohne eigene Uhrzeit `Gerade gilt die Standard-Uhrzeit ({time}).` (`id="nag-time"`).
  - `settingsPages.ts`: `'nag'` in den Typ und `...page('nag', t('Nachhaken um …'), 'bell', may('settings') && ctx.push)` nach `summary`.
  - `SettingsSheet.svelte`: Import, Zweig, `valueOf('nag')` = `ui.settings?.effectiveOverdueNagTime`, Meta-/Farbeintrag wie bei `summary`.

- [ ] **Step 4: Tests und Prüfungen**
  Run: `pnpm --filter @stups/web test && pnpm typecheck && pnpm lint`
  Expected: nur die bekannten Fehlschläge; der Katalog-Test (`i18n-coverage`) PASS.

- [ ] **Step 5: Commit**
  `git add -A && git commit -m "Stups 1.41.0-beta.3 (3): Seite Nachhaken um … in den Einstellungen"`

### Task 4: Hinweise, Doku, Browser-Test, Version

**Files:**
- Modify: `stups/translations/de.yaml`, `stups/translations/en.yaml`, `stups-beta/translations/de.yaml`, `stups-beta/translations/en.yaml` (müssen gleich bleiben, der Test `die Übersetzung stimmt mit der normalen App überein` prüft es)
- Modify: `docs/docker.md`, `docs/docker.de.md` (Zeile zu `STUPS_OVERDUE_NAG_TIME`)
- Modify: `stups/DOCS.md`, `stups/DOCS.de.md`, `stups-beta/DOCS.md`, `stups-beta/DOCS.de.md` (kurzer Hinweis im Abschnitt „Add-on options": gilt nur beim ersten Start, danach in der App; der Abschnitt wird erst in Release 2 gekürzt)
- Modify: `stups-beta/config.yaml` (Version), `stups-beta/CHANGELOG.md`
- Create: `e2e/47-optionen-uebernahme.spec.ts` (46 ist die letzte vergebene Nummer) samt Server-Start mit vorbelegter `options.json` nach dem Muster von `e2e/server-beta.mjs` / `e2e/server-onboarding.mjs` und einem neuen Projekt in `e2e/playwright.config.ts`
- Test: `packages/server/test/addon-files.test.ts`

- [ ] **Step 1: Failing test schreiben** (`addon-files.test.ts`): Für `stups` und `stups-beta` beginnt der Name jeder der fünf Optionen `users`, `access_mode`, `dashboard_path`, `daily_summary_time`, `overdue_nag_time` in `translations/de.yaml` mit dem Zusatz `(veraltet)` und in `en.yaml` mit `(deprecated)`; `log_level` bleibt ohne Zusatz. Run: `pnpm --filter @stups/server exec vitest run test/addon-files.test.ts`, Expected: FAIL.

- [ ] **Step 2: Übersetzungen ändern.** Namen: `Personen und Push-Geräte (veraltet)` usw.; jede Beschreibung beginnt mit `Gilt nur beim ersten Start nach dem Update, danach pflegst du das in der App unter ` und nennt den Ort (`Einstellungen › Personen & Zugriff`, `Einstellungen › Dashboard`, `Einstellungen › Tageszusammenfassung`, `Einstellungen › Nachhaken um …`); englisch sinngemäß mit den englischen Namen der Seiten (`Settings › People & access` usw., aus `en.ts` übernehmen). Run: der Test aus Step 1, Expected: PASS.

- [ ] **Step 3: Doku.** Docker-Zeile `STUPS_OVERDUE_NAG_TIME`: Zusatz „in der App unter Einstellungen › Nachhaken um … lässt sie sich ändern und hat dann Vorrang" (englisch gleich), wie bei `STUPS_DAILY_SUMMARY_TIME`. `DOCS`-Abschnitt (vier Dateien): ein Absatz „Seit 1.41 übernimmt Stups diese Werte beim ersten Start in die App; spätere Änderungen hier haben keine Wirkung. Pflege Personen, Zugriff, Dashboard und Uhrzeiten in den Einstellungen." Der Test `die englischen Fassungen sind wirklich englisch` und die Sprachverweise laufen mit.

- [ ] **Step 4: Browser-Test.** Server wie im Add-on-Nachbau mit `options.json` `{ users: [Anna, Ben], access_mode: 'selected', overdue_nag_time: '19:30' }` und `SUPERVISOR_TOKEN`-Nachbau (siehe `e2e/server-beta.mjs`): Als Administrator zeigt Einstellungen › Personen & Zugriff Anna und Ben **ohne** Sperrhinweis (`data-testid="managed-note"` fehlt), „Nachhaken um …" zeigt `19:30`, Ändern auf `20:00` bleibt nach Neuladen. Run: `pnpm build && pnpm e2e 47-optionen-uebernahme`, Expected: PASS in allen Projekten, in denen er läuft.

- [ ] **Step 5: Version und Changelog.** `stups-beta/config.yaml`: `1.41.0-beta.3`. `stups-beta/CHANGELOG.md` oben ein Abschnitt `## 1.41.0-beta.3`: **Optionen in der App.** Beim ersten Start nach dem Update übernimmt Stups Personen, Push-Geräte, Zugriff, Dashboard und die Uhrzeiten aus der Add-on-Konfiguration; danach sind sie in der App änderbar, auch wenn die Konfiguration vorher alles sperrte. Neu: **Nachhaken um …** (Standard 18:00). Die Optionen in der Konfiguration sind als veraltet markiert und wirken nur noch beim ersten Start; in einer späteren Version verschwinden sie. Wer die Konfiguration bisher als Quelle der Wahrheit genutzt hat, pflegt künftig die App.

- [ ] **Step 6: Gesamtprüfung und Commit.**
  Run: `pnpm lint && pnpm typecheck && pnpm test`, Expected: nur die bekannten Fehlschläge. Dann `git add -A && git commit -m "Stups 1.41.0-beta.3: Optionen in die App (Übernahme beim ersten Start, Nachhaken um …)"`. Nicht pushen, bevor der Nutzer es freigibt.
