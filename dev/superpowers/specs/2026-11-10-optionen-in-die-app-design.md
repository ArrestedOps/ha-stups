# Optionen in die App: Spec

> **Entwurf, wartet auf Freigabe.** Teilprojekt C der Review vom 10.11.2026 (Punkt 1, „zwei Orte für dieselben Einstellungen"). Grundlage sind die Entscheidungen des Auftraggebers vom 10.11.2026: zwei Release-Schritte, neue Einstellung „Nachhaken um …" in der App, Docker unverändert.

Stand 10.11.2026, Ausgangslage: Beta `1.41.0-beta.2`, normale App `1.27.1`.

## 1. Ziel

Im Add-on gibt es **einen** Ort für Personen, Push-Geräte, Zugriff, Dashboard und Uhrzeiten: die App. Von den Add-on-Optionen bleibt am Ende nur `log_level`.

Nicht Ziel:

- **Docker und Betrieb ohne Add-on.** `STUPS_USERS`, `STUPS_ACCESS_MODE`, `STUPS_DASHBOARD_PATH`, `STUPS_DAILY_SUMMARY_TIME`, `STUPS_OVERDUE_NAG_TIME`, `STUPS_CONFIG` und `options.json` gelten dort unverändert, samt Sperren der App bei gefüllter Liste. `docs/docker.md` und `docs/docker.de.md` bekommen nur den Zusatz, dass die Uhrzeit fürs Nachhaken (wie die der Tageszusammenfassung) in der App Vorrang hat (Abschnitt 4).
- Neue Funktionen für Personen oder Zugriff. Die App kann das alles schon.
- Ein Datum für Release 2 (siehe Abschnitt 6).

## 2. Befund

| Option | Was der Code heute tut | Folge |
|---|---|---|
| `users` | Gefüllt: Bei **jedem** Start gilt die Liste (`applyManagedPeople`), Nicht-Genannte werden zu Nicht-Personen, die App ist gesperrt (`managedByOptions`). Leer: einmalige Übernahme `importLegacyPeople`. | Muss einmal in die Datenbank, danach gehört die Liste der App. |
| `access_mode` | Gilt nur zusammen mit gefülltem `users`. | Wandert mit `users`. |
| `dashboard_path` | Rückfall, wenn in der App (`settings.dashboardPath`) nichts steht (`api/settings.ts`). | Übernahme nur, wenn abweichend vom Standard. |
| `daily_summary_time` | Rückfall hinter `settings.dailySummaryTime` (`notifications.ts`, `api/settings.ts`). | Wie oben. |
| `overdue_nag_time` | **Einzige Quelle** der Uhrzeit für Erinnerungen in Tagen und Wochen ohne eigene Uhrzeit (`notifications.ts`, `deliverReminders`). Keine Einstellung in der App. | Braucht eine neue Einstellung. |
| `log_level` | Bleibt. | Unverändert. |

Risiko, das die Zweiteilung begründet: Verschwindet eine Option aus dem Schema, während Nutzer sie gesetzt haben, meldet der Supervisor nach Berichten aus der Community „Unknown options" und verwirft sie (je nach Version unterschiedlich; eine offizielle Beschreibung wurde nicht gefunden, die Quelle des Supervisors ließ sich nicht abrufen). Ob `options.json` beim ersten Start nach einem solchen Update die alten Werte noch enthält, ist **nicht belegt**. Darum darf die Übernahme nicht im selben Release stehen wie das Entfernen.

## 3. Release 1: einmalige Übernahme (nur Add-on-Modus)

### 3.1 Ablauf

Beim Start im Modus `addon` (`runtime.mode === 'addon'`), wenn in der Datenbank das Merkmal `addonOptionsImported` fehlt, läuft **in einer Transaktion**:

| Option (aus `options.json`) | Übernahme |
|---|---|
| `users` mit mindestens einem Namen | Personen und Push-Geräte werden angelegt oder ergänzt (`syncPeople`), **niemand wird entfernt**. Danach `managedByOptions = '0'`. `legacyPeopleImported` wird gesetzt, falls es fehlt. |
| `users` leer | Es bleibt beim vorhandenen `importLegacyPeople` (Verhalten unverändert). |
| `access_mode` | Nur wenn `users` gefüllt ist: in `accessMode`. Bei leerem `users` gilt die Logik von `importLegacyPeople`. |
| `dashboard_path` | Wenn ungleich `/` (Standard) und `settings.dashboardPath` leer ist: in `settings.dashboardPath`. |
| `daily_summary_time` | Wenn ungleich `08:00` und `settings.dailySummaryTime` leer ist: übernehmen. |
| `overdue_nag_time` | Wenn ungleich `18:00` und `settings.overdueNagTime` leer ist: in die neue Einstellung. |

Danach `addonOptionsImported = <ISO-Zeitpunkt>`. Ein späterer Start ändert nichts mehr, auch wenn die Konfiguration von Hand geändert wurde.

### 3.2 Folgen für den Betrieb

- Der Server liest die Optionen im Add-on-Modus **nicht mehr als Rückfall**. `defaultDashboardPath`, `defaultDailySummaryTime` und die Nachhaken-Uhrzeit sind Konstanten im Code (`/`, `08:00`, `18:00`).
- Das Protokoll nennt, was übernommen wurde („Aus den Add-on-Optionen übernommen: 3 Personen, Zugriff selected, Dashboard /lovelace/0").
- Ein Wert, der **nicht** zum Schema passt (zum Beispiel ungültige Uhrzeit), wird übersprungen und im Protokoll als Warnung genannt, statt den Start abzubrechen. Das ist eine Änderung gegenüber `parseOptions`, das heute wirft; im Add-on-Modus gilt sie nur für den Import.
- Eine **verwaltete** Installation (`users` gefüllt) wird dadurch **frei**: Personen, Geräte und Zugriff sind in der App wieder änderbar. Wer die YAML danach weiter pflegt, bewirkt nichts mehr.
- Fehler beim Import (Datenbank) brechen den Start nicht ab. Das Merkmal bleibt ungesetzt, der Import läuft beim nächsten Start erneut.

### 3.3 Hinweis in der Add-on-Konfiguration

In `stups/translations/de.yaml` und `en.yaml` (Beta: identisch, wird getestet) tragen `users`, `access_mode`, `dashboard_path`, `daily_summary_time` und `overdue_nag_time` den Zusatz „(veraltet)" im Namen. Die Beschreibung sagt: gilt nur beim ersten Start, danach pflegst du es in der App unter Einstellungen › (jeweiliger Ort). Das Schema und die Standardwerte in `config.yaml` bleiben in Release 1 unverändert.

## 4. Neue Einstellung „Nachhaken um …"

- **Speicher:** `settings.overdueNagTime` (HH:MM oder leer), im Store wie `dailySummaryTime`: `getSettings()` und `setSettings()` führen das Feld, Validierung wie bei der Tageszusammenfassung.
- **API:** `GET /api/settings` liefert `overdueNagTime`, `defaultOverdueNagTime` (`18:00`) und `effectiveOverdueNagTime`. `PUT /api/settings` nimmt `overdueNagTime` an (`null` stellt zurück). Recht: `requirePermission(req, 'settings')`, wie `dailySummaryTime`.
- **Wirkung:** `notifications.ts` nimmt `store.getSettings().overdueNagTime ?? '18:00'` statt `options.overdueNagTime`.
- **Oberfläche:** Neue Seite neben `settings/SummaryPage.svelte` im selben Muster: Uhrzeit wählen, „Zurücksetzen auf 18:00". Texte deutsch und englisch (`web/src/lib/i18n/en.ts`, `server/src/i18n/en.ts`; die Abdeckungstests erzwingen beides).
- **Docker:** `STUPS_OVERDUE_NAG_TIME` bleibt Rückfall hinter der App-Einstellung, wie es `STUPS_DAILY_SUMMARY_TIME` hinter `dailySummaryTime` ist. Diese Rangfolge ist die einzige Änderung für Docker und ergänzt nur.

## 5. Release 2: Optionen aus dem Schema nehmen

- Ändert nur `stups/config.yaml` und `stups-beta/config.yaml` (`options`, `schema`), die Übersetzungen und die Doku. Übrig bleibt `log_level`.
- Der **Importer bleibt im Code**. Wer Release 1 übersprungen hat, bekommt die Werte noch übernommen, soweit sie in `options.json` stehen.
- `DOCS.md` und `DOCS.de.md` (normale App und Beta) verlieren den Abschnitt „Add-on options" samt „Two ways, one result". Ein kurzer Hinweis für Bestandsnutzer nennt, wo es jetzt steht. Das ist die Kürzung, die Teilprojekt D braucht.
- Release 2 ist ein eigener Entwurf nach Abschluss von Release 1, weil er davon abhängt, wie sich der Supervisor in der Praxis verhält (Abschnitt 6).

## 6. Risiken und offene Punkte

1. **Verhalten des Supervisors bei entfernten Optionen** ist nicht belegt (Abschnitt 2). Release 1 verlangt nichts davon. Vor Release 2 wird an einer Test-Installation geprüft: Option gesetzt, Update auf ein Schema ohne sie, Add-on startet, Protokoll des Supervisors.
2. **Release 2 wann?** Frühestens, wenn Release 1 eine Weile als stabile Version verbreitet ist. Das Datum bestimmt der Auftraggeber.
3. **Nutzer, die die YAML bewusst als Quelle der Wahrheit pflegen.** Sie verlieren die Durchsetzung bei jedem Start. Das steht im Changelog beider Releases, und der Hinweis in der Konfiguration (3.3) zeigt es dort, wo sie arbeiten.
4. **Eine verwaltete Installation wird mit Release 1 frei.** Personen, die jemand in der YAML bewusst nicht aufgeführt hat, sind danach trotzdem Personen, falls sie schon vorher in der Datenbank standen. Der Import entfernt niemanden. Das ist gewollt (kein Datenverlust), aber nicht dasselbe wie vorher, wo sie bei jedem Start zu Nicht-Personen wurden.

## 7. Tests

**Server** (Vitest, `packages/server/test`):

- Verwaltete Installation: `users` und `access_mode` werden übernommen, niemand fällt weg, `managedByOptions` ist `0`, `isManaged()` ist falsch.
- Unverwaltet (`users` leer): `importLegacyPeople` verhält sich wie bisher.
- Standardwerte werden **nicht** in die Einstellungen geschrieben, abweichende schon, vorhandene App-Einstellungen werden nicht überschrieben.
- Der Import läuft genau einmal: zweiter Start mit geänderten Optionen ändert nichts.
- Ungültige Uhrzeit im Import: übersprungen, Warnung, Start gelingt.
- Docker-Modus (`standalone`, `standalone-ha`): kein Import, Sperren der App bei gefüllter Liste wie bisher.
- `deliverReminders`: Die Einstellung `overdueNagTime` bestimmt die Uhrzeit für Tage und Wochen; ohne sie gilt `18:00`, im Docker-Modus der Rückfall aus `STUPS_OVERDUE_NAG_TIME`.
- `addon-files.test.ts`: Jede Option im Schema hat eine Übersetzung mit „(veraltet)"-Zusatz in Release 1, Beta und normale App stimmen überein.

**Oberfläche:** Seite „Nachhaken um …" (Anzeige, Ändern, Zurücksetzen, Recht fehlt), Eintrag in der Einstellungsliste, Texte in beiden Sprachen.

**Browser** (Playwright): Start mit vorbelegter `options.json` (zwei Personen, `selected`): Die App ist entsperrt und zeigt die Personen; die Uhrzeit für Nachhaken lässt sich ändern.

## 8. Reihenfolge der Umsetzung (Release 1)

1. Server: Store-Einstellung `overdueNagTime`, API, `notifications.ts`, Tests.
2. Server: Importer und Aufruf in `main.ts`, Tests.
3. Oberfläche: Seite „Nachhaken um …", Tests.
4. Übersetzungen der Optionen, Test der Add-on-Dateien, Changelog.
5. Browser-Test, Beta-Version erhöhen, ein Beta-Release.

Jeder Schritt ein Commit, damit sich die Teile einzeln zurücknehmen lassen.
