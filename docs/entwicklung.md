# Stups: Betrieb und Entwicklung

Stups ist ein Kanban-Board mit Agenda und Kalender als Home-Assistant-App. Es läuft im Ingress von Home Assistant, speichert alles in SQLite, schickt Push-Nachrichten über die Companion App und ist für das iPhone gebaut.

## 1. Wo was liegt

| Was | Wo |
|---|---|
| Quellcode, Releases, CI | https://github.com/ArrestedOps/ha-stups |
| Docker-Images | `ghcr.io/arrestedops/ha-stups-amd64` und `-aarch64`, Tag = Version |
| App in HA | Seitenleisten-Panel `/<Kennung>_stups`. Die Kennung entsteht aus der Repository-Adresse und steht in der Adresse der App-Seite in Home Assistant |
| Daten | im Add-on unter `/data` (SQLite `stups.sqlite`, Anhänge in `files/`, Sicherungen vor Datenbank-Änderungen in `backups/`). Teil des normalen HA-Backups |
| Optionen | HA › Apps › Stups › Konfiguration (Uhrzeiten, Dashboard, Protokollstufe) |
| Dashboard-Button | in der App unter Einstellungen (YAML zum Kopieren) |
| Dokumente | [../stups/DOCS.md](../stups/DOCS.md) (Bedienung, erscheint auch in Home Assistant), [../stups/CHANGELOG.md](../stups/CHANGELOG.md), [testliste.md](testliste.md) (Prüfliste fürs Handy) |

## 2. Betrieb

### Aktualisieren

1. Eine neue Version erscheint in Home Assistant, sobald sie auf GitHub in `main` liegt. Das Docker-Image wird danach noch einige Minuten gebaut.
2. **Erst aktualisieren, wenn der letzte CI-Lauf auf GitHub (Actions) grün ist.** Sonst meldet Home Assistant „manifest unknown 404".
3. HA › Einstellungen › Apps › App-Store › ⋮ › Nach Updates suchen › Stups › **Aktualisieren**. Danach die Companion App einmal komplett schließen und neu öffnen.
4. **Nie deinstallieren und neu installieren**: Das löscht alle Aufgaben.

### Sichern, wiederherstellen, umziehen

Ein HA-Backup einschließlich der App enthält Datenbank und Anhänge. Zusätzlich legt die App vor jeder Datenbank-Änderung eine Kopie unter `/data/backups` an (die letzten 5).

Für den Umzug in eine andere Stups-App (andere Repository-Adresse = andere App in Home Assistant) exportiert ein Administrator unter Einstellungen › Umzug die Daten nach `/share/stups-umzug`. Eine neue Stups-App ohne eigene Daten übernimmt den Export beim ersten Start.

### Wenn etwas nicht stimmt

| Symptom | Was tun |
|---|---|
| Push kommt nicht | In der App: Einstellungen › Benachrichtigungen › „Warum kommt nichts?". Dort steht, wer für welche Karte eine Nachricht bekommt, ob die Notify-Dienste in HA existieren und was zuletzt gesendet wurde. Karten ohne Zuständige oder ohne Termin senden nichts. Außerdem: Add-on-Log, Fokus-Modus am iPhone |
| Update-Fehler „manifest unknown" | Image noch nicht fertig, CI abwarten (siehe oben) |
| App lädt nicht / Fehlerseite | Add-on-Log in HA ansehen, App neu starten |
| HA-Kopfzeile sichtbar | Einstellungen › „HA-Kopfzeile ausblenden" |
| Zurück-Button führt zum falschen Dashboard | Einstellungen › Dashboard wählen |
| Änderungen erscheinen nicht am anderen Gerät | App schließen und öffnen; im Add-on-Log nach „websocket" suchen |
| Sensoren fehlen nach HA-Neustart | erscheinen nach spätestens 5 Minuten wieder |

Das Add-on-Log ist knapp gehalten und meldet jeden Push-Versand, fehlende Notify-Dienste und Fehler.

## 3. Entwicklung

### Aufbau

```
packages/server   Fastify, node:sqlite, Vitest
  src/store.ts    setzt die Datenschicht zusammen; die Themen stehen in src/store/ (siehe unten)
  src/api.ts      Einrichtung, Zugriffsprüfung, Live-Sync; die Routen stehen in src/api/ (siehe unten)
  src/notifications.ts (Push), recurrence.ts (Wiederholungen), watchers.ts (Wächter), …
packages/web      Svelte 5, Vite, Tailwind 4, Vitest
e2e/              Playwright (WebKit, iPhone-Ansicht), startet den gebauten Server
stups/            Add-on: config.yaml, Dockerfile, DOCS.md, CHANGELOG.md, Übersetzungen
docs/             Prüfliste, Entwicklungsnotizen, Bilder
```

