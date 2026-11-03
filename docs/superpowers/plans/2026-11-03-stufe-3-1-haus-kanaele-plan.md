# Stufe 3.1: Stups ins Haus – Umsetzungsplan

> **Für ausführende Agenten:** Benötigter Unter-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`).

**Ziel:** Stupse (und wahlweise Fälligkeits-Erinnerungen und Wächter-Karten) kommen im Haus an: als Lautsprecher-Ansage oder aufleuchtende Lampe, je Person und Kanal einstellbar. Ohne Haus-Kanäle ändert sich für niemanden etwas.

**Architektur:** Ein dritter Push-Weg `createHousePush` neben Companion App und ntfy, eingehängt in `combinePush` (dadurch greifen Doppelungsschutz, Protokoll und Beta-Schalter). `PushMessage` bekommt `kind` und `spoken`. Anwesenheit aus einem gemeinsamen Modul `presence.ts` (aus den Wächtern herausgezogen). Kanäle in Migration 16 (`house_channels`, `house_pending`).

**Technik:** TypeScript, Fastify, `node:sqlite`, Svelte 5 (Runes), Vitest (feste Uhr über `deps.now`), Playwright (WebKit) gegen den nachgebauten Home Assistant (`e2e/mock-ha.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-03-stufe-3-1-haus-kanaele-design.md`

## Globale Vorgaben

- **Testgetrieben:** Jede Aufgabe beginnt mit den Tests, die fehlschlagen, dann die Umsetzung. Nichts wird ohne Test geändert, das Verhalten festhält.
- **Alle Zeitregeln in Einheiten-Tests mit fester Uhr** (`deps.now`, eingespritzte Zeitgeber), nie mit der Wanduhr. Browser-Tests dürfen nicht von der Tageszeit abhängen (Lehre aus 1.15.0).
- Arten der Nachricht: `nudge` | `due` | `watcher`. Kanal-Typen: `speak` | `light`. Abwesend: `skip` | `wait`.
- Nachrichten ohne `kind` erreichen den Haus-Weg nie (Tageszusammenfassung, Test-Nachricht).
- Nur Administratoren ändern Kanäle. Gewählt werden dürfen nur Entitäten der Domänen `media_player` und `light` (Kanal) und `tts` (Sprachdienst), geprüft gegen die Liste aus Home Assistant. Die aufgerufenen Dienste sind fest verdrahtet.
- Alle neuen Texte auf Deutsch und Englisch (Katalog + Abdeckungstest). Quelltext-Kommentare auf Deutsch wie im übrigen Code.
- Jeder Schritt endet grün (`pnpm test`, `pnpm lint`, Typprüfung). Vor jedem Browser-Gesamtlauf `pnpm build`.
- Beta zuerst (`stups-beta/config.yaml` `1.16.0-beta.1`), normale App erst nach Freigabe. Migration 16 mit Sicherung davor (macht `openDb`).
- Wiederholungen und Zeitgrenzen sind kein Mittel gegen wackelnde Tests: erst die Ursache suchen.

## Review Focus

- Der Beta-Schalter (`beta-gate.ts`) wickelt den Haus-Weg mit ein: In der Beta nie Ansage oder Lampe, solange Push aus ist.
- Ruhezeit: `nudge` nicht noch einmal prüfen (schon zurückgehalten), `due` und `watcher` in der Ruhezeit verwerfen, nie nachholen.
- Die Lampe ist nach jedem Aufleuchten im alten Zustand: Sperre je Lampe, Verlängern statt zweiter Szene, Aufräumen nach Neustart.
- Die Warteschlange liefert nichts Veraltetes aus (Karte erledigt, Stups beantwortet, Frist vorbei).
- Entitäten und Dienste: keine freien Aufrufe, Domänen geprüft, nur Administratoren.
- Bestehende Wege (Companion App, ntfy, Wächter) bleiben unverändert; ihre Tests laufen unverändert grün.

## Aufgaben

### Task 1: `PushMessage` bekommt `kind`, `spoken` und `nudgeId` (Notifier füllt sie)

**Dateien:** `packages/server/src/push.ts`, `packages/server/src/notifications.ts`, `packages/server/src/i18n/en.ts`, neu `packages/server/test/notifications-house-fields.test.ts`

- [ ] Test zuerst: Eine fällige Karte erzeugt `kind: 'due'` mit `spoken` („Ben, Müll rausbringen ist fällig." / englisch „Ben, Take out trash is due."); `notifyAssigned` und `notifyStillOpen` erzeugen `kind: 'watcher'` („Ben, neue Aufgabe: …" / „Noch offen: …"); ein Stups erzeugt `kind: 'nudge'` mit Absender, Karte und Vorlagentext, `nudgeId` und `open.cardId`; Tageszusammenfassung und Nachhaken tragen **kein** `kind`. `spoken` kommt in der Sprache des Empfängers (`inLang`).
- [ ] `PushMessage` um `kind?: 'nudge' | 'due' | 'watcher'`, `spoken?: string`, `nudgeId?: string` erweitern. Sätze im Notifier bauen; Titel auf 80 Zeichen kürzen, Sonderzeichen entfernen.
- [ ] Katalog `i18n/en.ts` ergänzen, Abdeckungstest grün. Bestehende Notifier-Tests unverändert grün.
- [ ] Commit.

### Task 2: Anwesenheit in `presence.ts` herausziehen

**Dateien:** neu `packages/server/src/presence.ts`, `packages/server/src/watchers.ts`, neu `packages/server/test/presence.test.ts`

- [ ] Test zuerst: Zuordnung Stups-Person zur HA-Person über `user_id`, sonst über Namen (Anzeigename und Name, ohne Groß/Klein); Zustand `home` heißt zu Hause; keine passende Person heißt `unknown`.
- [ ] Die Zuordnung aus `watchers.ts` (`presence()` und `arrival()`) in `presence.ts` ziehen (`createPresence({ ha, store, now })` mit `homeOf(userId)` und `personEntityOf(userId)`, Zwischenspeicher wie `personStates`). `watchers.ts` benutzt das Modul, Verhalten unverändert; alle Wächter-Tests laufen unverändert grün.
- [ ] Commit.

### Task 3: Migration 16 und Datenteil für Kanäle und Warteschlange

**Dateien:** `packages/server/src/migrations.ts`, neu `packages/server/src/store/house.ts`, `packages/server/src/store.ts`, `packages/server/src/store/types.ts`, `packages/server/src/store/internals.ts`, `packages/server/test/fixtures/store-methods.json` (über `UPDATE_SHAPE=1`), neu `packages/server/test/house-store.test.ts`

- [ ] Test zuerst: Migration 16 nimmt eine Datenbank im Stand von 15 unverändert auf (Tabellen leer, `user_version` 16); Kanäle anlegen, lesen, ändern, löschen; Vorgaben (`kinds ["nudge"]`, `skip`, 120 Minuten); Prüfungen (Typ, Arten, Lautstärke 10–100 nur bei `speak`, Frist 1–1440, Name); Löschen der Person löscht ihre Kanäle und deren Warteschlange; Warteschlange: ablegen, fällige holen, ablaufen lassen; Sprachdienst in `settings`.
- [ ] Migration 16 (`house_channels`, `house_pending`) und `createHouse` (Store-Teil) mit den Methoden `houseChannels`, `houseChannelsOf`, `addHouseChannel`, `updateHouseChannel`, `removeHouseChannel`, `housePending`-Methoden, `getHouseTts`/`setHouseTts`. Änderungen am Datenteil melden sich für den Live-Sync (`markAllChanged` bei Kanal-Änderungen).
- [ ] `store.ts` und `internals.ts` zusammensetzen, Form-Test (`shape.test.ts`) bewusst aktualisieren. Export und Sicherung der Datenbank schließen die neuen Tabellen ein (Test).
- [ ] Commit.

### Task 4: Farbrechnung im Server

**Dateien:** neu `packages/server/src/accent.ts`, neu `packages/server/test/accent-color.test.ts`

- [ ] Test zuerst: `accentRgb(hue)` liefert für feste Farbtöne (0, 40, 120, 200, 260, 330) dieselben RGB-Werte wie die Browser-Rechnung `oklchToRgb(…)` im Dunkelmodus (Werte fest im Test, aus `packages/web/src/lib/accent.ts` berechnet); ohne Farbton Orange.
- [ ] Kleine Kopie von OKLCH zu RGB (Dunkelmodus-Werte der Fläche), Kommentar verweist auf das Browser-Modul. Commit.

### Task 5: Ansage und Lampe (Treiber)

**Dateien:** neu `packages/server/src/house-drivers.ts`, neu `packages/server/test/house-drivers.test.ts`

- [ ] Test zuerst mit einem Fake-Home-Assistant (`callService`, `getStates`) und fester Uhr:
  - **Ansage:** ruft `tts.speak` mit `entity_id` (Sprachdienst), `media_player_entity_id`, `message`, `language`, `cache: true`; mit Lautstärke zuerst `media_player.volume_set`, danach Rückstellung auf den vorherigen Wert nach `Länge × 0,08 s + 3 s`; ohne Sprachdienst: Fehler „nicht zugestellt".
  - **Lampe:** `scene.create` (`scene.stups_haus_<kanal>`, `snapshot_entities`), `light.turn_on` mit `rgb_color` und `brightness_pct: 100`, nach 5 s `scene.turn_on`; zweiter Aufruf während des Leuchtens verlängert und legt **keine** zweite Szene an; Lampe ohne Farbe leuchtet weiß; Aufräumen: übrig gebliebene `scene.stups_haus_*` werden abgespielt und mit `scene.delete` entfernt.
  - Zeitgeber werden eingespritzt (`setTimer`/`clearTimer`), kein echtes Warten.
- [ ] Treiber umsetzen. Commit.

### Task 6: Der Haus-Weg (`createHousePush`)

**Dateien:** neu `packages/server/src/house.ts`, neu `packages/server/test/house-push.test.ts`

- [ ] Test zuerst (feste Uhr, Fake-Presence, Fake-Treiber):
  - `canReach` wahr genau dann, wenn die Person mindestens einen eingeschalteten Kanal hat.
  - Art filtert: `nudge`-Nachricht erreicht nur Kanäle mit `nudge` in `kinds`; Nachricht ohne `kind` nie.
  - Ruhezeit: `due` und `watcher` in der Ruhezeit verworfen; `nudge` nicht noch einmal geprüft.
  - Anwesenheit: zu Hause stellt zu; abwesend + `skip` verwirft mit Vermerk; abwesend + `wait` legt in die Warteschlange (Frist aus `wait_minutes`); `unknown` gilt als zu Hause.
  - Warteschlange: Heimkehr (`arrival(userId)`) und `tick()` liefern fällige aus; vorher Prüfung „Karte noch offen / Stups unbeantwortet" (sonst verwerfen); abgelaufene werden gelöscht.
  - `send` meldet wahr, wenn ausgeliefert oder in die Warteschlange gelegt, sonst falsch; Fehler eines Treibers lässt die anderen Kanäle weiterlaufen und steht im Protokoll; letztes Ergebnis je Kanal abrufbar (`status()`); `clear` ohne Wirkung.
  - `test(channelId)` ignoriert Art, Ruhezeit, Anwesenheit.
- [ ] Umsetzen. Commit.

### Task 7: Einhängen in `main.ts`, Beta-Schalter, Start-Aufräumen

**Dateien:** `packages/server/src/main.ts`, `packages/server/src/beta-gate.ts` (nur falls nötig), `packages/server/src/channel.ts` (nur falls nötig), `packages/server/src/api/kit.ts`, neu `packages/server/test/house-wiring.test.ts`

- [ ] Test zuerst: Mit Home Assistant ist der Haus-Weg Teil von `combinePush`; ohne ist er nicht da; der Beta-Schalter unterdrückt Ansage und Lampe, solange Push aus ist, und lässt sie nach dem Einschalten zu; `capabilities.house` ist wahr nur mit Home Assistant.
- [ ] Haus-Weg zusammenbauen (Store, `presence`, Treiber, Home-Assistant-Client), Tick alle 30 s, Abonnement `house:arrival` auf die `person.*`-Entitäten (wie bei den Wächtern), Aufräumen der Szenen beim Start. `ApiDeps` bekommt `house`. Capabilities um `house` erweitern.
- [ ] Commit.

### Task 8: Schnittstelle

**Dateien:** neu `packages/server/src/api/house.ts`, `packages/server/src/api.ts`, `packages/server/src/api/settings.ts` (Push-Übersicht), `packages/server/test/fixtures/api-routes.json` (über `UPDATE_SHAPE=1`), `packages/server/src/i18n/en.ts`, neu `packages/server/test/house-api.test.ts`

- [ ] Test zuerst: Routen `GET/POST /api/house/channels`, `PATCH/DELETE /api/house/channels/:id`, `POST /api/house/channels/:id/test`, `GET /api/house/entities`, `PUT /api/house/settings`; nur Administratoren (Mitglied: 403); Prüfungen mit deutschen und englischen Fehlermeldungen; Entität muss in der Liste aus Home Assistant stehen und zur Domäne passen (sonst 400); Test-Knopf liefert `ok` oder den Fehler; ohne Home Assistant: 404; `GET /api/notifications/status` enthält Kanäle mit letztem Ergebnis; eine Person ohne Push-Gerät, aber mit Kanal, ist für Stupse und Zuweisung erreichbar.
- [ ] Routen umsetzen, in `api.ts` registrieren, Form-Test bewusst aktualisieren. Commit.

### Task 9: Oberfläche

**Dateien:** `packages/web/src/lib/api.ts`, `packages/web/src/lib/store.svelte.ts`, neu `packages/web/src/components/HouseChannels.svelte`, `packages/web/src/components/PeopleSheet.svelte`, `packages/web/src/lib/i18n/en.ts`, Browser-Test in Task 10

- [ ] Typen und Aufrufe im Client (`houseChannels`, `addHouseChannel`, …); `feat.house` aus den Fähigkeiten.
- [ ] `HouseChannels.svelte`: Block „Haus" in der aufgeklappten Person (Liste mit Schalter, Hinzufügen mit Typ und Entität aus der Liste, drei Häkchen für Arten, „Wenn nicht zu Hause: verwerfen / warten (Frist)", Lautstärke bei Ansage, Test-Knopf mit Ergebnis, Entfernen mit Rückfrage, Hinweis „keine Person in Home Assistant gefunden"). Gruppe „Haus" oben in Personen & Zugriff für den Sprachdienst. Nur Administratoren sehen die Bedienelemente, andere nichts. Mit Add-on-verwaltetem Personenverzeichnis bleibt der Block änderbar.
- [ ] Alle Texte auf Deutsch und Englisch, Abdeckungstests grün; kein waagerechtes Wischen auf iPhone-Breite.
- [ ] Commit.

### Task 10: Test-Home-Assistant und Browser-Tests

**Dateien:** `e2e/mock-ha.mjs`, neu `e2e/20-haus.spec.ts`, `e2e/playwright.config.ts` (nur falls nötig)

- [ ] Der Mock lernt: `GET /api/states` mit `media_player`-, `light`-, `tts`- und `person`-Entitäten, Dienste `tts.speak`, `media_player.volume_set`, `light.turn_on`, `scene.create`, `scene.turn_on`, `scene.delete` (alle zeichnet er auf, abrufbar unter `/mock/calls`, leerbar), Personen-Zustand setzbar (`/mock/state`).
- [ ] `20-haus.spec.ts` im Projekt `waechter` (Server mit Mock): Kanal anlegen und auswählen; Test-Knopf löst `tts.speak` bzw. `light.turn_on` aus; ein Stups an eine Person ohne Push-Gerät, aber mit Ansage-Kanal, wird angesagt; abwesend + verwerfen: nichts; abwesend + warten, dann „home": Ansage; Lampe leuchtet und wird zurückgestellt; Mitglied sieht den Block nicht. Keine Abhängigkeit von der Tageszeit: Personen-Ruhezeit der Testpersonen ausschalten (`quietOff`).
- [ ] Ganzen Browser-Lauf (`pnpm build`, `pnpm e2e`) laufen lassen: alles grün, keine Wiederholungen.
- [ ] Commit.

### Task 11: Doku und Beta-Veröffentlichung 1.16.0-beta.1

**Dateien:** `stups/DOCS.md`, `stups/DOCS.de.md`, `docs/testliste.md`, `docs/entwicklung.md`, `stups-beta/CHANGELOG.md`, `stups-beta/config.yaml`

- [ ] Anleitung (Englisch und Deutsch): Abschnitt „House channels" / „Haus-Kanäle" mit Einrichtung, Arten, Anwesenheit, Ruhezeit und den ehrlichen Hinweisen (Musik, Lautstärke, Lampen ohne Farbe, Beta-Schalter).
- [ ] Testliste: Abschnitt für das echte Haus (Lautsprecher, Lampe, Heimkehr, Ruhezeit, Beta-Schalter, kein Doppel-Ansagen von Beta und normaler App).
- [ ] `docs/entwicklung.md`: kurzer Abschnitt zum Haus-Weg und zu `presence.ts`.
- [ ] Changelog der Beta, Version `1.16.0-beta.1`. `pnpm test`, `pnpm lint`, Typprüfung, `pnpm build`, `pnpm e2e` grün; auf `beta` pushen, CI abwarten, Beta-App in Home Assistant aktualisieren (`check_updates`, `update`), Protokoll prüfen.
- [ ] Commit, Push.

### Task 12: Freigabe und stabile Version 1.16.0

- [ ] **Nur nach deiner ausdrücklichen Freigabe** (am echten Haus getestet oder bewusst ohne Test): `stups/config.yaml` auf `1.16.0`, zweisprachiger Changelog (Englisch zuerst), `git push origin beta:main`, CI abwarten, normale App aktualisieren, Protokoll prüfen.

## Selbstprüfung gegen die Spec

| Spec | Aufgabe |
|---|---|
| 4.1 Aufbau und Daten, Migration 16 | 3, 7 |
| 4.2 Ablauf (Art, Ruhezeit, Anwesenheit, Warteschlange, Erreichbarkeit, Beta, Fehler) | 1, 2, 6, 7 |
| 4.3 Ansage und Lampe, Sicherheit, Test-Knopf | 4, 5, 8 |
| 4.4 Oberfläche und Schnittstelle | 8, 9 |
| 4.5 Tests (feste Uhr, Browser mit Mock) | 1–10 |
| 4.6 Doku und Release | 11, 12 |
| 5 Nicht in diesem Teil | nichts davon wird gebaut |
| 6 Risiken | Review Focus, Tests in 5, 6, 7 |
| 7 Erfolgskriterien | 10, 11 |
