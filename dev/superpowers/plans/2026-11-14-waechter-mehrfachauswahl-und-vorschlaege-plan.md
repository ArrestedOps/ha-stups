# Wächter: Mehrfachauswahl, Massenbearbeitung, neue Vorlagen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mehrere Wächter gemeinsam bearbeiten/pausieren/löschen, mehrere „Gefunden“-Treffer gemeinsam einrichten/ausblenden, und ~19 neue Geräte-Vorlagen plus ~13 wiederkehrende Vorlagen.

**Architecture:** Zwei neue Sammel-Endpunkte auf dem Server (`POST /api/watchers/bulk`, `POST /api/watchers/bulk-create`) plus Sammel-Ausblenden; jeder läuft in einer Transaktion (alle oder keiner) und nutzt dieselbe Prüfung wie das Einzelspeichern (`parseWatcher`, `checkWatcherTargets`). Die Oberfläche bekommt einen Auswahlzustand (reine Funktionen in `lib/`), eine Auswahl-Leiste und ein Sammel-Formular, das nur gemeinsame Felder zeigt; das gemeinsame Einrichten nutzt den bestehenden Assistenten (`WatcherEditor`) mit einer Geräteliste statt einer Entität.

**Tech Stack:** TypeScript, Fastify, better-sqlite3 (über `store.transaction`), Svelte 5 (Runes), Tailwind, Vitest, Playwright.

**Spec:** `dev/superpowers/specs/2026-11-14-waechter-mehrfachauswahl-und-vorschlaege-design.md`

## Global Constraints

- Arbeite auf einem neuen Branch `waechter-mehrfach` ab `beta`. Nicht pushen.
- Nie `git add -A` / `git add .`: `.claude/` und `skills-lock.json` sind absichtlich ungetrackt. Dateien einzeln adden.
- Commit-Nachrichten auf Deutsch im Stil des Repos, mit Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle sichtbaren Texte über `t(...)` und mit englischer Übersetzung (`packages/server/src/i18n/en.ts`, `packages/web/src/lib/i18n/en.ts`); Tests wie `onboarding-texts.test.ts` prüfen fehlende Übersetzungen.
- Neue Routen in `packages/server/test/fixtures/api-routes.json` eintragen (Tests `board-visibility`, `child-guard` lesen die Liste); Kinder dürfen sie nicht (wie die anderen Wächter-Routen).
- Rechte: alle neuen Routen `requirePermission(req, 'watchers')`; Board-Zugriff über `checkWatcherTargets` je Wächter.
- Gerät (Entität), Name und Kartentitel werden NIE durch die Massenbearbeitung gesetzt.
- Nur angefasste Felder werden geschrieben; „verschieden“ bleibt je Wächter erhalten.
- Löschen mehrerer Wächter nur nach Rückfrage „{n} Wächter löschen?“ (`ui.confirm`, wie das Einzellöschen in `watcher-editor.svelte.ts`).
- Verifikation vor jedem Commit: `pnpm -r test` und `pnpm lint` grün.
- Am Ende: Eintrag in `stups-beta/CHANGELOG.md` (+ `.de.md` falls vorhanden) im Stil der bisherigen Einträge.

## Review Focus

1. **Gemischte Auswahl mit Auslöser-Feldern:** Schickt die Oberfläche eine Schwelle an Wächter verschiedener Art (z. B. Kalender + Batterie), lehnt der Server mit 400 ab und ändert keinen Wächter. → Test in Task 1.
2. **Ein Wächter der Auswahl ist ungültig nach dem Patch** (z. B. Board ohne Zugriff, Spalte fehlt): ganze Anfrage scheitert, kein Wächter geändert (Transaktion). → Test in Task 1.
3. **Wächter wurde zwischendurch gelöscht** (veraltete Auswahl): 404, nichts geändert; Oberfläche lädt neu und meldet es. → Test in Task 1.
4. **Gemeinsames Einrichten mit Entität, die schon beobachtet wird** (Doppelklick, zweiter Tab): diese Entität wird übersprungen und in der Antwort als `skipped` gemeldet, die übrigen entstehen. → Test in Task 3.
5. **`assignees_missing`-Wächter in der Auswahl** bei Patch ohne `assign`: Zuteilung bleibt unangetastet (gleiches Verhalten wie `PATCH /api/watchers/:id`). → Test in Task 1.

---