### Befehle (im Repository-Ordner)

```bash
pnpm install
pnpm lint          # ESLint
pnpm typecheck     # TypeScript und svelte-check
pnpm test          # Server- und Oberflächen-Tests
pnpm build         # baut die Oberfläche nach packages/server/web
pnpm e2e           # Browser-Tests (einmal: pnpm exec playwright install webkit)
node e2e/screenshots.mjs   # Screenshots nach docs/images (nach pnpm build)
```

### Store und API in Teilen (seit 1.12.0)

**`src/store/`** (der Store, alle Daten in SQLite). `createStore` in `store.ts` baut aus dem Kontext (`context.ts`: Datenbank, Uhr, Zeitzone, Abfragen, Transaktion) die Teile zusammen und bietet nach außen **dieselben Methoden wie vorher**:

| Datei | Thema |
|---|---|
| `people.ts` | Personen, Zugriff (alle/ausgewählte), Einstellungen (`settings`), ntfy-Thema, Push-Geheimnis |
| `boards.ts` | Boards, Spalten, „Geplant", Kategorien, Board-Ansicht |
| `cards.ts` | Karten anlegen, ändern, verschieben, duplizieren, Termine über alle Boards, Archivliste |
| `card-extras.ts` | Anhänge, Kommentare, Checkliste, Links einer Karte |
| `completion.ts` | Erledigen, Rückgängig, Wiederholen (nächste Karte), Archivieren |
| `notifications.ts` | Sendeprotokoll der Benachrichtigungen |
| `nudges.ts` | Stupse |
| `watchers.ts` | Karten der Wächter (Herkunft, Doppelkarten-Schutz) |
| `trash.ts` | Papierkorb |
| `types.ts`, `validate.ts`, `constants.ts` | Typen, Prüfung von Eingaben, gemeinsame Konstanten |

Die Teile sind Funktionen `createX(c: Ctx, late)`. Rufen sie Funktionen anderer Teile auf, geht das über `lazy(s, [...])` (siehe `context.ts`): Der Aufruf schlägt erst beim Gebrauch nach, denn beim Aufbau sind die anderen Teile noch nicht da. Dadurch blieben die Funktionsrümpfe beim Aufteilen unverändert. Ein neues Thema = neue Datei, in `store.ts` in die Liste der Teile, in `internals.ts` in den Typ; **die Methoden, die nach außen sichtbar sind, stehen im Rückgabeobjekt von `createStore`.**

**`src/api/`** (die Routen): `api.ts` richtet Fehlerbehandlung, Zugriffsprüfung, Live-Sync ein und ruft die Registrierungen der Dateien auf (`settings`, `access`, `boards`, `cards`, `nudges`, `watchers`, `attachments`, `card-extras`, `trash`). Jede Datei bekommt ein kleines Paket gemeinsamer Hilfen (`ApiKit` in `api/kit.ts`: Abhängigkeiten, `body`, `requireAdmin`, `noContent`, …).

**Absicherung:** `test/shape.test.ts` vergleicht die Namen aller Store-Methoden und alle Routen (mit allen Teilen, die nur mit bestimmten Abhängigkeiten existieren) mit `test/fixtures/*.json`. Eine Methode oder Route verschwindet oder kommt dazu, ohne dass jemand es merkt, geht damit nicht mehr. Bewusst ändern: `UPDATE_SHAPE=1 pnpm test` und die Dateien mitcommitten.

### Sprachen (seit 1.14.0)

Stups spricht Deutsch und Englisch. **Der deutsche Text steht im Quelltext und ist der Schlüssel:** `t('Karte löschen?')`. Der englische Text steht in `packages/web/src/lib/i18n/en.ts`.

