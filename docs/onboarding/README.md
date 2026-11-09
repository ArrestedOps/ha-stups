# Onboarding für Stups: Übergabe

Diese Datei ist die vollständige Aufgabenbeschreibung für einen Agenten, der das Onboarding baut. Lies sie ganz, bevor du etwas änderst. Sprache von Texten in der App: Deutsch ist die Quelle, Englisch kommt über die Übersetzungsdateien (siehe „Texte“).

## 1. Ziel

Wer Stups zum ersten Mal öffnet, soll in etwa **drei Minuten** zum ersten Erfolg kommen: eine Testnachricht auf dem Handy mit „Erledigt“-Knopf und ein laufender Wächter. Das Produktversprechen ist: **„Dein Zuhause merkt, was zu tun ist. Ihr entscheidet, wer es macht.“** Das Onboarding zeigt dieses Versprechen, nicht die Kanban-Funktionen.

Leitregeln (verbindlich, an ihnen wird abgenommen):

1. **Ein Gedanke pro Bildschirm.** Wenig Text, ein Hauptknopf.
2. **Alles vorausgefüllt.** Personen, Handys und Vorschläge sind schon gewählt; man tippt nur ab, was nicht passt.
3. **Überall „Später“ oder „Nicht jetzt“.** Nichts blockiert, jeder Schritt lässt sich in den Einstellungen nachholen.
4. **Der Erfolg kommt vor der Feinheit.** Die Testnachricht steht vor allen optionalen Schritten.
5. **Keine Fachwörter** (Entität, Notify-Dienst, Board, YAML). Siehe Wortliste im Abschnitt „Texte“.
6. **Nie ein Neustart nötig.** Abbrechen und später wieder aufnehmen muss gehen, ohne Datenverlust.
7. Hell und Dunkel, 44-px-Tippflächen, Tastatur und Screenreader (echte `button`, Beschriftungen).

## 2. Das Mockup

Die Quelle liegt in `docs/onboarding/mockup/` als `.dc.html`-Dateien (HTML mit Inline-Stilen, gut lesbar). Eine Live-Ansicht (privat, nur für den Besitzer) hat die Leinwand „Stups Onboarding“ auf claude.ai; wer sie nicht öffnen kann, liest die Dateien. Das Mockup ist die **Vorgabe für Inhalt und Aufbau**, nicht für den Code: Farben und Größen kommen aus dem bestehenden Design (Tokens in `packages/web/src/app.css`, Komponenten in `packages/web/src/components/ui/`), nicht aus den Inline-Stilen.

| Datei | Bildschirm |
|---|---|
| `Main.dc.html` | Mobil 0: Willkommen |
| `M2-Personen.dc.html` | Mobil 1: Wer wohnt hier? |
| `M3-Waechter.dc.html` | Mobil 2: Das haben wir gefunden (Wächter) |
| `M4-Test.dc.html` | Mobil 3: Testnachricht |
| `M5-Fertig.dc.html` | Mobil 4: Stups läuft |
| `D1`–`D3` | Desktop: gleicher Ablauf, links Fortschritt, rechts Live-Vorschau der Nachricht |

Abweichungen vom Mockup, die schon feststehen:
- Am Desktop gibt es für die Testnachricht keinen eigenen Bildschirm im Mockup; sie soll **dort wie mobil** ein eigener Schritt sein (Vorschau-Spalte rechts bleibt).
- Am Desktop (ab 1024 px) ist das Onboarding ein zentrierter Dialog mit Fortschrittsleiste links, nicht Vollbild.

## 3. Ablauf im Detail

Zielgruppe der vollen Strecke: **Administratoren** (Home-Assistant-Administratoren), und zwar **beim ersten Start einer leeren Installation**. Wer kein Administrator ist, sieht nur eine Kurzfassung (siehe 3.6).

### 3.0 Wann erscheint es?

- Es erscheint **einmal**, wenn für die Person noch kein Onboarding-Status gespeichert ist **und** die Installation „neu“ ist (keine Karten, keine Wächter, höchstens die Person selbst). Bestehende Installationen **dürfen es nicht automatisch sehen** (Update-Fall: kein Überfall bei Bestandsnutzern). Für sie gibt es einen Eintrag in den Einstellungen („Einrichtung nochmal durchgehen“, Abschnitt Hilfe und Daten).
- Der Status ist **pro Person** zu speichern (neues Feld, siehe Abschnitt 5). Werte: `done`, `skipped`, sonst ungesetzt. „Überspringen“ im Willkommen-Schritt setzt `skipped` und öffnet die App normal.
- Die Beta (`channel` beta) zeigt es genauso, damit es dort getestet werden kann.