### Task 1: Server – Massenbearbeitung `POST /api/watchers/bulk`

**Files:**
- Create: `packages/server/src/watcher-bulk.ts`
- Modify: `packages/server/src/api/watchers.ts` (neue Route neben `PATCH /api/watchers/:id`, gleiche Nachbehandlung: Stupsen der offenen Karte synchronisieren, `engine.onSaved`, bei aktiv=false `engine.syncSubscriptions()`)
- Modify: `packages/server/test/fixtures/api-routes.json`
- Test: `packages/server/test/watcher-bulk.test.ts` (reine Funktion), `packages/server/test/watchers-bulk-api.test.ts` (Route, Aufbau wie `watchers-api.test.ts`)

**Interfaces:**
- Produces (`watcher-bulk.ts`):
  ```ts
  export interface BulkPatch {
    active?: boolean;
    category?: string | null;
    assign?: AssignRule;                       // ganz ersetzt
    card?: Partial<Pick<CardTemplate, 'boardId' | 'columnId' | 'categoryIds' | 'priority' | 'due'>>;
    cooldownMin?: number;
    dedupe?: boolean;
    nudge?: WatcherNudge | null;
    countsForFairness?: boolean;
    trigger?: Partial<Pick<WatchTrigger, 'value' | 'forMin' | 'count' | 'leadMin' | 'to'>> & { forecastHours?: number };
    done?: { value?: number | null; to?: string | null } | null;   // null = „von selbst erledigen“ aus
  }
  export type TriggerFamily = 'below' | 'above' | 'state' | 'calendar_event' | 'forecast';
  /** Gemeinsame Auslöser-Familie; bei below/above zusätzlich gleiche Einheit nötig (unit wird übergeben). null = gemischt */
  export function commonFamily(ws: { trigger: WatchTrigger; unit?: string | null }[]): TriggerFamily | null;
  /** Wendet den Patch auf eine Konfiguration an (tief für card/trigger/done), ohne entityId/name/card.title anzufassen */
  export function applyBulkPatch(config: WatcherConfig, patch: BulkPatch): WatcherConfig;
  /** Wirft ValidationError für unbekannte Schlüssel oder Auslöser-Felder bei gemischter Familie */
  export function parseBulkPatch(raw: unknown, family: TriggerFamily | null): BulkPatch;
  ```
- Route: `POST /api/watchers/bulk` Body `{ ids: string[]; patch: BulkPatch }` → `200 { items: WatcherView[] }`. `ids` 1–500, eindeutig. Unbekannte ID → 404, nichts geändert.
- `done: null` schaltet „von selbst erledigen“ aus; `done: { value }` ändert nur den Wert, wenn der Wächter schon eine Done-Bedingung hat (sonst bleibt `done` wie es ist; das Einschalten braucht eine Entität und gehört in die Einzelbearbeitung).

- [ ] **Step 1: Failing tests für `applyBulkPatch`/`commonFamily`/`parseBulkPatch`**
  - `applyBulkPatch` mit `{ card: { boardId: 'b2', columnId: 'c2' } }` behält `card.title`, `card.description`, `card.icon`.
  - `{ trigger: { value: 15 } }` auf einen below-Wächter: `trigger.value === 15`, `trigger.entityId` unverändert.
  - `commonFamily` von zwei below-Wächtern mit Einheit `%` → `'below'`; below `%` + below `W` → `null`; below + calendar_event → `null`.
  - `parseBulkPatch({ trigger: { value: 10 } }, null)` wirft `ValidationError`; `parseBulkPatch({ name: 'x' }, 'below')` wirft (unbekannter Schlüssel); `parseBulkPatch({ trigger: { entityId: 'sensor.x' } }, 'below')` wirft.
- [ ] **Step 2:** `pnpm --filter ./packages/server test watcher-bulk` → FAIL (Modul fehlt).
- [ ] **Step 3:** `watcher-bulk.ts` implementieren. Werte-Grenzen nicht selbst prüfen: das Ergebnis von `applyBulkPatch` läuft in der Route durch `parseWatcher`.
- [ ] **Step 4:** Tests grün.
- [ ] **Step 5: Failing API-Tests** (`watchers-bulk-api.test.ts`):
  - zwei Batterie-Wächter, `patch: { assign: { mode: 'fixed', personIds: [annaId], ... } }` → beide haben Anna; Namen unverändert.
  - `patch: { active: false }` → beide pausiert, Abos synchronisiert.
  - Review Focus 1: Batterie + Kalender, `patch: { trigger: { value: 10 } }` → 400, beide unverändert.
  - Review Focus 2: ein Wächter auf Board, das nach dem Patch ungültig wäre (Spalte gehört nicht zum Board) → 400, keiner geändert.
  - Review Focus 3: eine unbekannte ID → 404, keiner geändert.
  - Review Focus 5: Wächter mit `status: 'assignees_missing'`, Patch `{ category: 'X' }` → Kategorie gesetzt, `assign` und Status unverändert.
  - Mitglied ohne Recht `watchers` → 403; Kind → 403.