- **Schreiben:** `t('Text {name}', { name })` für Texte (Platzhalter in geschweiften Klammern, Werte werden in einem Durchgang ersetzt, ein Wert wie `{x}` bleibt, wie er ist), `tn('{n} Karte', '{n} Karten', n)` für Mehrzahlen (im Katalog ein Paar `[eins, andere]`), `tx('Kontext', 'Text')` wenn dasselbe deutsche Wort zwei englische Bedeutungen hat (Katalogschlüssel `Kontext|Text`). Namen von Wochentagen und Monaten stehen in `lib/i18n/names.ts`, Datumsformate folgen `numberLocale()`.
- **Dinge, die nicht übersetzt werden:** Eingaben von Menschen (Titel, Namen, Kommentare, eigene Stups-Texte), Namen aus Home Assistant. Fehlt ein englischer Eintrag, erscheint der deutsche Text.
- **Abdeckungstest** (`test/i18n-coverage.test.ts`, läuft in `pnpm test`): Jeder Text in `t()`, `tn()`, `tx()` hat einen englischen Eintrag, kein Eintrag ist verwaist, die Platzhalter stimmen überein. Er liest den Quelltext; Texte, die gar nicht in `t()` stehen, findet er nicht. Dafür gibt es das Browser-Projekt `english` (`e2e/18-english.spec.ts`, prüft die Kernabläufe auf deutsche Wörter und auf Überlauf).
- **Wörter in Objekten:** Labels in Listen oder Objekten, die einmal beim Laden gebaut werden, müssen sich beim Wechseln der Sprache ändern: als `$derived(...)` oder als `get label() { return t('…'); }` schreiben (Beispiele: `lib/carry.ts`, `components/TabBar.svelte`).
- **Sprache wählen:** Einstellungen › Sprache (je Person, gilt auf allen Geräten): „Automatisch“ (Gerät: beginnt eine bevorzugte Sprache mit „de“, dann Deutsch, sonst Englisch), „Deutsch“, „English“. Der Browser merkt die Wahl zusätzlich in `localStorage` (`stups.language`), damit schon die Anmeldeseite stimmt. Jede Anfrage trägt `X-Stups-Language`. Der Server speichert die zuletzt gemeldete Sprache (`users.language`) und die Wahl (`users.language_choice`, `null` = Automatisch), Migration 14; `PUT /api/me/language`.
- **Tests:** `test/setup.ts` stellt vor jedem Web-Test Deutsch ein (die bestehenden Tests prüfen deutsche Texte); Englisch stellt ein Test selbst ein (`setLanguage('en')`).

### Dokumentation, Screenshots, Demo-GIF (seit 1.15.0)

- **Zwei Sprachen:** `README.md`, `stups/DOCS.md`, `stups-beta/DOCS.md` und `docs/docker.md` sind **englisch und maßgeblich**; die deutschen Fassungen stehen daneben (`*.de.md`). Beide verweisen oben aufeinander (ein Test in `addon-files.test.ts` prüft das und dass die englischen Dateien nicht deutsch geblieben sind). Wer eine Datei ändert, ändert beide. `docs/entwicklung.md`, `docs/testliste.md` und die Spec-Dokumente bleiben deutsch (nur für die Entwicklung).
- **Screenshots:** `node e2e/screenshots.mjs` (deutsch, `docs/images`) und `node e2e/screenshots.mjs --lang en` (englisch, `docs/images/en`). Beide nach `pnpm build`. Das README zeigt die englischen, `README.de.md` die deutschen.
- **Demo-GIF:** `node e2e/demo.mjs --lang en` und `--lang de` schreiben `docs/images/demo.<sprache>.gif` (iPhone-Ansicht, erfundene Daten, Einzelbilder per Screenshot, zusammengesetzt mit `gifenc`). Ein Test (`demo-gif.test.ts`) hält Größe (unter 3 MB) und Format fest.
- **Ankündigungen:** Entwürfe in `docs/announcements/` (nicht veröffentlicht; den Text prüft und postet der Mensch).

### Haus-Kanäle (seit 1.16.0)

Ansage und Lampe sind ein dritter Push-Weg (`house.ts`, `createHousePush`) neben der Companion App und ntfy, eingehängt in `combinePush`. Dadurch gelten Doppelungsschutz, Protokoll und der Beta-Schalter ohne Umbau; die Warteschlange liefert selbst aus und fragt das Tor deshalb mit `allowed` (`betaGate.pushAllowed`).

- `PushMessage` trägt `kind` (`nudge` | `due` | `watcher`), `spoken` (der Satz in der Sprache des Empfängers) und `nudgeId`. Nachrichten ohne `kind` erreichen das Haus nie. `canReach(userId, kind)` kennt die Art, `hasDevice` im Datenteil zählt Haus-Kanäle für Stupse mit.
- `presence.ts` ordnet Stups-Personen den HA-Personen zu (gemeinsam mit den Wächtern). Beim Senden wird frisch gefragt, der Takt der Warteschlange darf den Zwischenspeicher (15 s) nutzen. Ohne passende HA-Person gilt `unknown`, und das heißt „zu Hause".
- `house-drivers.ts`: `tts.speak`, `media_player.volume_set` mit Rückstellung nach `Länge × 0,08 s + 3 s`, Lampe über `scene.create`/`scene.turn_on`/`scene.delete` (`scene.stups_haus_<kanal>`), eine Sperre je Lampe (Verlängern statt zweiter Szene), Aufräumen beim Start. Zeitgeber werden eingespritzt.
- `accent.ts` im Server ist eine Kopie der Farbrechnung im Browser; `test/accent-color.test.ts` hält beide gleich.
- Daten: Migration 16 (`house_channels`, `house_pending`); `house_pending` ist eine stille Tabelle (ändert keine Ansicht, kein Live-Sync). Wer als Person entfernt wird, hat keine Kanäle mehr (weiche Löschung), kommt sie zurück, gelten sie wieder.
- Tests: alle Zeitregeln mit fester Uhr (Einheiten); der Test-Home-Assistant (`e2e/mock-ha.mjs`) kennt Ansage, Lautstärke, Lampe und Szenen und zeichnet sie unter `/mock/calls` auf. `e2e/20-haus.spec.ts` läuft im Projekt `waechter`.

