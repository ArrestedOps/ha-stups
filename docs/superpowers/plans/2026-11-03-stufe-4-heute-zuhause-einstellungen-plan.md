# Stufe 4: Heute, Zuhause, Wächter aus Vorlagen, neue Einstellungen – Umsetzungsplan

> **Für ausführende Agenten:** Benötigter Unter-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`).

**Ziel:** Stups startet mit „Heute" (was ist für mich dran, was kam vom Haus), zeigt unter „Zuhause" den Zustand der Wächter, legt Wächter aus gefundenen Vorlagen mit Probelauf an und hat gegliederte Einstellungen mit Unterseiten. Beta **1.18.0-beta.1**.

**Architektur:** Server: neue Teile `avatars.ts`, `home.ts` (reine Phasenberechnung aus Wächter-Zustand), `watcher-templates.ts` (Vorlagen + Erkennung), `dry-run.ts` (Probelauf über HA-Historie), Routen in `api/people-avatar.ts`, `api/today.ts`, `api/home.ts`; Wächter-Auslöser `calendar_event` und `forecast` in `watcher-types.ts`/`watchers.ts`. Migration 20 (`avatar_source`, `avatar_rev`, `busy_until`). Oberfläche: gemeinsame `TopBar.svelte`, neue Reiter-Ansichten (`TodayView`, `HomeView`), Einstellungen als Stapel von Unterseiten `components/settings/*.svelte`, ausgewählt über die reine Funktion `lib/settingsPages.ts` (testbar nach Rolle und Betriebsart).

**Technik:** TypeScript, Fastify, `node:sqlite`, Svelte 5, Vitest (feste Uhr), Playwright (WebKit, iPhone).

**Spec:** `docs/superpowers/specs/2026-11-03-stufe-4-heute-zuhause-einstellungen-design.md`

## Globale Vorgaben

- Testgetrieben: erst der fehlschlagende Test, dann die Umsetzung. Zeitregeln immer mit fester Uhr (`deps.now`), Browser-Tests nie von der Tageszeit abhängig.
- Leiste: **Heute · Boards · Kalender · Zuhause**; Start ist Heute; gemerkte Werte `agenda` → `today`, `watchers` → `home`. Kind und Docker ohne HA: ohne Zuhause (drei Reiter).
- **Gemeinsame Kopfzeile** `TopBar.svelte` auf allen vier Reitern: links „‹ Dashboard" (nur `feat.haUi`), rechts Offline-Hinweis und Avatar-Knopf (36 px, Trefferfläche 44 px). Unter Einstellungen › Home Assistant › „Dashboard und Kopfzeile" bleiben: Ziel-Dashboard wählen, HA-Kopfzeile ausblenden, Bubble-Card-YAML. **Nichts aus dem heutigen `SettingsSheet.svelte` darf verloren gehen** (Tabelle „Verbleib" unten, abgesichert durch Test und Browser-Test).
- Farben: Akzent für Menschen und Aktionen, **Türkis** (`--house`, `--house-bg`, `--house-line`, hell und dunkel) für alles Vom-Haus; die Akzent-Auswahl bietet kein Türkis/Grün mehr. Überschriftenschrift Bricolage Grotesque (OFL) lokal als woff2, kein CDN. Kein Emoji in der Oberfläche, keine Illustrationen, keine Kennzahl-Kacheln, kein farbiger Balken links an Karten auf Heute.
- Fairness bleibt ohne Rangliste, Prozente, Punkte, Score.
- Weitergeben: nächste Person der Rotation des Wächters (gleicher Kreis, gleiche Anwesenheitsregel, ohne „wenig Zeit"), Rotation rückt nicht weiter, zählt nicht als erledigt; niemand da → Karte bleibt, Meldung „Gerade ist niemand sonst dran". Erst vorschlagen: Push „Wer übernimmt?" an alle Anwesenden, erste Person gewinnt, nach **30 Minuten** Rückfall des Wächters; niemand zu Hause → sofort Rückfall. Probelauf: höchstens **7 Tage** und **20 000 Zustände**. Vorhersage-Abfrage und Kalender-Abfrage alle **30 Minuten**. Personenbild: JPEG/PNG/WebP, höchstens **2 MB**.
- Alle neuen Texte Deutsch und Englisch (Kataloge `packages/web/src/lib/i18n/en.ts`, `packages/server/src/i18n/en.ts`, Abdeckungstests). Deutscher Text ist der Schlüssel.
- Neue Routen sind für Kinder verboten, bis sie in `child-guard.ts` freigegeben werden. Freigegeben wird nur: `GET /api/today`, `GET /api/people/:id/avatar`. Weitergeben/Übernehmen bleiben Kindern verwehrt (Entscheidung: Kinder erledigen, Erwachsene verteilen).
- Store aus Teilen; Form-Fixtures mit `UPDATE_SHAPE=1` neu erzeugen; `api-routes.json` ebenso. Migration 20 mit Sicherung davor (macht `openDb`).
- Desktop-Fassung ist nicht Teil dieser Stufe. Stabil (`main`) wird nicht angefasst.
- Commits: deutsch, „Stufe 4, Aufgabe N: …", Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Abweichungen vom Entwurf (bewusst, im Bericht erwähnen)

- **Bild aus Home Assistant wird nicht server-seitig verkleinert**, denn der Server hat keine Bildbibliothek und eine native Abhängigkeit (sharp) wäre ein Risiko für die Architekturen des Add-ons. Es wird unverändert abgelegt (höchstens 2 MB, Typ per Magic-Bytes geprüft) unter `<dataDir>/avatars/<userId>.img` und vom Browser per CSS auf 36 px skaliert; hochgeladene Bilder verkleinert wie geplant der Browser (`prepareUpload`, 256 px, WebP).
- Schrift: über das npm-Paket `@fontsource-variable/bricolage-grotesque` (OFL, enthält woff2); Vite bündelt die Datei lokal ins Add-on.

## Verbleib: Was heute in `SettingsSheet.svelte` steht

| Heute | Neu (Seite unter `components/settings/`) |
|---|---|
| Beta-Einstellungen (`BetaSettings`) | `BetaPage` (Hilfe und Daten › Beta) |
| Sprache | `LookPage` (Sprache und Farbe) |
| Farbe (`AccentPicker`) | `LookPage` |
| Personen & Zugriff (Sheet `people`) | `PeoplePage` = Sheet `people` (Haushalt › Personen und Kinder) |
| Standard-Uhrzeit für Termine | `DatesPage` (Haushalt › Termine) |
| Konto: angemeldet als, Passwort, Abmelden | `AccountPage` (nur Docker) |
| Passkeys (`PasskeySettings`) | `AccountPage` |
| Zurück zum Dashboard (Auswahl, eigener Pfad) | `DashboardPage` (Home Assistant › Dashboard und Kopfzeile) |
| HA-Kopfzeile ausblenden | `DashboardPage` |
| Wächter-Eintrag mit Anzahl aktiv | `WatchersPage` (Haushalt › Wächter), enthält die heutige `WatchersView` |
| Benachrichtigungen: Test an mich, Stand anzeigen | `NotificationsPage` (Test) und `ReportPage` (Warum kommt nichts an?) |
| Dashboard-Button Bubble Card (YAML kopieren) | `DashboardPage` |
| Umzug (Daten exportieren nach /share) | `DataPage` (Hilfe und Daten › Papierkorb, Archiv, Umzug) |
| Fuß: Angemeldet als, Diagnose-Seite | Fuß der Übersicht |
| (Papierkorb, Archiv liegen heute im Board-Wechsler) | zusätzlich `DataPage`; der Board-Wechsler behält seine Einträge |

Aus `PeopleSheet.svelte` ziehen um: Ruhezeit und Sonntagsrückblick der **eigenen** Person → `NotificationsPage`; Sprachdienst (Ansage) → `HouseVoicePage` (Home Assistant › Ansage und Lampe). Haus-Kanäle je Person bleiben im Personen-Fenster.

## Review Focus

- Personenbild: falscher Typ (SVG, GIF, HTML mit Endung .png), über 2 MB, fremde Person ohne Administratorrecht → 400/403, nie ein 500; kein Bild → 404 ohne Absturz der Oberfläche (Initiale bleibt).
- Home Assistant nicht erreichbar: `/api/home`, `/api/watchers/suggestions`, Probelauf und Bildabruf antworten mit klarem Zustand („keine Verbindung"), nie 500 und nie leere weiße Seite.
- Zeitgrenzen von „Heute": Karten um 23:59 und 00:00 in der Zeitzone des Haushalts (nicht des Servers), überfällig vs. heute vs. morgen.
- Rennen und Wiederholung: zweimal „Übernehmen"/„Weitergeben" fast gleichzeitig (zweites bekommt 409 mit Klartext), Weitergeben einer nicht mir zugewiesenen Karte (403), Weitergeben von Karten ohne Wächter (409).
- Alte Zustände: gemerkter Reiter `agenda`/`watchers`, gemerkter Kalendermodus ohne `list`, Wächter mit alter Zuweisungsart, Kind auf Docker, Datenbank ohne Avatar-Ordner.

---

## Stufe 1: Farben, Schrift, Kopfzeile, Personenbilder, Leiste, Heute, Kalender-Liste

### Aufgabe 1: Türkis-Stimme, Schrift, Akzent ohne Türkis

**Files:** Modify `packages/web/src/app.css`, `packages/web/src/lib/accent.ts`, `packages/web/package.json`, `packages/web/src/main.ts`; Test `packages/web/test/accent.test.ts`.

**Interfaces:** Produces CSS-Variablen `--house`, `--house-bg`, `--house-line` (hell/dunkel), Klasse `.font-display` (Überschriften), Hilfsklassen `text-house`, `bg-house-bg`, `border-house-line` (Tailwind-Theme in `app.css`).

- [ ] Test: `accent.test.ts` ergänzen: keine der wählbaren Farbtöne (`ACCENT_HUES` o. ä., im Code nachsehen) liegt im Bereich 150–200 (Grün/Türkis); `applyAccent(null, …)` bleibt Orange.
- [ ] Rot sehen. Dann die Auswahl in `accent.ts` ohne Türkis/Grün, bestehende gespeicherte Töne in diesem Bereich fallen auf Orange zurück (`hueFromStorage`).
- [ ] `pnpm --filter @stups/web add @fontsource-variable/bricolage-grotesque`, in `main.ts` importieren, `.font-display` setzen, auf `h1` der Reiter anwenden (später in den Ansichten).
- [ ] `app.css`: Türkis-Tokens, hell und dunkel, Kontrast ≥ 4,5:1 für Text auf `--house-bg`.
- [ ] `pnpm --filter @stups/web test`, `pnpm lint`, `pnpm build` grün; Commit „Stufe 4, Aufgabe 1: …".

### Aufgabe 2: Migration 20 und Felder für Bild und „wenig Zeit"

**Files:** Modify `packages/server/src/migrations.ts`, `store/types.ts`, `store/people.ts`, `packages/web/src/lib/api.ts` (Typ `User`); Test `packages/server/test/db.test.ts` oder `people.test.ts`, Fixtures.

**Interfaces:** Produces `User.avatarRev: number | null`, `User.busyUntil: string | null` (Datum `YYYY-MM-DD`, gilt bis Ende dieses Tags in der Haushaltszeitzone); `store.setAvatar(userId, source: 'ha' | 'upload'): number` (erhöht `avatar_rev`, gibt neuen Stand zurück), `store.clearAvatar(userId)`, `store.avatarSource(userId): 'ha' | 'upload' | null`.

- [ ] Test: frische Datenbank hat Version 20; Migration von Version 19 mit vorhandenen Personen lässt `avatarRev === null`, `busyUntil === null`; `setAvatar` zählt `avatarRev` hoch; `clearAvatar` setzt null.
- [ ] Migration 20: `users.avatar_source text check in ('ha','upload')`, `users.avatar_rev integer not null default 0`, `users.busy_until text`. `toUser`: `avatarRev = avatar_source ? avatar_rev : null`.
- [ ] `UPDATE_SHAPE=1 pnpm --filter @stups/server test` für die Fixtures, Diff prüfen (nur die neuen Felder/Methoden).
- [ ] Commit.

### Aufgabe 3: Personenbilder im Server (Ablage, Routen, HA, Export)

**Files:** Create `packages/server/src/avatars.ts`, `packages/server/src/api/people-avatar.ts`; Modify `api.ts` (registrieren), `api/child-guard.ts` (nur `GET /api/people/:id/avatar`), `main.ts` (Verdrahtung), `ha.ts` (`getEntityPicture(path): Promise<Buffer | null>`), `transfer.ts` (Ordner `avatars` in Export und Import), `house`-unabhängig; Tests `packages/server/test/avatars.test.ts`, `avatar-api.test.ts`, `child-guard.test.ts` (Routenliste), `transfer.test.ts`.

**Interfaces:**
- `createAvatars({ dir: string, store: Store, ha?: { fetchPicture(path: string): Promise<Buffer | null> } }): { read(userId): Buffer | null; save(userId, bytes: Buffer, source: 'upload'): number; remove(userId): void; syncFromHa(personStates: HaState[]): Promise<void>; contentType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null }`.
- Routen: `GET /api/people/:id/avatar?rev=` (Cache-Control `public, max-age=31536000, immutable` wenn `rev` gesetzt, 404 ohne Bild), `PUT /api/people/:id/avatar` (Rumpf = Bytes, `content-type` image/*; eigene Person oder Administrator), `DELETE /api/people/:id/avatar` (eigene Person oder Administrator; fällt auf HA-Bild zurück, falls vorhanden, sonst Initiale).

- [ ] Tests (Fake-HA `test/helpers/fake-ha.ts`): HA-Bild wird beim Start und bei Änderung von `entity_picture` geholt; Upload hat Vorrang vor HA (`syncFromHa` überschreibt `upload` nie); Entfernen kehrt zum HA-Bild zurück; falscher Typ (SVG, HTML als .png) → 400; > 2 MB → 413/400; fremde Person als Mitglied → 403; Administrator darf; Kind darf eigenes Bild nicht ändern (Guard), darf `GET` (Initiale/Bild bleibt sichtbar); fehlt HA → Upload geht trotzdem.
- [ ] Umsetzen. Typ nur über Magic-Bytes (JPEG `FF D8 FF`, PNG, WebP `RIFF…WEBP`). Datei `<dir>/avatars/<userId>.img`, Schreiben über temporäre Datei + Umbenennen. `syncFromHa`: für jede `person.*` mit `entity_picture` und zugeordnetem Benutzer (Zuordnung wie `presence.ts`/`personOfEntity`), Bild über Supervisor/HA-Verbindung holen, nur wenn Quelle ≠ `upload` und `avatar_rev`-Änderung (Hash der `entity_picture`-URL in `avatar_source`-Begleitspalte vermeiden: vergleiche gespeicherten Inhalt per Länge+Hash im Speicher, Abgleich beim Start und bei `person.*`-Zustandswechsel).
- [ ] `transfer.ts`: Ordner im Export nach `/share` und beim Import; Test mit Beispielbild.
- [ ] `child-guard.test.ts` und `api-routes.json` (`UPDATE_SHAPE=1`) aktualisieren.
- [ ] Commit.

### Aufgabe 4: `Avatar.svelte` zeigt Bilder; Hochladen im Browser

**Files:** Modify `packages/web/src/components/Avatar.svelte`, `lib/api.ts` (`avatarUrl(person)`, `api.uploadAvatar(id, blob)`, `api.removeAvatar(id)`), `lib/image.ts` (falls Quadrat-Ausschnitt 256 px nötig); Test `packages/web/test/avatar.test.ts`.

**Interfaces:** Produces `avatarUrl(p: Pick<User, 'id' | 'avatarRev'>): string | null` (`/api/people/:id/avatar?rev=N`, relativ zur Ingress-Basis wie die übrigen Aufrufe), Avatar-Komponente mit `size` und Rückfall auf Initiale bei Ladefehler (`onerror`).

- [ ] Test: `avatarUrl` null ohne `avatarRev`, sonst URL mit `rev`; `prepareAvatar(file)` liefert Quadrat 256 × 256 WebP (wie `prepareUpload` getestet).
- [ ] Umsetzen; Avatar rund bleibt bei bisherigem Eckenradius (Stil beibehalten).
- [ ] Commit.

### Aufgabe 5: Kopfzeile, Reiter, Leiste

**Files:** Create `packages/web/src/components/TopBar.svelte`, `packages/web/src/lib/tabs.ts`; Modify `App.svelte`, `TabBar.svelte`, `lib/store.svelte.ts` (`Tab`, `TABS`, `selectTab`, Erststart), delete `SettingsButton.svelte`; Modify `AgendaView.svelte`, `CalendarView.svelte`, `WatchersView.svelte` (statt `SettingsButton` die `TopBar`); Tests `packages/web/test/tabs.test.ts`; e2e `11-reiter.spec.ts`, `9-embed.spec.ts` u. a. anpassen.

**Interfaces:** `Tab = 'today' | 'boards' | 'calendar' | 'home'`; `migrateTab(raw: string | null): Tab` (`agenda`→`today`, `watchers`→`home`, unbekannt/leer→`today`); `visibleTabs(ctx: { standalone: boolean; watchers: boolean; isChild: boolean }): Tab[]`; `TopBar` ohne Eigenschaften, liest Store; Avatar-Knopf `aria-label` „Einstellungen öffnen" (heutiger Text, damit Tests stabil bleiben) öffnet `openSheet({ type: 'settings' })`.

- [ ] Tests: `migrateTab` alle Fälle; `visibleTabs`: Admin im Add-on → vier; Kind → ohne `home`; Docker ohne HA → ohne `home`; Docker mit `caps.watchers` → mit `home`.
- [ ] Umsetzen. Leiste: Heute (`list`/Haken-Icon), Boards, Kalender, Zuhause (`home`/Haus-Icon; im `Icon.svelte` ergänzen, falls fehlt; Auge bleibt für Wächter-Verwaltung). `TopBar`: links `‹ Dashboard` (`feat.haUi`, `goToDashboard`), rechts Offline-Hinweis, Avatar-Knopf mit Bild/Initiale. Die Kopfzeile von Boards (App.svelte Zeilen ~106–126) wird durch `TopBar` ersetzt; Reiter-Überschrift bleibt je Ansicht. Reiter `home` zeigt in dieser Aufgabe noch `WatchersView` (damit lauffähig), `today` zeigt vorläufig `AgendaView`.
- [ ] Test (Komponente nicht möglich → Playwright): in Aufgabe 8 abgedeckt; hier e2e `11-reiter` an neue Namen anpassen.
- [ ] Commit.

### Aufgabe 6: `GET /api/today` (Server)

**Files:** Create `packages/server/src/store/today.ts`, `packages/server/src/api/today.ts`; Modify `store.ts`/`internals.ts` (Teil einhängen), `api.ts`, `child-guard.ts`; Tests `packages/server/test/today.test.ts`, `today-api.test.ts`.

**Interfaces:**
```ts
interface TodayCard { id; title; boardId; boardName; dueAt: string | null; assigneeIds: string[]; watcherId: string | null; watcherName: string | null; createdAt: string; why: string | null }
interface Today { house: TodayCard[]; mine: TodayCard[]; others: { personId: string; open: number }[] }
store.today(userId: string, nowMs: number, tz: string): Today
```
`house`: offene Karten mit `watcher_id`, mir zugewiesen oder niemandem; `mine`: meine offenen Karten ohne `watcher_id`-Karten aus `house`, überfällig/heute (bis Ende heute) zuerst, dann bis Ende morgen, sortiert nach `dueAt`; Karten ohne Termin fehlen; `others`: Zahl offener Karten je andere Person (Ersteller nicht Kind-gefiltert), Kind bekommt `others: []` und nur eigene Karten.

- [ ] Tests mit fester Uhr und Zeitzone `Europe/Berlin` (23:59 vs. 00:00, Sommerzeitwechsel-Tag, Karte ohne Termin, erledigt/gelöscht/archiviert weg, Wächter-Karte für andere Person nicht in `house`, nicht zugewiesene Wächter-Karte in `house`, Kind-Sicht).
- [ ] Umsetzen; `why` wird in Aufgabe 14 gefüllt (hier null). Route `GET /api/today` (jeder, Kind erlaubt, Zeitzone aus `deps`).
- [ ] Form-Fixtures, Guard, Routenliste aktualisieren. Commit.

### Aufgabe 7: Ansicht „Heute", „Bei den anderen", Seite „Diese Woche" (vorläufig)

**Files:** Create `components/TodayView.svelte`, `components/WeekSheet.svelte`, `lib/today.ts`; Modify `App.svelte`, `store.svelte.ts` (Sheet `{ type: 'week' }`), `api.ts` (`api.today()`, Typen); Tests `packages/web/test/today.test.ts`; e2e neue Datei `e2e/24-heute.spec.ts`.

**Interfaces:** `api.today(): Promise<Today>`; `lib/today.ts`: `todaySentence(t: Today): string` („{mine} für dich · {house} vom Haus", Pluralformen, Leerzustand), `sourceLine(c: TodayCard): { text: string; house: boolean }` (Quelle Board oder Wächter, Wächter türkis).

- [ ] Tests für `todaySentence` (0/1/n, nur Haus, nur ich) und `sourceLine`.
- [ ] `TodayView`: `TopBar`, Titel „Heute" mit Datum, Satz, Plus-Knopf (öffnet `new`-Sheet wie in Boards), Abschnitte **Vom Haus** (türkis, Knopf **Erledigt** über `completeCard`), **Für dich**, **Bei den anderen** (Avatare mit Zahl, öffnet `WeekSheet`; fehlt für Kinder). Leerzustand: ein Satz, kein Bild. Neu laden bei `ui.rev`.
- [ ] `WeekSheet`: vorläufig der heutige `FairnessView` mit Titel „Diese Woche" (Kind kommt nicht hin; Aufgabe 16 erweitert).
- [ ] e2e: Karte für mich mit Termin heute erscheint unter „Für dich", Erledigen entfernt sie; Wächter-Karte erscheint unter „Vom Haus".
- [ ] Commit.

### Aufgabe 8: Kalender-Ansicht „Liste", Agenda ohne Fairness

**Files:** Modify `components/CalendarView.svelte`, `components/AgendaView.svelte` (Fairness-Umschalter, `agendaMode`, eigener Kopf raus; als Unterkomponente ohne `main`-Rahmen), `lib/store.svelte.ts` (Modus gemerkt in `localStorage`, `list` zulässig; Rückfall bei unbekanntem Wert), `lib/calendar.ts`; Tests `packages/web/test/calendar.test.ts`; e2e `16-agenda.spec.ts`, `22-fairness.spec.ts` anpassen.

**Interfaces:** `CalendarMode = 'day' | 'week' | 'month' | 'list'`; `parseCalendarMode(raw: string | null): CalendarMode` (Rückfall `week`/bisheriger Standard).

- [ ] Test `parseCalendarMode` (alt gespeicherte Werte, `list`, Unsinn).
- [ ] Umsetzen: vierter Knopf „Liste", Filter und „Erledigte einblenden" wie in der bisherigen Agenda; `AgendaView` ohne Überschrift/Fairness/Einstellungsknopf.
- [ ] e2e: Liste im Kalender zeigt Karte mit Termin; Fairness über Heute › Bei den anderen erreichbar; `22-fairness` entsprechend.
- [ ] `pnpm test`, `pnpm lint`, `pnpm -r typecheck`, `pnpm build`; Commit. **Ende Stufe 1** (Vorab-Lauf `pnpm e2e` im Hintergrund, Fehler beheben).

---

## Stufe 2: Einstellungen als Seite mit Unterseiten

### Aufgabe 9: Seitenauswahl nach Rolle und Betriebsart

**Files:** Create `packages/web/src/lib/settingsPages.ts`; Test `packages/web/test/settingsPages.test.ts`.

**Interfaces:**
```ts
type SettingsPageId = 'notifications' | 'look' | 'account' | 'people' | 'watchers' | 'templates' | 'dates' | 'dashboard' | 'voice' | 'report' | 'data' | 'beta';
interface SettingsCtx { isAdmin: boolean; isChild: boolean; standalone: boolean; beta: boolean; push: boolean; watchers: boolean; haUi: boolean; house: boolean; migration: boolean }
interface SettingsGroup { id: 'me' | 'household' | 'ha' | 'help'; title: string; pages: { id: SettingsPageId; title: string; icon: string }[] }
settingsGroups(ctx: SettingsCtx): SettingsGroup[]
```
- [ ] Tests (Spec 4.9): Admin im Add-on: alle vier Gruppen, `account` fehlt; Mitglied: kein `household`, kein `ha`; Kind: nur `look` (plus Abmelden, das keine Seite ist); Docker (Admin): `account` da, Gruppe `ha` fehlt, `watchers` nur mit `watchers`-Fähigkeit; `beta` nur mit `ctx.beta` und kein Kind; `notifications` nur mit `ctx.push` und kein Kind; `voice` nur mit `house`; `data` zeigt Umzug nur mit `migration` und Administrator.
- [ ] Umsetzen, Commit.

### Aufgabe 10: Übersicht, Kopf mit Avatar, einfache Unterseiten

**Files:** Create `components/settings/{SettingsHead,LookPage,DatesPage,DashboardPage,AccountPage,DataPage,BetaPage}.svelte`, `components/settings/SettingsStack.svelte`; Modify `components/SettingsSheet.svelte` (wird Übersicht, < 150 Zeilen), `store.svelte.ts` (Sheet `{ type: 'settings'; page?: SettingsPageId }`, `openSettings(page?)`), `App.svelte`, `Sheet.svelte` (Zurück-Knopf oben links für Unterseiten, falls nicht vorhanden); e2e `e2e/25-einstellungen.spec.ts`; bestehende e2e (`19-farbe`, `13-standalone-ha`, `14-beta`, `18-english`, `21-vorlagen` …) anpassen.

**Interfaces:** `openSettings(page?: SettingsPageId)`; jede Seite ist eigenständig (`<Sheet title onclose={back}>`).

- [ ] Kopf: Avatar (groß), Name, Herkunft „Bild aus Home Assistant" / „Eigenes Bild", Knopf **Bild ändern** (Datei wählen → `prepareAvatar` → `api.uploadAvatar`) und **Bild entfernen**; Docker ohne HA: nur Hochladen.
- [ ] Seiten übernehmen den Code 1:1 aus `SettingsSheet.svelte` (siehe Tabelle „Verbleib"); `DataPage` zusätzlich Zeilen „Papierkorb" und „Archiv" (öffnen die vorhandenen Sheets), `DashboardPage` enthält Auswahl, eigenen Pfad, HA-Kopfzeile ausblenden, Bubble-Card-YAML mit Kopieren.
- [ ] e2e `25-einstellungen`: Admin sieht vier Gruppen, öffnet jede Seite, Prüfliste der Texte aus der Tabelle „Verbleib" (u. a. „Zurück zum Dashboard"-Auswahl, „HA-Kopfzeile ausblenden", YAML, „Nach /share"); Bild hochladen zeigt Bild im Avatar-Knopf; Mitglied sieht nur „Für mich" und „Hilfe"; Kind nur „Sprache und Farbe".
- [ ] Commit.

### Aufgabe 11: Benachrichtigungen und „Warum kommt nichts an?"

**Files:** Create `components/settings/{NotificationsPage,ReportPage}.svelte`, `components/settings/PushReport.svelte` (der Stand-Bericht aus `SettingsSheet`); Modify `components/PeopleSheet.svelte` (Ruhezeit und Sonntagsrückblick der eigenen Person raus; für andere Personen bleiben sie sichtbar, weil Administratoren sie ändern dürfen); Tests: e2e `6-nudge`, `20-haus`, `22-fairness` anpassen, neu in `25-einstellungen`.

- [ ] `NotificationsPage`: Zustellstatus dieses Geräts (HA-Push oder ntfy, wie `feat` es hergibt), „An mich senden", Ruhezeit der eigenen Person, Sonntagabend-Rückblick der eigenen Person (beide über `PATCH /api/access/people/:id`), Hinweis „Etwas kommt nicht an? Prüfen" → `ReportPage`. `ReportPage` für Administratoren mit allen Personen (Server liefert das heute schon über `api.pushStatus()`).
- [ ] e2e: Test-Nachricht senden, Stand anzeigen, Ruhezeit ändern bleibt nach Neuladen.
- [ ] Commit.

### Aufgabe 12: Haushalt und Home Assistant: Personen, Wächter, Vorlagen, Ansage und Lampe

**Files:** Create `components/settings/{WatchersPage,TemplatesPage,HouseVoicePage}.svelte`; Modify `PeopleSheet.svelte` (Sprachdienst-Teil auslagern), `WatchersView.svelte` (als Verwaltungsliste ohne eigenen `main`/`TopBar`, Name bleibt, Verwendung in `WatchersPage`), `TemplateSettings.svelte` (in `TemplatesPage`), Einträge in `SettingsStack`; e2e `10-waechter`, `20-haus`, `21-vorlagen` anpassen.

- [ ] Umziehen, nichts neu erfinden. `HouseVoicePage`: Sprachdienst wählen/speichern (`api`-Aufrufe wie heute im Personen-Fenster, Administrator).
- [ ] Alte e2e-Pfade („Reiter Wächter öffnen") auf neue Wege (Einstellungen › Haushalt › Wächter).
- [ ] `pnpm test`, `lint`, `typecheck`, `build`; **`pnpm e2e` im Hintergrund**, Fehler beheben; Commit. **Ende Stufe 2.**

---

## Stufe 3: Zuhause mit `/api/home`

### Aufgabe 13: Phasen berechnen (Server)

**Files:** Create `packages/server/src/home.ts`; Modify `watchers.ts` (liefert `homeInput()`), `api/home.ts` (neu, sonst Konflikt mit `api/house.ts`: Name `api/home-state.ts`), `api.ts`, `main.ts` (falls nötig), `child-guard` bleibt verboten; Tests `packages/server/test/home.test.ts`, `home-api.test.ts`.

**Interfaces:**
```ts
type HomePhase = 'waiting' | 'running' | 'soon' | 'quiet';
interface HomeItem { watcherId: string; name: string; phase: HomePhase; since: string | null; progress: { n: number; of: number } | null; nextCard: string | null; entityMissing: boolean; openCard: { id: string; title: string; assigneeIds: string[]; createdAt: string } | null; nextEvent: { title: string; at: string } | null }
interface HomeState { available: boolean; connectedSince: string | null; lostSince: string | null; items: HomeItem[] }
phaseOf(input: { watcher: Watcher; seen: { state: string; lastChanged: string | null } | null; st: WatcherState; counter: number; openCard: Card | null; lastFireAt: string | null }): { phase: HomePhase; since: string | null }
watchers.homeState(): HomeState
```
Regeln (Spec 4.4): offene Wächter-Karte → `waiting`. Sonst `running`: `below`: Wert liegt über dem Schwellwert; `above`: darunter, aber zuletzt darüber gewesen (`lastChanged` nach `lastFireAt` und `metSince`/Merker – einfache Näherung: Entität war seit dem letzten Auslösen über der Schwelle, im Speicher `peak`-Merker je Wächter); `state`: nicht im Zielzustand und seit dem letzten Auslösen verändert. Sonst `soon`: `trigger.count > 1` mit Zähler > 0 (Fortschritt n von of) oder Kalender-Wächter mit nächstem Termin (Aufgabe 24). Sonst `quiet`. Fehlende Entität: `quiet` mit `entityMissing`.

- [ ] Tests: je Art (`below`, `above`, `state`) laufend/ruhig; Zähler 2 von 3 → `soon` mit `progress`; offene Karte → `waiting`; fehlende Entität → `quiet` + `entityMissing`; pausierte Wächter fehlen; HA getrennt → `available:false` mit `lostSince`.
- [ ] Umsetzen; Karte ist für Kinder verboten (Guard-Test); Routen-Fixture.
- [ ] Commit.

### Aufgabe 14: Ansicht „Zuhause"

**Files:** Create `components/HomeView.svelte`, `lib/home.ts`; Modify `App.svelte` (Reiter `home` zeigt `HomeView`), `api.ts` (`api.home()`); Tests `packages/web/test/home.test.ts`; e2e `e2e/26-zuhause.spec.ts`, `10-waechter` anpassen.

**Interfaces:** `homeSections(items: HomeItem[]): { waiting; running; soon; quiet }` (nur befüllte), `ageText(since: string, nowMs: number): string` („vor 4 Min.").

- [ ] Tests der Abschnittsbildung und `ageText`.
- [ ] Umsetzen: Abschnitte **Wartet auf jemanden** (zuständige Person, Alter, Knopf **Stupsen** → bestehendes `nudge`-Sheet), **Läuft gerade**, **Bald dran**, **Ruhig** (eine Zeile; Warnhinweis bei fehlender Entität), Verbindungsverlust „Keine Verbindung zu Home Assistant seit …", Platz für Hinweis „Gefunden" (Aufgabe 21). Türkis. Live-Sync über `ui.rev`.
- [ ] e2e mit `mock-ha`: Wächter, Entität „im Gang" → „Läuft gerade", Karte entsteht → „Wartet auf jemanden"; HA getrennt → Hinweis. `WatchersView` erscheint nur noch in den Einstellungen.
- [ ] Gesamtprüfung wie üblich, Commit. **Ende Stufe 3.**

---

## Stufe 4: Weitergeben, Erst vorschlagen, Wenig Zeit, Diese Woche

### Aufgabe 15: „Wenig Zeit" (`busy_until`)

**Files:** Modify `store/people.ts` (`setBusyUntil`, in `PATCH /api/access/people/:id` erlaubt für eigene Person und Administrator, Datum ≥ heute, höchstens 90 Tage), `api/access.ts`, `watchers.ts` (`decide` bekommt `busy: Set<string>`; Rotationen überspringen, `fixed`/`all_present`/Fallback `all` nicht, manuelle Zuweisung bleibt möglich), `components/settings/NotificationsPage.svelte` (Zeile „Wenig Zeit bis"), `PeopleSheet.svelte` (je Person für Administratoren); Tests `people.test.ts`, `watchers.test.ts`, `access-api.test.ts`, web `watchers.test.ts` unberührt.

**Interfaces:** `store.setBusyUntil(userId, date: string | null)`; `isBusy(user: User, nowMs: number, tz: string): boolean` in `store/people.ts` (exportiert über `store.ts`).

- [ ] Tests (feste Uhr): Rotation überspringt Person bis Datum inklusive Tag, danach wieder dran; alle sind „wenig Zeit" → Rotation gibt es trotzdem (kein Karte-Verlust) nach Rückfallregel; Mitglied ändert nur sich; Datum in Vergangenheit/Unsinn → 400.
- [ ] Umsetzen, Commit.

### Aufgabe 16: Weitergeben

**Files:** Modify `watchers.ts` (`pass(cardId, byUserId): Promise<{ to: string }>`, `nextAfter` ohne `lastPerson` anzufassen), `api/cards.ts` (neue Route `POST /api/cards/:id/pass`), `store/today.ts` (`why`), Tests `packages/server/test/pass.test.ts`, `pass-api.test.ts`, Guard/Fixture.

**Interfaces:** `engine.pass(cardId: string, byUserId: string): Promise<{ to: string } | { none: true }>`; Fehler: nicht dein (403 `ForbiddenError`), keine Wächter-Karte (409), erledigt (409). `why`: „reihum unter allen, die zu Hause sind" u. ä. nach `assign.mode`.

- [ ] Tests: Rotation (A→B, `lastPerson` bleibt), Anwesenheitsregel (nur wer zu Hause ist), „wenig Zeit" übersprungen, nur eine Person im Kreis → `none`, Kind ruft → 403 (Guard), zugewiesen an anderen → 403, Karte ohne Wächter → 409; Push an die neue Person (`onAssigned`); Verlauf-Eintrag (Lauf `passed`, `RunResult` erweitern, Text „Weitergegeben an {name}").
- [ ] Umsetzen, `RunResult` + `watcherActivity` ergänzen, Commit.

### Aufgabe 17: Erst vorschlagen (`suggest`)

**Files:** Modify `watcher-types.ts` (`AssignMode` + `MODES` + `suggest`), `watchers.ts` (`decide` → `{ ids: [], waiting: false, suggest: true }`; Push „Wer übernimmt?" an alle Anwesenden über `onSuggest`; `claim(cardId, userId)`; `checkSuggest(nowMs)` im Takt: nach 30 Min. Rückfall `rule.fallback`; niemand zu Hause → sofort Rückfall), `watcher-data.ts` (Tabelle oder Spalte für offene Vorschläge: `watcher_state`/neue Tabelle `watcher_suggest(card_id, watcher_id, since)` in Migration 20), `push.ts`/`push-action.ts`/`notifications.ts` (Aktion „Übernehmen" → `claim`, wie „Erledigt" verdrahtet), `api/cards.ts` (`POST /api/cards/:id/claim`); Tests `suggest.test.ts`, `push-action.test.ts`, `house-push.test.ts` (Karte vom Wächter geht nicht doppelt als Haus-Ansage).

**Interfaces:** `engine.claim(cardId, userId): { ok: true } | throws ConflictError` (zweites Tippen → 409 „{name} hat sie schon übernommen"); Migration 20 um `watcher_suggest` ergänzen (Migration ist unveröffentlicht, daher keine Migration 21).

- [ ] Tests (feste Uhr): Karte ohne Zuständige, Push an Anwesende (nicht an Abwesende, nicht an „wenig Zeit"? – doch: wenig Zeit darf übernehmen, wird nur nicht reihum gewählt), erster `claim` gewinnt, zweiter 409, nach 29:59 nichts, nach 30:00 Rückfall (`next` → nächste Person, `all`, `none`, `fixed`), niemand zu Hause → sofort Rückfall, Karte vorher erledigt → Eintrag räumt auf.
- [ ] Umsetzen, Commit.

### Aufgabe 18: Heute mit Weitergeben/Übernehmen, Diese Woche vollständig

**Files:** Modify `TodayView.svelte`, `WeekSheet.svelte`, `api.ts` (`api.passCard`, `api.claimCard`), `store/fairness.ts` + `api/fairness.ts` (`houseCards` je Woche, `busyUntil` je Person, offene Bestätigungen für mich), `lib/today.ts`; Tests `fairness.test.ts`, `fairness-api.test.ts`, web `today.test.ts`; e2e `24-heute` erweitern, `23-kind`/`22-fairness` anpassen.

- [ ] Server-Tests: `fairness` liefert `houseCards` (Wächter-Karten der Woche), `busyUntil`; „Wartet auf dich": Bestätigungsanfragen von Kindern, für die ich bestätigen darf (Daten aus `store/confirmation.ts`, Aktionen Passt/Nochmal existieren).
- [ ] Oberfläche: Vom-Haus-Karten: **Erledigt**, **Weitergeben** (Meldung „Gerade ist niemand sonst dran" bei `none`), nicht zugewiesene **Übernehmen**, Zeile „warum ich dran bin"; `WeekSheet`: Hinweis bei „wenig Zeit", Abschnitt **Wartet auf dich** (Passt/Nochmal), Zeile „N Karten kamen diese Woche vom Haus", Fairness-Balken unverändert.
- [ ] e2e: Heute: Vom-Haus-Karte erledigen und eine zweite weitergeben; „Übernehmen" bei `suggest`; Diese Woche zeigt Bestätigung.
- [ ] Gesamtprüfung, `pnpm e2e` im Hintergrund, Commit. **Ende Stufe 4.**

---

## Stufe 5: Vorlagen auf dem Server, Gefunden, Satz-Formular, Probelauf

### Aufgabe 19: Vorlagen und Erkennung (Server)

**Files:** Create `packages/server/src/watcher-templates.ts`; Modify `api/watchers.ts` (`GET /api/watchers/templates`, `GET /api/watchers/suggestions`, nur Administratoren), `i18n/en.ts`; Tests `packages/server/test/watcher-templates.test.ts`, `watchers-api.test.ts`.

**Interfaces:**
```ts
interface WatcherTemplate { id: string; kind: 'watcher' | 'recurring'; title: string; description: string; detect: Detect | null; prefill: PartialWatcherConfig | null; recurring: { title: string; rrule: RecurrenceInput } | null; canSelfComplete: boolean; whyNoSelfComplete: string | null }
interface Suggestion { templateId: string; entityId: string; name: string; reason: string }
templates(): WatcherTemplate[]          // übersetzt über t()
suggest(states: HaState[], watchedEntityIds: Set<string>): Suggestion[]
```
Vorlagen (Spec 4.6): Waschmaschine/Trockner/Spülmaschine fertig (`sensor` + `device_class: power` und Name; Programmstatus-Zustände `finished`/`end`/`ready`), Tonnen rausstellen (`calendar`, Vorabend), Wäsche rein es regnet (`weather`), Sensor-Batterie schwach (`device_class: battery`, unter 20 %), Saugroboter Behälter leeren (`vacuum`, Zähler), ohne Gerät: Entkalken, Rauchmelder testen, Filter wechseln, Bettwäsche. `canSelfComplete=false` mit Begründung für Leistungssensoren, die das Erledigen nicht belegen.

- [ ] Tests mit Beispielzuständen (deutsche und englische Namen: „Waschmaschine", „washing machine"; Entität schon beobachtet → weg; kein Treffer → leer; kaputte Attribute → kein Absturz).
- [ ] Umsetzen. Bestehende UI-Vorlagen (`web/src/lib/watchers.ts` `TEMPLATES`) als Quelle der Texte/Werte übernehmen, Aufgabe 21 stellt die Oberfläche um.
- [ ] HA nicht erreichbar → `suggestions` antwortet 409 mit Klartext. Commit.

### Aufgabe 20: Probelauf (Server)

**Files:** Create `packages/server/src/dry-run.ts`; Modify `ha.ts` (`getHistory(entityId, fromIso, toIso): Promise<{ state: string; at: string }[]>` über WebSocket `history/history_during_period`, höchstens 20 000 Zustände), `api/watchers.ts` (`POST /api/watchers/dry-run`, Administratoren); Tests `packages/server/test/dry-run.test.ts`, `ha.test.ts` (Fake-HA kennt `history/history_during_period`, `test/helpers/fake-ha.ts` und `e2e/mock-ha.mjs` ergänzen).

**Interfaces:**
```ts
dryRun(rule: { trigger: WatchTrigger; cooldownMin: number }, history: { state: string; at: string }[], nowMs: number): { fired: { at: string }[]; quick: number; sentence: string; points: { at: string; v: number }[]; noHistory: boolean }
```
Wendet Bedingung, Mindestdauer (`forMin`), Sperrzeit und „scharf erst nach Wechsel" wie `evaluate`/`fire` an (gleiche Hilfen `conditionMet`, kein zweiter Auslegungsweg). `quick`: Auslösungen innerhalb von 10 Minuten nach der vorherigen. Satz: „3 Trockengänge erkannt, kein Fehlalarm" bzw. „5 Mal ausgelöst, davon 2 innerhalb von 10 Minuten: Mindestdauer erhöhen?" (zweisprachig).

- [ ] Tests: Beispielhistorie mit drei Läufen → 3 Auslösungen; Rauschen → `quick`-Hinweis; leere Historie → `noHistory`; `unavailable`/`unknown` zählen nicht; mehr als 20 000 Zustände → gekappt; Zähler (`count`) berücksichtigt; Zeitraum 7 Tage.
- [ ] Umsetzen, Commit.

### Aufgabe 21: Gefunden, Satz-Formular, Probelauf in der Oberfläche

**Files:** Create `components/FoundSheet.svelte`, `components/WatcherSentence.svelte`, `components/DryRunPanel.svelte`; Modify `WatcherSheet.svelte` (Satz mit antippbaren Feldern, „Mehr Regeln" klappt Sperrzeit, Zähler, Erinnern, Fälligkeit, Erledigen-Bedingung auf; Schalter **Erst vorschlagen**; Hinweis, wenn Selbst-Erledigen nicht belegbar), `HomeView.svelte` („Stups hat N weitere Geräte gefunden", nur Administratoren), `lib/watchers.ts` (Vorlagen vom Server statt `TEMPLATES`), `api.ts`, `store.svelte.ts` (Sheet `{ type: 'found' }`), `settings/TemplatesPage`/`WatchersPage` (Eintrag „Wächter aus Vorlagen"); Tests `packages/web/test/watchers.test.ts` (Satzbau `sentenceParts(form)`), e2e `e2e/27-gefunden.spec.ts`, `10-waechter` anpassen.

**Interfaces:** `sentenceParts(form: WatcherForm): { entity; condition; duration; who; title }` (Texte für die antippbaren Felder); `api.watcherTemplates()`, `api.watcherSuggestions()`, `api.dryRun(input)`.

- [ ] Tests für `sentenceParts` (Beispiel aus Spec: „Wenn [Entität] länger als [3 Min.] unter [5 W] liegt, bekommt [wer zu Hause ist, reihum] die Karte [Titel].") in Deutsch und Englisch.
- [ ] Umsetzen. Probelauf-Panel: Diagramm (kleine SVG-Linie), Auslösezeitpunkte, Satz; fehlende Historie → Hinweis statt Diagramm. „Auch ohne Gerät": Karte mit Wiederholung aus Vorlage (`recurring`) auf wählbarem Board anlegen; „Alle Vorlagen ansehen".
- [ ] e2e: Wächter aus „Gefunden" mit Probelauf anlegen (Beispielhistorie im `mock-ha`), speichert, taucht unter Zuhause › Ruhig auf.
- [ ] Gesamtprüfung, `pnpm e2e` im Hintergrund, Commit. **Ende Stufe 5.**

---

## Stufe 6: Neue Auslöser Kalender und Wetter

### Aufgabe 22: Auslöser `calendar_event` und `forecast` (Server)

**Files:** Modify `watcher-types.ts` (`TriggerKind` + `parseTrigger`: `calendar_event` mit `leadMin` (Vorlauf, 0–10080), `forecast` mit `condition: 'rain'` und `hours` (1–48); beide ohne `forMin`-Zwang), `watcher-data.ts` (`WatchTrigger` JSON), `ha.ts` (`getCalendarEvents(entityId, fromIso, toIso)` über REST `calendars/<entity>`; `getForecast(entityId)` über `call_service weather.get_forecasts` mit `return_response`), `watchers.ts` (Auswertung im Takt, höchstens alle 30 Min. je Wächter, kein `subscribe_trigger` für diese Arten; `fire` mit Doppelschutz je Termin/Vorhersagefenster über `dedupe_key`), `home.ts` (`soon` mit `nextEvent`); Tests `watchers-calendar.test.ts`, `watchers-forecast.test.ts` (feste Uhr, Fake-HA mit Terminen und Vorhersage), `watchers-api.test.ts` (Validierung).

**Interfaces:** `WatchTrigger` bekommt `leadMin?: number`, `forecast?: { condition: 'rain'; hours: number }`; `conditionMet` bleibt für Zahlen/Zustand, neue Auswertung `calendarDue(events, nowMs, leadMin): CalendarEvent | null` und `forecastRain(forecast, nowMs, hours): boolean` als reine Funktionen in `watcher-types.ts`.

- [ ] Tests: Termin in 11 h bei Vorlauf 12 h löst genau einmal aus (Tick danach nicht erneut), Termin vorbei löst nicht aus, ganztägiger Termin, Regen in den nächsten 6 h ja/nein, Vorhersage fehlt → kein Auslösen und Wächter bleibt `ok`, HA nicht erreichbar → Fehler wird protokolliert, kein Absturz; Abfrage höchstens alle 30 Min.; alte Wächter laden unverändert.
- [ ] Umsetzen, `DEFAULT_FOR_MIN` für neue Arten 0, Commit.

### Aufgabe 23: Kalender und Wetter in Satz-Formular und Zuhause

**Files:** Modify `lib/watcher-types.ts`, `lib/watchers.ts` (Formular, `toInput`, `conditionText`, Satz), `WatcherSheet.svelte`, `HomeView.svelte` (Abschnitt „Bald dran": nächster Termin), `FoundSheet.svelte` (Vorlagen Tonnen/Regen jetzt aktivierbar); Tests `packages/web/test/watchers.test.ts`, e2e `27-gefunden` (Tonnen-Vorlage).

- [ ] Tests: Satz „Wenn im Kalender [Abfall] in [12 Std.] ansteht, …" und „Wenn es in den nächsten [6 Std.] regnet, …" (de/en), Formular → Eingabe → Formular verlustfrei.
- [ ] Umsetzen; Wächter mit neuen Arten brauchen keinen Probelauf (Hinweis „Probelauf nur für Zahlen und Zustände").
- [ ] Commit.

---

## Abschluss

### Aufgabe 24: Übersetzungen, Bilder, Doku, Beta-Release

**Files:** Modify `packages/web/src/lib/i18n/en.ts`, `packages/server/src/i18n/en.ts` (alle neuen Texte, Abdeckungstests grün), `stups/DOCS.md`, `stups/DOCS.de.md`, `README.md`, `README.de.md`, `docs/testliste.md` (neue Punkte: Heute, Zuhause, Gefunden/Probelauf, Weitergeben, Erst vorschlagen, Wenig Zeit, Bild, Einstellungen je Rolle, Dashboard-Link auf allen Reitern), `docs/entwicklung.md` (Teile `avatars`, `home`, `watcher-templates`, `dry-run`, Einstellungsseiten), `e2e/screenshots.mjs` + Bilder in `docs/images/`, `stups-beta/config.yaml` (`1.18.0-beta.1`), `stups-beta/CHANGELOG.md` (zweisprachig, Englisch zuerst, nur Beta).

- [ ] `pnpm test`, `pnpm lint`, `pnpm -r typecheck`, `pnpm build` grün; `pnpm e2e` (nie parallel, im Hintergrund, ca. 8 Min.) grün.
- [ ] Bildschirmfotos neu (`screenshots.mjs`), Doku aktualisieren, Verbleibsliste noch einmal von Hand gegen die Oberfläche prüfen.
- [ ] Commit; `git push origin beta` (kein Push nach `main`); CI abwarten (`gh run watch`), grün.
- [ ] Beta-App in Home Assistant: `ha_manage_app` (Slug `2aee07f1_stups_beta`) `check_updates` und `update`, danach Log prüfen (`ha_get_logs`), Migration 20 und Start ohne Fehler.
- [ ] Bericht an den Nutzer: was getan, Abweichungen (Bild unverkleinert aus HA), was bewusst nicht (Desktop, Stabil-Release wartet auf Freigabe).

## Selbstprüfung gegen den Entwurf

- 4.1 Navigation → Aufgaben 5, 9; 4.1a Bilder → 2, 3, 4, 10; 4.2 Heute → 6, 7, 18; 4.3 Kalender → 8; 4.4 Zuhause → 13, 14, 23; 4.5 Weitergeben/Vorschlagen/Wenig Zeit → 15–18; 4.6 Gefunden → 19, 21; 4.7 Satz/Probelauf → 20, 21; 4.8 Diese Woche → 7, 18; 4.9 Einstellungen → 9–12; 4.10 Gestaltung → 1; 5 Fehlerfälle → Review Focus, Aufgaben 13, 16, 17, 19, 20; 6 Tests → in jeder Aufgabe; 7 Reihenfolge → Stufen 1–6; Stufe 6 → 22, 23.
- Dashboard-Link und Ziel-Dashboard: Aufgaben 5 (TopBar) und 10 (`DashboardPage`), Browser-Test in 10.