- [ ] **Step 6:** Tests laufen lassen → FAIL.
- [ ] **Step 7:** Route implementieren: alle Wächter laden (404 bei fehlendem), Familie bestimmen (Einheit aus `deps.ha` Zustand bzw. `engine.view()` – dort steht `entityUnit`), Patch parsen, je Wächter `applyBulkPatch` → `parseWatcher` → `checkWatcherTargets`; erst wenn alle gültig sind, in `store.transaction` alle `data.update(...)` (gleiche `keepAssign`/`clearMissing`-Logik wie die Einzelroute; die Logik dafür in eine gemeinsame Hilfsfunktion in `api/watchers.ts` ziehen statt sie zu kopieren); danach je Wächter Stupsen synchronisieren und `engine.onSaved`. `api-routes.json` ergänzen.
- [ ] **Step 8:** `pnpm -r test` und `pnpm lint` grün.
- [ ] **Step 9:** Commit „Wächter: mehrere auf einmal bearbeiten (Server)“.

### Task 2: Server – Sammel-Löschen und Sammel-Ausblenden

**Files:**
- Modify: `packages/server/src/api/watchers.ts`, `packages/server/test/fixtures/api-routes.json`
- Test: `packages/server/test/watchers-bulk-api.test.ts` (erweitern)

**Interfaces:**
- `POST /api/watchers/bulk-delete` Body `{ ids: string[] }` → 204; unbekannte ID → 404, nichts gelöscht; eine Transaktion, danach einmal `engine.syncSubscriptions()`.
- `POST /api/watchers/suggestions/hide-many` Body `{ hits: { templateId: string; entityId: string }[] }` (1–500) → 204; jeder Treffer wie `hitOf` geprüft.

- [ ] **Step 1:** Failing Tests: zwei Wächter löschen → `GET /api/watchers` leer; eine unbekannte ID → 404 und beide noch da; drei Treffer ausblenden → `GET /api/watchers/suggestions` hat sie in `hidden`, nicht in `items`; ungültige Vorlage → 400, nichts ausgeblendet.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Routen implementieren (`hitOf` so umbauen, dass es ein Objekt statt `req` prüft, und in beiden Routen nutzen).
- [ ] **Step 4:** `pnpm -r test`, `pnpm lint` grün.
- [ ] **Step 5:** Commit „Wächter: mehrere löschen, mehrere Treffer ausblenden (Server)“.

### Task 3: Server – gemeinsames Einrichten `POST /api/watchers/bulk-create`

**Files:**
- Modify: `packages/server/src/api/watchers.ts`, `packages/server/test/fixtures/api-routes.json`
- Test: `packages/server/test/watchers-bulk-api.test.ts` (erweitern)

**Interfaces:**
- Body `{ base: WatcherInput; devices: { entityId: string }[] }` (1–200 Geräte). `base` ist ein vollständiger Wächter-Entwurf (wie `POST /api/watchers`) mit der Entität des ersten Geräts; je Gerät wird `trigger.entityId := device.entityId` und `done.entityId := device.entityId` (nur wenn `base.done` gesetzt ist und `base.done.entityId === base.trigger.entityId`) gesetzt. Der Name bleibt `base.name` (Konvention aus `watcher-names.ts`: ein Wächter heißt wie die Vorlage, das Gerät steht als `subject` darunter, die Karte bekommt den Gerätenamen zur Laufzeit).
- Antwort `201 { created: WatcherView[]; skipped: string[] }` (`skipped` = Entitäten, die schon ein Wächter beobachtet – Review Focus 4).
- Fairness-Vorbelegung wie in `POST /api/watchers` (Wert des Boards, wenn nicht angegeben) – dafür die bestehende Logik in eine Hilfsfunktion ziehen.
- `metNow` wird hier NICHT gefragt (bei 20 Geräten keine 20 Dialoge); die Oberfläche zeigt stattdessen „{n} Wächter angelegt“.