### Fairness, Rolle Kind, Vorlagen (seit 1.17.0)

Migrationen 17 (Vorlagen `board_templates`), 18 (`cards.effort`, `users.weekly_summary`), 19 (Kind: `users.is_child`, `child_scope`, `confirm_default`, Tabelle `child_confirmers`, `cards.confirm`, `confirm_requested_at`, `confirm_requested_by`).

- **Vorlagen:** eingebaute in `templates.ts` (zweisprachig, `resolveTemplate` rechnet Termine ab heute aus), eigene in `store/templates.ts`; `POST /api/boards` nimmt `template`. Texte nach `currentLanguage()` zum Anlegen.
- **Fairness:** `store/fairness.ts` zählt `completions` im Zeitraum (nach Bestätigung, auf `completed_by`), Gewichte `EFFORT_WEIGHT` (klein 1, mittel 2, groß 3, leer wie mittel). `GET /api/fairness`. Die Sonntagsnachricht ist `weeklySummaries` im Notifier (Sendeprotokoll `cardId: 'weekly'`).
- **Kind – Rechte:** `api/child-guard.ts` ist ein `preHandler` mit **Erlaubnisliste** (`ALLOWED`: Route → wie geprüft wird, ob die Karte dem Kind gehört). Was nicht dasteht, ist 403 „Das darf ein Kind nicht“, auch jede künftige Route. `test/child-guard.test.ts` geht alle Routen aus `test/fixtures/api-routes.json` durch. Wer eine Route für Kinder freigibt, ändert die Liste im Server **und** die im Test.
- **Kind – Sichtbarkeit:** bei `child_scope = 'assigned'` filtert derselbe Wächter: 404 für fremde Boards, Karten, Kommentare, Erledigungen, Anhänge (`store.boardIdsWithCardsOf`, `boardIdOfCard`) und ein `preSerialization`-Filter für Boardliste, Agenda/Kalender und `GET /api/cards?ids`. Der Live-Sync meldet nur Kennungen; geholt wird über dieselben gefilterten Routen. `test/child-visibility.test.ts`.
- **Bestätigung:** `store/confirmation.ts` (`needsConfirmation`, `requestConfirmation`, `answerConfirmation`, `confirmerIds`, `mayConfirm`). Das Erledigen eines Kindes mit Bestätigungspflicht wird in **drei** Wegen zur Anfrage umgebogen: `POST /api/cards/:id/complete` und im Notifier die Aktionen „Erledigt“ einer Erinnerung und eines Stupses (`requestInstead`). `completeCard` löscht die Anfrage mit; die Bestätigung ruft es mit `by = Kind`. Knöpfe in der Nachricht: `KANBAN_CONFIRM_YES|NO:<karte>` (`handleConfirmAction`). Ohne gewählte Bestätiger dürfen alle Erwachsenen (Abweichung vom Entwurf: Push kennt die Administratoren nicht). Erinnerung: Sendeprotokoll `kind = 'nag'`, Schlüssel `confirm:<Tag>`. Karten mit offener Anfrage fallen aus `openDueCards` (keine Mahnungen an das Kind).
- **Oberfläche:** `ui.isChild` (aus `/api/me`) blendet aus; maßgeblich ist immer der Server. `lib/confirm.ts` spiegelt die Regel „wer darf bestätigen“.
- Tests: `confirmation.test.ts`, `child-*.test.ts`, `fairness*.test.ts`, `template*.test.ts`, `weekly-summary.test.ts`; Browser: `e2e/21-vorlagen`, `22-fairness`, `23-kind`.

### Heute, Zuhause, Vorlagen, Einstellungen (seit 1.18.0)