### 3.1 Willkommen

Schlagzeile, ein Beispiel „Waschmaschine fertig → Anna ist dran → Anna bekommt eine Nachricht mit Erledigt-Knopf“, Hauptknopf „Los geht's · dauert 3 Minuten“, Hinweis „Du kannst jeden Schritt überspringen“. Oben rechts „Überspringen“.

### 3.2 Wer wohnt hier?

- Quelle: `GET /api/me` (`people`), `GET /api/access` und die Personen aus Home Assistant (siehe `server/src/directory.ts`, `store/people.ts`). Alle erkannten Personen sind **vorgewählt**; die eigene Person steht oben („Du“) und kann nicht abgewählt werden.
- Pro Zeile: Avatar, Name, **Handy-Status** („iPhone von Anna erkannt“ oder „Kein Handy gefunden“). Quelle für Geräte: dieselbe Logik wie in Einstellungen › Personen (`PeopleSheet.svelte`, Notify-Dienste `mobile_app_*`); die Geräte werden **automatisch gewählt**, wenn genau eins zur Person passt.
- Pro Zeile eine kleine Wahl „Kind“ (Rolle Kind, siehe Doku „Child role“). Standard: Mitglied. Kinder sehen nur eigene Karten.
- Abgewählte Personen werden **nicht** angelegt. Es wird nichts gelöscht.
- Bei „Kein Handy gefunden“ steht der Link „Companion App installieren“ (Entscheidung 4 in Abschnitt 10). Weiter-Knopf zeigt die Zahl: „Weiter mit 3 Personen“. Speichern erst beim Weiter (ein Aufruf pro Person über `POST /api/access/people` und `PATCH /api/access/people/:id`; bestehende Personen nicht doppelt anlegen).
- Ist die Installation durch `users` in den Add-on-Optionen verwaltet (siehe `notManaged()` in `api/access.ts`), ist der Schritt **nur Anzeige** („Die Personen kommen aus der Konfiguration“) und führt weiter.
- Im Container ohne Home Assistant (eigene Konten) gibt es keine HA-Personen: der Schritt entfällt, stattdessen der bestehende Konto-Ablauf (nicht anfassen).

### 3.3 Erster Wächter („Das haben wir bei dir gefunden“)

- Quelle: `GET /api/watchers/suggestions` (liefert `items` mit Vorlage, Entität, Begründung; siehe `server/src/watcher-templates.ts`, `detectSuggestions`). Ohne Verbindung zu Home Assistant (`ConflictError`) oder ohne Treffer: freundlicher Leerzustand „Wir haben noch nichts gefunden. Du kannst Wächter später unter Wächter einrichten.“ und weiter.
- Der **beste Treffer** (Reihenfolge: Waschmaschine, Trockner, Spülmaschine, Müll, Batterie, Rest; ggf. `watcher-templates.ts` um eine Rangzahl ergänzen) steht groß, mit der Regel als **Satz** (Vorhandene Texte aus `WatcherSummary.svelte` wiederverwenden) und dem **Probelauf der letzten 7 Tage** (`POST /api/watchers/dry-run`, Ergebnis wie im Wächter-Editor, `DryRunPanel.svelte`). Ist der Probelauf nicht möglich (kein Verlauf), die Zeile weglassen.
- Bis zu zwei weitere Treffer als Zeilen mit Schalter. Weitere stehen später unter Wächter › Gefunden (Hinweiszeile).
- Der Hauptknopf zählt mit („2 Wächter einschalten“). Ein Tipp legt die Wächter mit den **Vorlagen-Voreinstellungen** an (`POST /api/watchers`): Zuständige = „wer zu Hause ist, reihum“ unter den im Schritt davor gewählten Personen (ohne Kinder, außer es gibt nur Kinder), Board = erstes Board des Haushalts, Fairness-Zählung nach Board-Wert. Das ist dieselbe Logik wie „Einrichten“ in `FoundSheet.svelte`; **nicht neu erfinden, sondern die Einrichtung dort in eine gemeinsame Funktion auslagern** und von beiden Stellen nutzen.
- `metNow` (Bedingung schon erfüllt) in der Antwort von `POST /api/watchers`: **nicht fragen**, sondern die Vorlagen-Standards übernehmen (Pegel-Wächter legen die Karte sofort an, alle anderen nicht). Im Onboarding gibt es keine Rückfrage.
- Berechtigung: braucht das Recht `watchers` (Administratoren immer). Wer es nicht hat, überspringt den Schritt.