- [ ] **Step 1:** Failing Tests: drei Batterie-Entitäten → drei Wächter mit je eigener Entität (auch in `done.entityId`), gleichem Board, gleicher Zuteilung und gleichem Namen; eine der Entitäten ist schon beobachtet → zwei angelegt, `skipped` enthält sie; ungültiger `base` (Board fehlt) → 400, keiner angelegt.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren: alle Konfigurationen erst bauen und prüfen (`parseWatcher`, `checkWatcherTargets`), dann in `store.transaction` anlegen, danach je Wächter `engine.onSaved`.
- [ ] **Step 4:** `pnpm -r test`, `pnpm lint` grün.
- [ ] **Step 5:** Commit „Wächter: mehrere Treffer gemeinsam einrichten (Server)“.

### Task 4: Web – Auswahl und Sammel-Formular (reine Logik)

**Files:**
- Create: `packages/web/src/lib/selection.ts`, `packages/web/src/lib/watcher-bulk.ts`
- Modify: `packages/web/src/lib/api/index.ts` (drei neue Aufrufe, Typen in `watcher-types.ts`)
- Test: `packages/web/test/selection.test.ts`, `packages/web/test/watcher-bulk.test.ts`

**Interfaces:**
- `selection.ts`:
  ```ts
  export type Selection = ReadonlySet<string>;
  export const toggle: (s: Selection, id: string) => Selection;
  export const selectAll: (s: Selection, ids: string[]) => Selection;   // fügt hinzu
  export const clearAll: () => Selection;
  export const allSelected: (s: Selection, ids: string[]) => boolean;
  export const prune: (s: Selection, existing: string[]) => Selection;   // veraltete IDs raus
  ```
- `watcher-bulk.ts`:
  ```ts
  export type BulkField = 'active' | 'category' | 'assign' | 'board' | 'due' | 'priority' | 'nudge' | 'cooldown' | 'dedupe' | 'fairness' | 'threshold' | 'forMin' | 'count' | 'lead' | 'forecastHours' | 'doneValue';
  /** Welche Felder passen für alle (Auslöser-Felder nur bei gleicher Familie/Einheit) */
  export function bulkFields(items: WatcherItem[]): BulkField[];
  /** Gemeinsamer Wert je Feld oder MIXED */
  export const MIXED: unique symbol;
  export function commonValues(items: WatcherItem[]): Partial<Record<BulkField, unknown | typeof MIXED>>;
  /** Aus den angefassten Feldern (touched) und dem Formular den Patch für /api/watchers/bulk bauen */
  export function toBulkPatch(form: WatcherForm, touched: ReadonlySet<BulkField>): BulkPatch;
  /** Gemeinsames Einrichten: die angehakten Geräte für /api/watchers/bulk-create, in der Reihenfolge der Treffer, ohne Doppelte */
  export function devicesOf(hits: Hit[]): { entityId: string }[];
  ```
- API: `api.bulkUpdateWatchers(ids, patch)`, `api.bulkDeleteWatchers(ids)`, `api.bulkCreateWatchers(base, devices)`, `api.hideSuggestions(hits)`.

- [ ] **Step 1:** Failing Tests: `bulkFields` für zwei below-`%`-Wächter enthält `'threshold'`; für below + calendar nicht, aber `'assign'`; `commonValues` liefert `MIXED` für unterschiedliche Boards und den Wert bei gleichen; `toBulkPatch` mit `touched = {'assign'}` enthält nur `assign`; `prune` entfernt gelöschte IDs; `devicesOf` entfernt doppelte Entitäten und behält die Reihenfolge.
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren. **Step 4:** `pnpm -r test`, `pnpm lint` grün.
- [ ] **Step 5:** Commit „Wächter: Auswahl und Sammel-Formular (Logik)“.

### Task 5: Web – Mehrfachauswahl in der Wächterliste