- **Oberfläche:** Seit 1.20.0 gibt es drei Reiter (siehe „Drei Reiter und Hauptscreens“ unten). `GET /api/today` (`store/today.ts`) liefert „Vom Haus“ und „Bei den anderen“, `GET /api/home` (Phasen in `home.ts`) den Reiter Wächter; `FoundSheet` und `WatcherSentence`/`DryRunPanel` im Wächter-Formular. Der Satz des Formulars wird als Ganzes übersetzt und an den Platzhaltern zerlegt (`sentenceParts` in `lib/watchers.ts`).
- **Einstellungen:** `SettingsSheet.svelte` ist nur noch die Übersicht; jede Unterseite ist eine Komponente in `components/settings/`. Welche Gruppen und Seiten es für wen gibt, entscheidet die reine Funktion `settingsGroups` in `lib/settingsPages.ts` (getestet nach Rolle und Betriebsart). `PersonDelivery.svelte` (Geräte, ntfy-Thema, Ruhezeit, Rückblick, Wenig Zeit) erscheint bei einem selbst (Benachrichtigungen) und für Administratoren bei jeder Person.
- **Personenbilder:** `avatars.ts` (Dateien unter `<Datenordner>/avatars/<id>.img`, Upload hat Vorrang vor dem Bild aus Home Assistant, Typ per Magic-Bytes: JPEG, PNG, WebP, höchstens 2 MB), Routen in `api/people-avatar.ts`. Das Bild aus Home Assistant wird nicht verkleinert (keine Bildbibliothek im Server); hochgeladene Bilder verkleinert der Browser auf 256 Pixel.
- **Wächter:** `watcher-templates.ts` (Vorlagen und Erkennung, zweisprachig), `dry-run.ts` (Probelauf über `history/history_during_period`, höchstens 7 Tage und 20 000 Zustände). Neue Auslöser `calendar_event` und `forecast` werden nicht über Zustandswechsel, sondern im Takt von 30 Minuten abgefragt (`pollExternal` in `watchers.ts`); jeder Termin bekommt über den Schlüssel `dedupe_key` genau eine Karte. Weitergeben (`pass`), Erst vorschlagen (`suggest`, Tabelle `watcher_suggest`, `claim`, Rückfall nach 30 Minuten im Takt) und Wenig Zeit (`busy.ts`, `users.busy_until`) liegen in `watchers.ts`. Migration 20 enthält alle Spalten und Tabellen dieser Version. Ausgeblendete Treffer von „Gefunden" stehen in `watcher_hidden` (Migration 21, Schlüssel Vorlage + Entität); `detectSuggestions` lässt sie vor der Grenze je Vorlage weg, damit der nächste nachrückt.
- **Neue Routen sind für Kinder verboten**, bis sie in `api/child-guard.ts` freigegeben werden. Freigegeben sind nur `GET /api/today` und `GET /api/people/:id/avatar`.
- **Browser-Tests:** Die Projekte starten über den Merkzettel auf den Boards (`storageState` in `playwright.config.ts`); Tests, die den Start prüfen, nehmen ihn weg. `e2e/helpers.ts` hat `openTasksView`, `openList` und `openSettingsPage`. Das nachgebaute Home Assistant kennt jetzt Verlauf, Kalender und Vorhersage (`/mock/history`, `/mock/calendar`, `/mock/forecast`).

### Drei Reiter und Hauptscreens (seit 1.20.0, Neues Design Phase 2)

- **Reiter:** `lib/tabs.ts` kennt `tasks | boards | watchers`. `migrateTab` bildet die alten gemerkten Werte ab (`today`, `agenda`, `calendar` → Aufgaben; `home`, `watchers` → Wächter), `startTab` startet immer auf Aufgaben (gemerkt wird nur Boards), `visibleTabs` blendet Wächter ohne Home Assistant und für Kinder aus: **Kind und Docker ohne Home Assistant haben zwei Reiter**. `TabBar.svelte` zeigt zwei oder drei.
- **Aufgaben:** `TasksView.svelte` (ersetzt `TodayView` und `AgendaView`) hat den Umschalter Liste, Tag, Woche, Monat (`lib/tasks.ts`: `parseTasksView`, gemerkt unter `stups.calmode`, wie früher der Kalender). Tag, Woche und Monat sind `CalendarView.svelte` (jetzt ohne Kopf; Ansicht und Tag gehören `TasksView`). Die Liste lädt `GET /api/today` (Vom Haus, Bei den anderen) und zweimal `GET /api/schedule` (offene Karten ohne Untergrenze, bis fünf Jahre voraus; zuletzt Erledigte für „erledigt heute“), **keine neue Route**. Reine Logik: `groupTasks` (Überfällig, Heute, Diese Woche bis Sonntag, Später; Grenze 00:00 in der Zeitzone, `withDone` für die Gruppe Erledigt), `taskStats` (nur eigene Zahlen), `nudgesToMe` (Banner) in `lib/tasks.ts`; `weekStrip` in `lib/week.ts` (sieben Tage, bis zu drei Punkte nach Dringlichkeit). Alle mit fester Uhr und Zeitzone getestet (`tasks.test.ts`, `week.test.ts`).
- **Chips:** Meine, Alle, Personen und Niemand sind der Personenfilter von `ui.sf` (Merkzettel `stups.schedule`, gilt in allen Ansichten). Ein Gerät ohne Merkzettel startet bei „Meine“. Boards und „Erledigte“ stehen hinter dem Knopf „Filter“ (`ScheduleFilterBar`, `people={false}`). Ein Kind sieht keine Chips und nur Karten, die ihm zugewiesen sind (auch ohne „Vom Haus“).
- **Zeilen:** `CardItem.svelte` ist eine `ListRow` (Kachel nach Kategorie oder Boardfarbe, `lib/cardTile.ts`; Meta-Zeile `CardMeta.svelte`); die Hülle mit den Zeigerereignissen trägt Wischen und Ziehen unverändert (`role="presentation"`, Tests suchen sie so). Der Erledigt-Kreis ist `role="checkbox"`. `TaskRow.svelte` ist dieselbe Zeile für Karten aus `GET /api/schedule`.
- **Boards:** `BoardsView.svelte` (aus `App.svelte` ausgelagert). **Wächter:** `WatchersView.svelte` (vormals `HomeView`), Roboter-Bild `src/assets/waechter-robot.webp` (3 KB, verkleinert aus dem Entwurf, **Platzhalter bis zur Lieferung von Original und Rechten**).
- **Karte, Menü, Stupsen:** `CardSheet` (Kachel im Kopf, Banner „… stupsen“), `CardMenu` (Verschieben nach als Chips), `NudgeSheet` (Zeilen mit Haken, Vorschau der Push-Nachricht). Nichts davon hat eine neue Route; die Wächter-Routen bleiben für Kinder verboten.
- **Browser-Tests:** `e2e/26-reiter-waechter.spec.ts` (früher `26-zuhause-waechter`); `helpers.ts` hat `openTasksView(page, 'Liste' | 'Tag' | 'Woche' | 'Monat')` (wählt danach „Alle“).