### 3.4 Testnachricht

- Zeigt die Mitteilung wie auf dem Sperrbildschirm (Titel „Waschmaschine fertig“ bzw. der Name des gewählten Wächters, Knöpfe Erledigt / Später), mit dem Vornamen der Person.
- Knopf „Testnachricht senden“ ruft `POST /api/push/test` auf (existiert; sendet bisher „Stups: Test“ mit dem Rückweg-Knopf nur bei ntfy). **Erweitern**: ein optionaler Body `{ kind: 'onboarding', title, body }` lässt die Vorschau-Texte senden, mit denselben Knöpfen wie eine echte Wächter-Nachricht (Erledigt, Später). Die Texte müssen in beiden Sprachen vorliegen und serverseitig die Sprache der Person nutzen.
- Fehlerfälle (jeweils mit klarer Anweisung statt Fehlermeldung): kein Push-Weg (`Für dich ist noch kein Push-Weg eingetragen`) → Hinweis „Öffne Home Assistant auf deinem iPhone und melde dich in der Companion App an“ mit Store-Links (Entscheidung 4) plus „Weiter ohne Test“. Nachricht nicht angekommen → „Prüfen“ und „Weiter ohne Test“. Die bestehende Diagnose („Warum kommt nichts an?“) wird verlinkt, nicht kopiert.
- Der Text „Wisch die Nachricht nach links und tippe auf Ansicht, dann erscheint Erledigt“ gehört dazu (iPhone-Eigenheit).

### 3.5 Fertig

- Haken-Übersicht: Personen, Wächter, Testnachricht (nur, was wirklich passiert ist; übersprungene Schritte erscheinen als „Später einrichten“ mit Link in die Einstellungen, nicht als Haken).
- Optionale nächste Schritte (nur diese zwei): **erste Aufgabe** per Schnell-Eingabe (vorhandenes Eingabefeld und Parser, siehe `NewCardSheet.svelte` und `lib/cardTitle.ts`; mit Chips wie im Mockup), „Dashboard-Knopf“ (Einstellungen › Dashboard und Kopfzeile, Bubble-Card-Knopf).
- Hauptknopf „Zu den Aufgaben“ setzt den Status `done` und öffnet den Reiter Aufgaben. Es gibt dort beim ersten Besuch keine zusätzlichen Hinweisblasen.

### 3.6 Mitglieder (keine Administratoren)

Beim ersten Start: nur zwei Bildschirme, **„Handy verbinden“** (zeigt, ob ein Gerät erkannt wurde; sonst die Anweisung wie in 3.4; Knopf „Testnachricht senden“) und **„Farbe wählen“** (bestehender `AccentPicker`). Kinder sehen nur „Handy verbinden“. Gleicher Statuswert pro Person.

## 4. Verhalten und Randfälle

- Fortschritt merken: Schritt und Auswahl **auf dem Server** (pro Person), damit ein Abbruch auf dem iPhone am Desktop weitergeführt werden kann. Beim Wiederöffnen springt es zum ersten nicht erledigten Schritt.
- Zurück-Pfeil in jedem Schritt außer dem ersten. Zurück verliert nichts.
- Offline: die Schritte brauchen den Server; bei fehlender Verbindung der bestehende „Offline“-Hinweis (`ui.online`), kein eigener Fehlerzustand.
- HA nicht erreichbar in Schritt 3 → Leerzustand, Weiter möglich.
- Doppeltes Antippen darf nichts doppelt anlegen (Wächter, Personen): die Knöpfe sperren sich während des Aufrufs (Muster: `busy.ts`).
- Sprache: folgt der Sprache der Person (`/api/me/language`); beide Sprachen testen.
- **Nichts am Datenbestand von Bestandsnutzern ändern.** Die Migration (Abschnitt 5) darf bestehende Personen auf `done` setzen.

## 5. Technische Umsetzung

Orientierung (alles Pfade im Repo):