**Files:**
- Create: `packages/web/src/components/SelectionBar.svelte` (Leiste unten: „{n} ausgewählt“ + Knöpfe über Props, wiederverwendet in Task 6), `packages/web/src/components/WatcherBulkSheet.svelte` (Sammel-Formular)
- Modify: `packages/web/src/components/WatchersView.svelte`, `WatcherTableRow.svelte`, `WatcherRow.svelte` (Kästchen, wenn `selecting`), Navigation für das neue Sheet (`ui.sheet = { type: 'watcher-bulk', ids }` in `store/navigation.ts` + Sheet-Router)
- Test: `packages/web/test/watcher-bulk-ui.test.ts` (Stil wie `watchers-list-ui.test.ts`), E2E `e2e/49-waechter-mehrfach.spec.ts`

**Verhalten:**
- Knopf „Auswählen“ im Kopf der Liste (nur mit Recht `watchers`); dann Kästchen je Zeile, „Alle auswählen“ je Kategorie-Gruppe, Leiste „{n} ausgewählt · Bearbeiten · Pausieren/Fortsetzen · Löschen · Fertig“. Pausieren, wenn mindestens einer aktiv ist, sonst Fortsetzen.
- Sammel-Formular: Felder aus `bulkFields`; „verschieden“ als Platzhalter bei `MIXED`; ein Feld zählt als angefasst, sobald es geändert wurde; Hinweis „Schwelle nur bei Wächtern mit gleichem Auslöser“, wenn Auslöser-Felder fehlen; Knopf „Für alle übernehmen“ ist aus, solange nichts angefasst ist. Felder und Controls der Einzelbearbeitung wiederverwenden (`WatcherFineEditor`, `DeskField`, `SelectField` usw.), nicht nachbauen.
- Nach Erfolg: Toast „{n} Wächter geändert“, Liste neu laden, Auswahl bleibt bis „Fertig“. Bei 404: Liste neu laden, `prune`, Toast mit Server-Meldung.
- Löschen: Rückfrage „{n} Wächter löschen?“ mit Hinweis „Das lässt sich nicht rückgängig machen.“

- [ ] **Step 1:** Failing UI-Test: Auswählen → zwei Kästchen anhaken → Leiste zeigt „2 ausgewählt“; Bearbeiten öffnet Formular, Board-Feld zeigt „verschieden“.
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren. **Step 4:** Vitest grün.
- [ ] **Step 5:** E2E: zwei Batterie-Wächter (Mock-HA in `e2e/mock-ha.mjs`), Auswahl, Zuteilung auf eine Person setzen, beide Zeilen zeigen die Person; danach beide pausieren; danach beide löschen mit Rückfrage. Desktop- und Handy-Breite.
- [ ] **Step 6:** `pnpm -r test`, `pnpm lint`, `pnpm e2e -g "mehrfach"` grün.
- [ ] **Step 7:** Commit „Wächter: mehrere auswählen, bearbeiten, pausieren, löschen“.

### Task 6: Web – „Gefunden“: mehrere einrichten und ausblenden

**Files:**
- Modify: `packages/web/src/components/FoundHits.svelte`, `FoundList.svelte`, `FoundSheet.svelte`, `packages/web/src/lib/store/state.svelte.ts` (`NewWatcherRequest.hits?: Hit[]`), `packages/web/src/lib/watcher-editor.svelte.ts`, `packages/web/src/components/WatcherWizard.svelte` (Schritt 1)
- Test: `packages/web/test/found-hits-ui.test.ts`, `packages/web/test/watcher-wizard-ui.test.ts` (erweitern), E2E `e2e/27-gefunden-waechter.spec.ts` (erweitern)

**Verhalten:**
- „Auswählen“ über der Liste; Kästchen je Treffer; im Gruppenkopf „Alle auswählen“. Auswahl nur innerhalb einer Gruppe UND einer Fassung (`variant`): Kästchen anderer Gruppen/Fassungen sind dann aus, mit Hinweis „Nur Treffer einer Art lassen sich zusammen einrichten“.
- `SelectionBar`: „{n} ausgewählt · Einrichten · Ausblenden · Fertig“. Ausblenden → `api.hideSuggestions`, Toast „{n} Treffer ausgeblendet“.
- Einrichten → `openNewWatcher({ template, from: 'found', hits })`. `WatcherEditor` hält `devices = $state<Hit[]>([])`; mit `hits` wird die Vorlage mit dem ersten Treffer angewendet (`applyTemplate`), `devices` gefüllt.
- Schritt 1 des Assistenten zeigt bei `devices.length > 1` statt der Entitätswahl die Liste „{n} Geräte ({Vorlage})“ mit Kästchen (abwählbar, mindestens eines bleibt), Name und aktuellem Wert (`reason`), darunter die Auslöser-Felder wie bisher. Probelauf nutzt das erste angehakte Gerät.
- Speichern bei mehreren Geräten: `api.bulkCreateWatchers(toInput(form), devicesOf(selected))`; Knopf „{n} Wächter anlegen“; Toast „{n} Wächter angelegt“, bei `skipped` zusätzlich „{k} gab es schon“.