### Live-Sync mit Änderungen (seit 1.13.0)

Jede Änderung löst eine Meldung über den WebSocket (`/api/events`) aus. Neu: Die Meldung sagt, was sich geändert hat, und der Client holt nur das nach.

- **Server:** `Ctx.run` (`store/context.ts`) schreibt bei jedem Schreibzugriff mit, welche Tabelle betroffen ist. Karten werden über ihre Kennung gemerkt (neu: erster Parameter; ändern: letzter Parameter bei `where id = ?`), Teile einer Karte (Checkliste, Links, Kommentare, Anhänge, Zuständige, Kategorien, Verlauf) zählen als Änderung dieser Karte, Sitzungen und Sendeprotokoll als nichts, **alles andere heißt „alles neu laden"**. Der Bus (`events.ts`) holt bei jeder Meldung `store.takeChanges()` ab und hängt `changes: { full, cards }` an. Was der Server nicht eindeutig einer Karte zuordnen kann, wird zu `full: true`; im Zweifel lädt der Client lieber zu viel. **Wer an `run` vorbei in die Datenbank schreibt, muss `store.markAllChanged()` aufrufen** (so tut es `watcher-data.ts`), sonst bleibt die Änderung unsichtbar.
- **Route:** `GET /api/cards?ids=a,b,c` (höchstens 50, Reihenfolge nach Position, gelöschte und archivierte fehlen).
- **Client:** `lib/sync.ts` prüft die Nummerierung (`seq`); fehlt eine Meldung oder wurde neu verbunden, gilt „alles". `lib/delta.ts` (rein, mit Tests) entscheidet, welche Karten nachgeladen werden, und setzt sie in die Ansicht ein. Kosten (die Summe steht nur im ganzen Board), ein anderes Board oder ein Fehler führen zum vollen Laden wie vorher. Eigene Aktionen (`act`) laden weiter alles. Meldungen, die während des Ladens oder Ziehens eintreffen, fließen zusammen.
- **Messen:** `e2e/4-perf.spec.ts` (Board mit 300 Karten, eine Änderung auf einem zweiten Gerät). Vorher: 214.692 Byte in vier Aufrufen; jetzt: 1.157 Byte in zwei (Boards-Liste und die eine Karte).

### Ports und Adapter

Die Fachlogik (Store, Wiederholungen, Wächter-Regeln, Stupsen) kennt Home Assistant nicht. Was von außen kommt, hängt an kleinen Schnittstellen in `packages/server/src`:

| Port | Datei | Adapter |
|---|---|---|
| Betriebsart und Einstellungen | `runtime.ts` | `resolveRuntime`: Add-on (Supervisor-Token), Standalone mit HA (`HA_URL` + `HA_TOKEN`), Standalone ohne HA; `options.json`, `STUPS_*` |
| Anmeldung (`Identity`) | `identity.ts` | `ingress.ts` (Ingress-Kopfzeilen von 172.30.32.2), `session-auth.ts` (Sitzungs-Cookie, eigene Konten aus `accounts.ts`) |
| Personen und Administratoren (`Directory`) | `directory.ts` | Home Assistant, eigene Konten, feste Liste für Entwicklung |
| Push (`PushGateway`) | `push.ts`, `ntfy.ts` | Notify-Dienste von Home Assistant, ntfy-Server (`STUPS_NTFY_URL`); `combinePush` schaltet mehrere Wege zusammen |