- Server: Fastify in `packages/server/src`, Routen in `api/*.ts`, Datenschicht in `store/*.ts`, Migrationen in `migrations.ts` (die letzte ist **29**, die neue wird **30**; jede Migration läuft beim Start mit vorheriger Datenbanksicherung, Tests in `packages/server/test`).
- Web: Svelte 5 + Tailwind 4 in `packages/web/src`, Komponenten in `components/` (Grundbausteine in `components/ui/`: `Sheet`, `ListRow`, `Tile`, `Segmented`, …), Zustand in `lib/store.svelte.ts`, API-Aufrufe in `lib/api.ts`, Reiter in `lib/tabs.ts`.
- Desktop-Layout ab 1024 px: `Sidebar.svelte`, `DesktopHeader.svelte`; Fenster öffnen dort als zentrierter Dialog (`Sheet.svelte` regelt das).
- Wiederverwenden statt neu bauen: `FoundSheet.svelte` / `FoundHits.svelte` (Vorschläge), `DryRunPanel.svelte` (Probelauf), `WatcherSummary.svelte` (Regel als Satz), `AccentPicker.svelte`, `PeopleSheet.svelte` / `PersonDelivery.svelte` (Personen und Geräte), `NewCardSheet.svelte` (Schnell-Eingabe).

Vorgeschlagene Bausteine:

1. **Migration 30**: Spalte `onboarding` (Text, null) in der Tabelle der Personen (Name der Tabelle in `store/people.ts` nachsehen); Bestandspersonen auf `'done'` setzen. Der Server liefert sie in `/api/me` als `onboarding: 'done' | 'skipped' | null` und `needsOnboarding: boolean` (Berechnung nach 3.0, **serverseitig**, damit Web und Tests dieselbe Regel nutzen).
2. **`PUT /api/me/onboarding`** (`{ status: 'done' | 'skipped' }`) und **`DELETE`** zum Zurücksetzen („nochmal durchgehen“). Jede Person ändert nur den eigenen Status.
3. **Web**: neue Komponente `Onboarding.svelte` (Wurzel mit Fortschritt und Schritten) und je Schritt eine kleine Komponente (`OnboardingWelcome`, `OnboardingPeople`, `OnboardingWatcher`, `OnboardingTest`, `OnboardingDone`, `OnboardingMember`). Eingehängt in `App.svelte` **vor** den Reitern, solange `needsOnboarding` gilt. Die Auswahl (gewählte Personen, Wächter) liegt in einem kleinen Store (`lib/onboarding.svelte.ts`), die Logik in reinen Funktionen (`lib/onboarding.ts`) mit Vitest-Tests.
4. **Auslagern**: die Einrichtung aus einem Treffer („Einrichten“ in `FoundSheet`) in `lib/watcherFromHit.ts`, genutzt von `FoundSheet` und dem Onboarding.
5. **Server**: `POST /api/push/test` erweitern (3.4), Test im bestehenden Testmuster.
6. **Einstellungen**: Eintrag „Einrichtung nochmal durchgehen“ unter Hilfe und Daten.

## 6. Texte und Übersetzung

- Alle sichtbaren Texte laufen durch `t('…')` (Deutsch ist der Schlüssel), Englisch in `packages/web/src/lib/i18n/en.ts` und auf dem Server unter `packages/server/src/i18n`. Es gibt einen Test, der fehlende Übersetzungen findet; er muss grün bleiben.
- Wortliste: sagen: „Person“, „Handy“, „Wächter“, „Karte/Aufgabe“, „Haus“. **Nicht sagen**: Entität, Notify-Dienst, Integration, Board (in diesem Ablauf), Rotation (stattdessen „reihum“), YAML.
- Ton: freundlich, kurz, „du“. Keine Ausrufezeichen-Häufung, keine Emojis in der Oberfläche.
- Mockup-Texte sind die Vorlage, dürfen aber verbessert werden. Aussagen müssen stimmen (zum Beispiel „Probelauf: 4× in 7 Tagen“ nur mit echten Zahlen).

## 7. Tests (Pflicht)

- **Vitest (Server)**: Migration 30; `needsOnboarding` (neue Installation: ja; Bestandspersonen: nein; nach `done`/`skipped`: nein; verwaltete Konfiguration; Container ohne HA); `PUT/DELETE /api/me/onboarding` nur für die eigene Person; erweiterter Testpush.
- **Vitest (Web)**: reine Funktionen (Auswahl, Reihenfolge der Treffer, Fortschritt, nächster offener Schritt).
- **Playwright (`e2e/`)**: ein Test pro Pfad: (a) Administrator, alles durchlaufen bis „Zu den Aufgaben“; (b) überspringen im ersten Schritt; (c) Abbruch und Wiederaufnahme beim richtigen Schritt; (d) Mitglied sieht nur „Handy verbinden“ und „Farbe“; (e) Bestandsinstallation sieht es nicht. Desktop (≥1024 px) **und** Handy, Hell und Dunkel (die vorhandenen Projekte in `e2e/playwright.config.ts` nutzen). Tests dürfen **nicht vom Wochentag oder von der Uhrzeit abhängen** (diese Falle hat die CI schon zweimal rot gemacht).
- Lokal nur die betroffenen e2e-Dateien laufen lassen (`npx playwright test <datei> --trace off`); vorher einmal `pnpm -r build`. Die vollständige Suite läuft in der CI.
- Vor jedem Commit: `pnpm lint && pnpm typecheck && pnpm test`.

