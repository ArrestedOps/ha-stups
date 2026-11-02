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
packages/server   Fastify, node:sqlite, Vitest   (store.ts = Datenschicht, notifications.ts = Push, recurrence.ts = Wiederholungen)
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

### Ports und Adapter

Die Fachlogik (Store, Wiederholungen, Wächter-Regeln, Stupsen) kennt Home Assistant nicht. Was von außen kommt, hängt an kleinen Schnittstellen in `packages/server/src`:

| Port | Datei | Adapter |
|---|---|---|
| Betriebsart und Einstellungen | `runtime.ts` | `resolveRuntime`: Add-on (Supervisor-Token), Standalone mit HA (`HA_URL` + `HA_TOKEN`), Standalone ohne HA; `options.json`, `STUPS_*` |
| Anmeldung (`Identity`) | `identity.ts` | `ingress.ts` (Ingress-Kopfzeilen von 172.30.32.2), `session-auth.ts` (Sitzungs-Cookie, eigene Konten aus `accounts.ts`) |
| Personen und Administratoren (`Directory`) | `directory.ts` | Home Assistant, eigene Konten, feste Liste für Entwicklung |
| Push (`PushGateway`) | `push.ts`, `ntfy.ts` | Notify-Dienste von Home Assistant, ntfy-Server (`STUPS_NTFY_URL`); `combinePush` schaltet mehrere Wege zusammen |

`main.ts` erkennt die Betriebsart und verdrahtet die Adapter; `GET /api/capabilities` sagt der Oberfläche, was es gibt. Die Anmeldung wählt `runtime.identity.kind`: Add-on und die Entwicklungs-Schalter (`ENFORCE_INGRESS_IP=false`) nutzen Ingress, alles andere eigene Konten. Die Oberfläche blendet Home-Assistant-Teile nur bei eigener Anmeldung aus (`feat` in `store.svelte.ts`); im Add-on bleibt alles sichtbar, auch wenn Home Assistant gerade nicht antwortet.

Browser-Tests: Projekte `dunkel` und `hell` (Server ohne Home Assistant mit Entwicklungs-Benutzer), `waechter` (nachgebautes Home Assistant, `e2e/mock-ha.mjs`, wie im Add-on), `standalone-ha` (eigener Container mit `HA_URL` und `HA_TOKEN` gegen dasselbe Nachbau, Websocket unter `/api/websocket`) und `standalone` (`e2e/server-standalone.mjs`: eigener Container, Einrichtung mit Code, Anmeldung). Der Einrichtungscode wird aus dem Protokoll in eine Datei geschrieben, die der Test liest. Derselbe Server startet einen nachgebauten ntfy-Server (Port + 1, `/__published` und `/__deleted` zeigen, was ankam): die Tests prüfen Nachricht, Knöpfe und den Rückweg `POST /api/push/action`.

Knöpfe in ntfy-Nachrichten kommen ohne Sitzung zurück. `ntfy.ts` signiert dafür Person, Aktion und Ablaufzeit mit einem Geheimnis aus der Datenbank (`settings.pushSecret`), `push-action.ts` prüft und führt die Aktion über denselben `handleAction` aus wie bei Home Assistant. Der Pfad ist der einzige ohne Anmeldung (und ohne Kopfzeile des Clients) im Container.

Lokal ohne HA starten: `DEV_USER=anna ENFORCE_INGRESS_IP=false DATA_DIR=<Ordner> OPTIONS_PATH=<options.json> node packages/server/dist/main.js`. Ohne `SUPERVISOR_TOKEN` ist die Verbindung zu HA aus.

### Neue Version veröffentlichen

1. Änderung machen, `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` laufen lassen.
2. `version` in `stups/config.yaml` erhöhen, Eintrag in `stups/CHANGELOG.md`.
3. Committen und nach `main` pushen. Die CI läuft dieselben Prüfungen und baut danach die Images (amd64, aarch64).
4. Wenn die CI grün ist: in HA aktualisieren (Abschnitt 2).

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
- Live-Sync lädt nach jeder Änderung neu. Das ist bei dieser Datenmenge schnell, wäre aber bei sehr großen Boards ein Ansatzpunkt für Optimierung.
- Die Browser-Tests laufen in WebKit unter Linux (CI), nicht in der Companion App.