`main.ts` erkennt die Betriebsart und verdrahtet die Adapter; `GET /api/capabilities` sagt der Oberfläche, was es gibt. Die Anmeldung wählt `runtime.identity.kind`: Add-on und die Entwicklungs-Schalter (`ENFORCE_INGRESS_IP=false`) nutzen Ingress, alles andere eigene Konten. Die Oberfläche blendet Home-Assistant-Teile nur bei eigener Anmeldung aus (`feat` in `store.svelte.ts`); im Add-on bleibt alles sichtbar, auch wenn Home Assistant gerade nicht antwortet.

Browser-Tests: Projekte `dunkel` und `hell` (Server ohne Home Assistant mit Entwicklungs-Benutzer), `waechter` (nachgebautes Home Assistant, `e2e/mock-ha.mjs`, wie im Add-on), `beta` (Beta-App: `STUPS_CHANNEL=beta`, Push und Wächter zunächst aus, nachgebautes Home Assistant, `e2e/server-beta.mjs`), `standalone-ha` (eigener Container mit `HA_URL` und `HA_TOKEN` gegen dasselbe Nachbau, Websocket unter `/api/websocket`) und `standalone` (`e2e/server-standalone.mjs`: eigener Container, Einrichtung mit Code, Anmeldung). Der Einrichtungscode wird aus dem Protokoll in eine Datei geschrieben, die der Test liest. Derselbe Server startet einen nachgebauten ntfy-Server (Port + 1, `/__published` und `/__deleted` zeigen, was ankam): die Tests prüfen Nachricht, Knöpfe und den Rückweg `POST /api/push/action`.

Knöpfe in ntfy-Nachrichten kommen ohne Sitzung zurück. `ntfy.ts` signiert dafür Person, Aktion und Ablaufzeit mit einem Geheimnis aus der Datenbank (`settings.pushSecret`), `push-action.ts` prüft und führt die Aktion über denselben `handleAction` aus wie bei Home Assistant. Der Pfad ist der einzige ohne Anmeldung (und ohne Kopfzeile des Clients) im Container.

Passkeys (`passkeys.ts`, nur mit eigenen Konten und `STUPS_PUBLIC_URL` mit https und Name): `@simplewebauthn/server` wird erst beim ersten Gebrauch geladen, damit Add-on und Container ohne Passkeys die Bibliothek und ihre Node-Warnungen nie sehen. Domain und Adresse der Prüfung kommen aus `STUPS_PUBLIC_URL`, nie aus Kopfzeilen. Herausforderungen liegen im Speicher (einmal, fünf Minuten, höchstens 1000). Tabelle `passkeys` (Migration 13). Die Server-Tests prüfen den ganzen Ablauf mit einem Software-Authenticator (`test/helpers/authenticator.ts`, ES256). In den Browser-Tests gibt es keinen: WebKit unter Linux hat keinen virtuellen Authenticator (den hat nur Chromium über CDP), dort wird `navigator.credentials` ersetzt und nur die Oberfläche geprüft.

Lokal ohne HA starten: `DEV_USER=anna ENFORCE_INGRESS_IP=false DATA_DIR=<Ordner> OPTIONS_PATH=<options.json> node packages/server/dist/main.js`. Ohne `SUPERVISOR_TOKEN` ist die Verbindung zu HA aus.

### Neue Version veröffentlichen (mit Beta)

Seit 1.9.0 gibt es neben der normalen App eine zweite App im selben Repository: **Stups (Beta)** (Ordner `stups-beta/`, Slug `stups_beta`, eigene Daten). Jede neue Version geht **zuerst in die Beta** und erst nach Freigabe in die normale App.

| | normale App | Beta |
|---|---|---|
| Ordner, Slug | `stups/`, `stups` | `stups-beta/`, `stups_beta` |
| Branch, aus dem die CI baut | `main` | `beta` |
| Bilder | `ghcr.io/arrestedops/ha-stups-{arch}` (und `stups` als Manifest) | `ghcr.io/arrestedops/ha-stups-beta-{arch}` |
| Version | `X.Y.Z` in `stups/config.yaml` | `X.Y.Z-beta.N` in `stups-beta/config.yaml` |
| Home-Assistant-Adresse | `https://github.com/ArrestedOps/ha-stups` | `https://github.com/ArrestedOps/ha-stups#beta` |

Home Assistant liest die Liste der Apps aus dem Branch der Repository-Adresse. Darum steht die Beta-Version nur dann rechtzeitig im Store, wenn die zweite Adresse mit `#beta` eingetragen ist. Aus ihr erscheint auch ein zweites „Stups" (anderer Hash, leere Daten): nicht installieren.