## 7a. Abnahme

Fertig, wenn: (1) alle Leitregeln aus Abschnitt 1 nachweisbar erfüllt sind, (2) die Pfade aus Abschnitt 7 grün sind, (3) auf dem Handy und am Desktop in der Beta ein frisches Konto in unter drei Minuten bis „Zu den Aufgaben“ kommt, (4) Bestandsnutzer nichts davon sehen, (5) Doku aktualisiert ist (Abschnitt 9).

## 8. Arbeitsweise im Projekt (verbindlich)

- Immer auf Branch **`beta`** arbeiten, nach `beta` pushen. **Nie** nach `main` oder `release` pushen: Das Veröffentlichen entscheidet der Projektinhaber.
- Jede fertige Änderung bekommt eine neue Beta-Version: `version` in `stups-beta/config.yaml` (`X.Y.Z-beta.N`, nur N erhöhen) und ein Eintrag oben in `stups-beta/CHANGELOG.md` (Deutsch, ein Eintrag je Nummer). Die stabile Version und `stups/CHANGELOG.md` fasst der Projektinhaber beim Release an.
- Commit-Nachrichten auf Deutsch, knapp. Kein Modellname in Commits, Code oder Texten.
- Die CI (ca. 20 Minuten) prüft Lint, Typen, Tests, Build und Browser-Tests und baut danach das Beta-Image. Erst wenn sie grün ist, lässt sich in Home Assistant aktualisieren. Schlägt sie fehl: `gh run view <id> --log-failed`, Ursache beheben, nächste Beta-Nummer.
- Sparsam arbeiten: kurze Aufträge an Unter-Agenten (höchstens einer gleichzeitig), wenige Screenshots, nur betroffene e2e-Tests lokal.
- Datenbank-Migrationen sind **nur vorwärts**. Vor einem Release mit Migration empfiehlt der Projektinhaber ein HA-Backup.
- Nicht anfassen ohne Rückfrage: Lizenz, Release-Workflow (`.github/workflows/ci.yml`), bestehende Migrationen.

## 9. Dokumentation

- `stups/DOCS.md` (Englisch, maßgeblich) und `stups/DOCS.de.md`: Abschnitt „Setup“ um das Onboarding ergänzen, Abschnitt „Settings › Help and data“ um „Einrichtung nochmal durchgehen“.
- `README.md` / `README.de.md`: Installationsabschnitt um einen Satz erweitern („Beim ersten Start führt dich Stups in drei Minuten durch die Einrichtung“).
- `docs/testliste.md`: Prüfpunkte fürs Handy (Testnachricht kommt an, Erledigt-Knopf, Abbruch und Wiederaufnahme).
- `docs/entwicklung.md`: kurzer Abschnitt, wie `needsOnboarding` berechnet wird.

## 10. Entschieden (vom Projektinhaber)

1. **Reihenfolge: Personen zuerst, dann Wächter.** Grund: Der Wächter kann die gewählten Personen direkt als Zuständige bekommen.
2. **Keine Haus-Ansage im Onboarding** (auch nicht für Kinder ohne Handy). Haus-Kanäle bleiben in den Einstellungen; im Schritt „Fertig“ **entfällt** deshalb der Eintrag „Kind einrichten“ (Abschnitt 3.5).
3. **Die Testnachricht ist überspringbar**, auch wenn ein Handy erkannt wurde. Es bleibt bei „Ohne Test weiter“.
4. **Personen ohne Handy bekommen einen Link zur Home-Assistant-Companion-App** im App Store (iPhone) bzw. bei Google Play (Android), statt einer Einladung in Stups. Wo ein Handy fehlt (Schritt „Wer wohnt hier?“ bei „Kein Handy gefunden“ und Schritt „Testnachricht“ bei fehlendem Push-Weg), steht ein kleiner Link „Companion App installieren“ mit beiden Stores. Er öffnet außerhalb der App (`target="_blank"`, siehe 1.27.1). Personen, die noch nicht in Home Assistant stehen, werden **nicht** eingeladen; das legt man weiterhin in Home Assistant an.

Weitere Fragen, die beim Bauen auftauchen: kurz beim Projektinhaber nachfragen, nicht raten.