- [ ] **Step 1:** Failing Tests: Gruppe mit 3 Batterie-Treffern, „Alle auswählen“ → Leiste „3 ausgewählt“; Kästchen der Waschmaschinen-Gruppe dann deaktiviert; Assistent mit 3 `hits` zeigt in Schritt 1 drei Geräte und den Knopf „3 Wächter anlegen“ im letzten Schritt.
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren. **Step 4:** Vitest grün.
- [ ] **Step 5:** E2E: drei Batterien im Mock-HA, alle auswählen, einrichten, Zuteilung wählen, anlegen → drei Wächter in der Liste; zweiter Durchlauf: zwei Treffer ausblenden → stehen unter „Ausgeblendet“.
- [ ] **Step 6:** `pnpm -r test`, `pnpm lint`, `pnpm e2e -g "gefunden"` grün.
- [ ] **Step 7:** Commit „Gefunden: mehrere Treffer gemeinsam einrichten oder ausblenden“.

### Task 7: Neue Geräte-Vorlagen (A)

**Files:**
- Modify: `packages/server/src/watcher-templates.ts` (`TemplateId`, `watcherTemplates()`, `detectSuggestions`), `packages/server/src/watcher-categories.ts` (`categoryOfTemplate`), `packages/server/src/i18n/en.ts`, `packages/web/src/lib/foundGroups.ts` (`ICONS`), ggf. `packages/server/src/watcher-icons.ts`
- Test: `packages/server/test/watcher-templates.test.ts` (erweitern), `e2e/mock-ha.mjs` (ein paar Beispiel-Entitäten)

**Vorlagen** (Id → Erkennung → Entwurf; Kategorie in Klammern). `done` nur wo angegeben.

| Id | Erkennung | Auslöser | Karte | done | Kategorie |
|---|---|---|---|---|---|
| `window_open` | `binary_sensor`, device_class window/door/opening/garage_door, nicht Kühl-/Gefrierwörter | state `on`, 30 Min | Fenster schließen | state `off` | security |
| `fridge_open` | `binary_sensor` door + `/k[üu]hlschrank\|gefrier\|fridge\|freezer/` | state `on`, 5 Min | Tür zumachen | state `off` | appliances |
| `leak` | `binary_sensor` moisture | state `on`, 0 | Leck prüfen und aufwischen | – | security |
| `plant` | `sensor` moisture (nicht humidity) oder Wörter `pflanze\|plant\|boden`; Domäne `plant` → state `problem` | below 20, 60 Min | Pflanze gießen | above 40 | other |
| `humid` | `sensor` humidity | above 65, 30 Min | Lüften | below 55 | climate |
| `co2` | `sensor` carbon_dioxide | above 1200, 10 Min | Lüften | below 800 | climate |
| `dehumidifier` | `binary_sensor`/`sensor` mit `/tank\|wassertank/` und `/entfeucht\|dehumid/` | state `on` bzw. `full` | Tank leeren | Gegenzustand | appliances |
| `robot_error` | `vacuum.*` oder `lawn_mower.*` | state `error`, 0 | Roboter befreien | state `docked` | appliances |
| `filter_life` | `sensor` mit `/filter/` und Einheit `%` | below 10 | Filter wechseln | above 50 | appliances |
| `toner` | `sensor` mit `/toner\|ink\|tinte\|cartridge/`, Einheit `%` | below 15 | Toner bestellen | above 50 | other |
| `level` | `sensor` mit `/pellet\|heiz[öo]l\|zisterne\|cistern\|futter\|food\|fill/` und Einheit `%` | below 20 | Nachbestellen | above 50 | energy |
| `refill` | `binary_sensor`/`sensor` mit `/salz\|salt\|klarsp[üu]l\|rinse_aid\|wassertank\|water_tank\|trester\|grounds/` | state `on` | Nachfüllen oder leeren | state `off` | appliances |
| `litter` | Wörter `/katzenklo\|litter/` + `/voll\|full\|drawer\|level/` | state `on` bzw. above 80 | Katzenklo leeren | Gegenzustand | other |
| `ev_plug` | `sensor` battery mit `/auto\|car\|ev\b\|fahrzeug/` (nicht `phone`) | below 30, 0 | Auto einstecken | above 35 | energy |
| `mail` | `binary_sensor` mit `/briefkasten\|mailbox\|post/` | state `on` | Post holen | – | other |
| `garage_lock` | `cover` device_class garage (state `open`) oder `lock.*` (state `unlocked`) | 30 Min | Garage schließen / Tür abschließen | Gegenzustand | security |
| `freezer_warm` | `sensor` temperature mit `/gefrier\|freezer\|tiefk[üu]hl/` | above −15, 30 Min | Gefriertruhe prüfen | – | appliances |
| `unavailable` | jede Entität mit device_class battery/power/door/window im Zustand `unavailable` | state `unavailable`, 60 Min | Gerät prüfen | – (der Gegenzustand ist kein fester Wert) | other |
| `update` | `update.*` | state `on` | Update einspielen | state `off` | other |