**Ablauf**

1. Auf Branch `beta` arbeiten, `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` laufen lassen.
2. `version` in `stups-beta/config.yaml` erhöhen (`X.Y.Z-beta.N`), Eintrag in `stups-beta/CHANGELOG.md`, nach `beta` pushen. Die CI läuft dieselben Prüfungen und baut danach nur die Beta-Images.
3. Wenn die CI grün ist: in Home Assistant (Adresse mit `#beta`) „Nach Updates suchen", **Stups (Beta)** aktualisieren und testen (Testliste).
4. **Nach der Freigabe:** auf `beta` die Version in `stups/config.yaml` auf `X.Y.Z` erhöhen und den Changelog `stups/CHANGELOG.md` schreiben, dann nach `main` mergen (schneller Vorlauf, keine neuen Änderungen). Die CI baut die normalen Images und das Manifest. Zuvor, wenn es eine Migration gibt: Sicherung der normalen App.
5. Wenn die CI grün ist: in HA aktualisieren (Abschnitt 2). Danach `main` zurück nach `beta` mergen, falls dazwischen etwas auf `main` landete.

Die CI bricht ab, wenn die Version nicht zum Branch passt (eine Beta-Version ohne `-beta.N` auf `beta`, ein Suffix in der Version der normalen App auf `main`): So landet kein falsches Bild unter einem falschen Namen.

**Was die Beta anders macht** (damit sie neben der normalen App laufen kann; das Image bringt `STUPS_CHANNEL=beta` mit, `channel.ts`)

- Push-Titel beginnen mit „Beta ·", Tags und Gruppen der Nachrichten heißen anders, die Knöpfe in Nachrichten tragen `BETA_` vor der Aktion (jede App verarbeitet nur ihre eigenen, auch wenn die Karte in beiden dieselbe Kennung hat).
- Sensoren heißen `sensor.stups_beta_…` („Stups Beta …"), das Ereignis für Automationen `stups_beta_create_card`.
- **Push und Wächter sind zunächst aus** (`beta-gate.ts`, Einstellungen › Beta, nur Administratoren): Push „Aus / Nur für mich / An", Wächter „an/aus". Der Server setzt das durch (nicht die Oberfläche): ohne Freigabe wird nichts gesendet, und die Wächter werten nichts aus.
- **Echte Daten zum Testen:** in der normalen App Einstellungen › Umzug › Exportieren, **danach** die Beta zum ersten Mal starten (sie übernimmt den Export nur, wenn sie noch keine Daten hat). Neue Kopie: die Beta (nur die!) deinstallieren, neu exportieren, neu installieren.
- Das Symbol mit „BETA"-Band erzeugt `node e2e/make-beta-icon.mjs` aus den Bildern der normalen App.

**Direkt nach `main` (ohne Beta)** geht nur ein Hotfix für einen dringenden Fehler in der normalen App. Danach `main` nach `beta` mergen.

### Gut zu wissen

- Zeiten liegen in UTC in der Datenbank, Berechnungen (Wiederholung, „heute", Sommerzeit) laufen in der HA-Zeitzone.
- Der Erinnerungs-Takt läuft alle 30 Sekunden. Gesendetes steht in `sent_notifications` (Schutz vor Doppelungen, auch nach Neustart). Termine, die mehr als 12 Stunden zurückliegen, werden nicht mehr nachgeholt.
- Anfragen an HA haben ein Zeitlimit von 15 Sekunden.
- Das Wischen ist nur mit Touch aktiv, die Maus zieht (Drag & Drop, ab 1024 px Breite).
- Der Server nimmt Anfragen nur vom Ingress-Proxy (`172.30.32.2`) an.

## 4. Bekannte Grenzen

- Das Wischen und die Tastatur-Anpassung sind in den Browser-Tests nur mit Zeiger-Ereignissen bzw. per Rechenfunktion abgedeckt. Echtes Touch und die echte Bildschirmtastatur lassen sich nur am iPhone prüfen.
- Spalten werden mit Pfeilen sortiert, nicht per Ziehen.
- Erinnerungen gibt es als „Vorab" (15 Minuten bis 2 Tage) und „Nachhaken" (tägliche Uhrzeit aus den Optionen), keine freien Zeiten pro Karte.
- Live-Sync holt bei Änderungen an Karten nur diese Karten (seit 1.13.0, siehe „Live-Sync mit Änderungen"). Alles andere (Boards, Spalten, Kategorien, Personen, Stupse, Wächter) und Kosten laden wie vorher alles neu. Agenda, Kalender und Karten-Fenster holen ihre eigenen Daten weiterhin bei jeder Meldung neu.
- Die Browser-Tests laufen in WebKit unter Linux (CI), nicht in der Companion App.