Regeln: Entitäten, die schon ein bestehender Treffer belegt (z. B. Batterie), bekommen keinen zweiten aus `unavailable`. Reihenfolge der Gruppen = Reihenfolge in `watcherTemplates()`; neue hinter den bestehenden. `canSelfComplete` = `done !== null`; `whyNoSelfComplete` als kurzer Satz bei den anderen. Texte mit `t()` + en.

- [ ] **Step 1:** Failing Tests je Vorlage: ein passender HA-Zustand ergibt genau einen Treffer mit der Id; ein Gegenbeispiel (z. B. Kühlschranktür ist NICHT `window_open`, Handy-Akku ist NICHT `ev_plug`, Luftfeuchte ist NICHT `plant`) ergibt keinen.
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren (Detection-Blöcke wie die bestehenden, Hilfen `hay`, `num`, `unitOf` wiederverwenden). **Step 4:** grün.
- [ ] **Step 5:** `mock-ha.mjs`: je eine Beispiel-Entität für `window_open`, `humid`, `filter_life`; bestehende E2E dürfen nicht brechen (`pnpm e2e -g "gefunden"`).
- [ ] **Step 6:** `pnpm -r test`, `pnpm lint` grün. **Step 7:** Commit „Gefunden: 19 neue Vorlagen für Geräte“.

### Task 8: Neue wiederkehrende Vorlagen (C) und CHANGELOG

**Files:**
- Modify: `packages/server/src/watcher-templates.ts` (`recurring(...)`-Einträge), `packages/server/src/i18n/en.ts`, `stups-beta/CHANGELOG.md` (+ `.de.md`, falls vorhanden; Stil der bisherigen Einträge), `stups-beta/DOCS.de.md`/`DOCS.md` falls sie die Vorlagen auflisten
- Test: `packages/server/test/watcher-templates.test.ts`

**Vorlagen** (Recurrence aus `packages/server/src/recurrence.ts`):
`fridge_clean` monatlich alle 3 · `oven_clean` monatlich alle 3 · `windows` monatlich alle 6 · `radiators` jährlich (Hinweis: „im Herbst, beim ersten Mal das Datum auf Oktober setzen“) · `tyres` monatlich alle 6 (Hinweis Okt./Apr.) · `gutter` jährlich · `washer_hygiene` monatlich alle 1 · `shower_head` monatlich alle 3 · `drains` monatlich alle 2 · `first_aid` jährlich · `extinguisher` jährlich alle 2 · `mattress` monatlich alle 3 · `fertilize` wöchentlich alle 4.

- [ ] **Step 1:** Failing Test: `watcherTemplates()` enthält diese Ids mit `kind: 'recurring'` und der genannten Recurrence; jede hat einen nicht-leeren Hinweis auf Englisch (`withLanguage('en', ...)`).
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren. **Step 4:** grün.
- [ ] **Step 5:** CHANGELOG-Eintrag (Version nach dem Schema der letzten Einträge, nächste beta-Nummer) mit: mehrere Wächter bearbeiten/pausieren/löschen, mehrere Treffer einrichten/ausblenden, neue Vorlagen.
- [ ] **Step 6:** `pnpm -r test`, `pnpm lint`, `pnpm e2e` (ganz) grün.
- [ ] **Step 7:** Commit „Vorlagen: 13 neue wiederkehrende Karten, CHANGELOG“.
