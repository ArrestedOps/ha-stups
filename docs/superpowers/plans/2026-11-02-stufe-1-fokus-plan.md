# Stufe 1 (Fokus und Feinschliff): Umsetzungsplan

Spec: [../specs/2026-11-02-stufe-1-fokus-design.md](../specs/2026-11-02-stufe-1-fokus-design.md). Fünf Releases, jedes testgetrieben: erst der Test (rot), dann der Code (grün), dann aufräumen. Pro Release: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`, Changelog, Version, Commit, Push, grüne CI, danach Aktualisieren (ab 1.10.0 zuerst Beta, danach nach deiner Freigabe die normale App).

Gewohnte Regeln: Add-on `stups` nie deinstallieren, Slug nie ändern, keine Migration ohne Migrationstest, Sicherung vor jeder Migration, kein Force-Push. Wegen der bekannten Wackler in der vollen lokalen Browser-Testreihe (`5-people.spec.ts:102` fällt dort auch auf 1.7.0 aus, einzeln läuft er) gilt die CI als Prüfstand; neue Browser-Tests laufen einzeln und in der Reihe.

---

## Release 1.9.0: Docker als Beta kennzeichnen, Beta-Kanal

Direkt nach `main`, weil es den Kanal erst anlegt.

### A. Kanal im Server (testgetrieben)

- [ ] **Test** `runtime.test.ts`: `STUPS_CHANNEL=beta` → `runtime.channel === 'beta'`; fehlt es oder ist es ungültig → `'stable'`; gilt auch im Add-on-Modus (Add-on ignoriert sonst alle `STUPS_*`, diese Variable ist Teil des Images und nicht Nutzer-Option).
- [ ] `runtime.ts`: `channel`; `Capabilities.channel` (`'stable' | 'beta'`), Web-Typ nachziehen; `capabilities.test.ts` anpassen.
- [ ] **Test** `sensors.test.ts` (neu oder in `events-sensors.test.ts`): Beta schreibt `sensor.stups_beta_…` mit „Stups Beta …"; normal unverändert.
- [ ] `sensors.ts`: Präfix und Anzeigename aus dem Kanal.
- [ ] **Test** `automation-cards.test.ts`: Beta hört auf `stups_beta_create_card`, nicht auf `stups_create_card`; normal umgekehrt.
- [ ] `automation-cards.ts`: Ereignisname aus dem Kanal (`EVENT_TYPE` wird Funktion); Diagnose/Texte nennen den richtigen Namen.
- [ ] **Test** `notifications.test.ts`/`push.test.ts`/`ntfy.test.ts`: Titel tragen in der Beta `Beta · `; Aktions-Kennungen heißen `STUPS_BETA_…`; `handleAction` der normalen App ignoriert `STUPS_BETA_…` und umgekehrt (kein Fehler, kein Effekt).
- [ ] `notifications.ts`, `push.ts`, `ntfy.ts`, `main.ts`: Präfix/Titel durchreichen. Alle Orte, die `STUPS_…`-Kennungen bauen oder lesen, per `Grep` finden und in der Testliste eintragen.

### B. Torwächter für Push und Wächter in der Beta

- [ ] **Test** (neu `beta-gate.test.ts`): `betaPush=off` → nichts wird gesendet, Rückgabe „nicht zugestellt" mit Grund; `only:<id>` → nur diese Person; `all` → alles; Tageszusammenfassung geht durch dasselbe Tor; in der normalen App ist das Tor ein No-op. `betaWatchers=off` → Wächter laufen nicht, beim Umschalten starten/stoppen sie.
- [ ] `beta-gate.ts`: `gatePush(gateway, settings)`, Wächter-Schalter; Einstellungen `betaPush`, `betaWatchers` in `settings` (Vorgabe `off`).
- [ ] **Test** API: nur Administratoren dürfen die Einstellungen ändern, nur in der Beta; `GET /api/settings` liefert sie nur in der Beta.
- [ ] `api.ts`, `main.ts`: Tor um das `PushGateway`; Wächter-Start abhängig von `betaWatchers`.
- [ ] Oberfläche (`SettingsSheet.svelte`): in der Beta oben das Band „Beta" mit den zwei Einstellungen (Push: Aus / Nur für mich / An; Wächter: Aus / An) und einem Hinweis, solange etwas aus ist. Web-Test für die Anzeige-Logik; Browser-Test im Projekt `dunkel` ist nicht möglich (Server nicht im Beta-Modus) → Mini-Server-Variante `e2e/server-beta.mjs` mit `STUPS_CHANNEL=beta`, Projekt `beta`, ein Test für Band und Umschalten.

### C. Beta-App-Dateien

- [ ] **Test** `addon-files.test.ts` erweitern (siehe Spec 4.2): Slugs, `arch`, `ingress`, Bildnamen, Versionsformen, gleiche `options`/`schema`, Übersetzungen, verschiedene Panel-Titel, Dateien vorhanden (`icon.png`, `logo.png`, `DOCS.md`, `CHANGELOG.md`, `translations/de.yaml`). Zuerst rot.
- [ ] `stups-beta/` anlegen (Dateien nach Spec); Skript `e2e/make-beta-icon.mjs` erzeugt `icon.png`/`logo.png` mit „BETA"-Band aus `stups/icon.png` bzw. `logo.png` (Playwright rendert ein Banner-HTML). **Du siehst die Bilder, bevor es raus geht.**
- [ ] `stups/Dockerfile`: `ARG STUPS_CHANNEL=stable` → `ENV STUPS_CHANNEL`.

### D. CI

- [ ] `ci.yml`: Auslöser `main` und `beta`; Kanal aus dem Branch; `image` baut je Kanal die richtigen Tags und Argumente; `manifest` nur für `main`. Vorsichtshalber ein Kanal-Check am Anfang jedes Image-Jobs (bricht ab, wenn die Version in `stups-beta/config.yaml` keinen `-beta.` enthält oder die in `stups/config.yaml` einen).
- [ ] Lokale Prüfung der Datei mit `actionlint` (über `npx`/Docker, falls verfügbar), sonst sorgfältiges Lesen. Der erste echte Lauf ist der Test.

### E. Dokumentation

- [ ] README und `docs/docker.md`: Kasten **„Beta"** am Anfang; Absatz „Sicherheit" (nicht ohne HTTPS und Reverse-Proxy ins Internet, regelmäßig aktualisieren, Datenordner sichern). README: Abschnitt „Beta testen" mit der Adresse `https://github.com/ArrestedOps/ha-stups#beta` (Knopf „Zu Home Assistant hinzufügen" für beide Adressen) und dem Hinweis, im Store nur „Stups (Beta)" zu installieren.
- [ ] `docs/entwicklung.md`: Ablauf mit Beta (Spec 4.2), Datenkopie und Erneuern, Namen der Ereignisse/Sensoren in der Beta, Wie gibt man frei (Version auf `beta` erhöhen, Merge nach `main`).
- [ ] `docs/testliste.md`: neuer Abschnitt Beta (Installieren über `#beta`, Daten kopieren, Push/Wächter gezielt einschalten, Sensoren/Titel „Beta", die normale App bleibt unberührt, Aktionsknöpfe der Beta wirken nicht in der normalen App).
- [ ] `stups/CHANGELOG.md` 1.9.0, `stups/config.yaml` 1.9.0, `stups-beta/config.yaml` `1.9.0-beta.1`, `stups-beta/CHANGELOG.md`.

### F. Veröffentlichen

1. Alles lokal grün. Eine Sicherung des Stups-Add-ons brauchen wir nicht (keine Migration), aber du entscheidest.
2. Commit. **Zuerst** `git push origin HEAD:beta` (legt den Branch an, baut `ha-stups-beta-{arch}:1.9.0-beta.1`), grüne CI abwarten.
3. Dann `git push origin main`, grüne CI (Tests, Images, Manifest), normale App in Home Assistant aktualisieren.
4. In Home Assistant die zweite Adresse hinzufügen, **Stups (Beta)** installieren, Daten per Umzug kopieren, Abschnitt Beta der Testliste durchgehen.

---

## Release 1.10.0: Kompakte Karten und kleine Ärgernisse (zuerst Beta)

Auf Branch `beta` entwickeln; `stups-beta/config.yaml` `1.10.0-beta.N`.

### A. `SelectField` (Grundlage für 1.4, deshalb zuerst)

- [ ] **Test** (`packages/web/test/` oder Komponententest im Browser-Projekt): sichtbarer Wert und Chevron, nativer `<select>` darüber (durchsichtig, volle Fläche, gleiche `aria-label`), Änderung ruft `onchange`, deaktiviert, Platzhalter.
- [ ] `SelectField.svelte` (Props: `value`, `options`, `label`, `onchange`, `disabled`, `align`).
- [ ] Ersetzen, jeweils mit den vorhandenen Browser-Tests als Netz: `WatcherSheet` (alle), `RecurrenceEditor`, `BoardSettings`, `SettingsSheet` (Dashboard), `CardProps` (Vorab-Erinnerung, Status-Chip).
- [x] **Bestandsaufnahme** der Formularelemente in allen Sheets (erledigt in 1.10.0):

  | Element | Wo | Ergebnis |
  |---|---|---|
  | `<select>` | Wächter (9), Wiederholung (3), Board-Einstellungen, Einstellungen › Dashboard, Erinnerung | **ersetzt** durch `SelectField` (Wert und Pfeil, nativer Picker darüber) |
  | `<select>` (Status-Chip) | `CardProps` | bleibt: eigenes Chip-Muster, war schon einheitlich |
  | `datetime-local`, `time` | Fälligkeit, Wächter (Uhrzeit), Personen (Ruhezeit) | **bleiben** nativ (iOS-Rädchen, wirken nativ) |
  | `number` | Wiederholung (Abstand) | bleibt (Zahlentastatur), gestylt wie die übrigen Felder |
  | `checkbox` | Einstellungen, Wächter, Beta | bleiben (mit Akzentfarbe) |
  | Text, Textbereich, Suche | überall | gestylt, nichts zu tun |
  | Auswahl in Zeilen (Radio, Chips) | Zuweisung, Priorität, Kategorien | eigene Knöpfe, schon einheitlich |

### B. Kompakte Karten

- [ ] **Test (rot):** `e2e/14-kompakt.spec.ts` mit der Ansicht eines iPhone 15 (393×852), Board mit 6 typischen Karten (Titel, Termin, Person, Kategorie): mindestens 4 Karten vollständig sichtbar über der Leiste; Titel höchstens zwei Zeilen; jede Karte hat höchstens eine Meta-Zeile (Höhe); überfälliger Termin ist rot; keine Zeile „Angelegt …" in der Liste.
- [ ] `CardItem.svelte` umbauen (Spec 4.3). Neue kleine Hilfsfunktion `cardMeta(card)` in `lib/` (reine Logik: welche Einträge, in welcher Reihenfolge, Priorität → Farbe) mit **Unit-Test** (`packages/web/test/cardMeta.test.ts`).
- [ ] Agenda- und Kalender-Zeilen prüfen; gleiche Dichte, gleiche `cardMeta`.
- [ ] Bestehende Tests anpassen: `1-board.spec.ts:231` (Angelegt in der Liste → im Karten-Fenster), `card-created` aus Selektoren.
- [ ] Screenshots neu (`node e2e/screenshots.mjs`), README-Bilder aktualisieren.

### C. Ärgernisse

- [ ] **Test:** letzte Karte lässt sich über den „+"-Knopf hinaus scrollen (Abstand), in Board, Agenda, Kalender, Wächter.
- [ ] Abstand unten (gemeinsame Klasse/Variable für Knopf + Leiste + Safe-Area).
- [ ] **Test:** Spalten-Tabs und Filter-Chips mit Überlauf zeigen den Verlauf am Rand; die aktive Auswahl liegt im sichtbaren Bereich nach dem Wechsel und nach dem Laden.
- [ ] Verlauf (`ScrollFade`-Hilfe) und `scrollIntoView` in `ColumnTabs.svelte`, `ScheduleFilterBar.svelte`, weitere waagerechte Leisten (per `Grep` auf `overflow-x`).
- [ ] **Test:** Im Karten-Fenster heißt der Knopf „Fertig"; die Anzeige „Gespeichert" bleibt. `CardSheet.svelte`; `Speichern` in anderen Formularen unverändert.

### D. Doku und Veröffentlichung

- [ ] Changelog 1.10.0 (Beta zuerst als `1.10.0-beta.1`), Testliste (kompakte Karten am echten iPhone: 4 Karten, Lesbarkeit, Wischen/Menü, Dunkel/Hell; Auswahlfelder; Chips scrollen).
- [ ] Auf `beta` pushen, CI grün, in der Beta aktualisieren. **Du testest und gibst frei.**
- [ ] Nach Freigabe: `stups/config.yaml` auf 1.10.0 (auf `beta`), Merge nach `main` (schneller Vorlauf), CI grün, normale App aktualisieren.

---

## Release 1.11.0: Schnell-Eingabe (zuerst Beta)

### A. Parser (reine Logik, zuerst und ausführlich)

- [ ] Tabelle der Testfälle schreiben (aus der Spec abgeleitet) **vor** dem Code: pro Regel Eingabe → erwartetes Ergebnis mit festem `now` und Zeitzone `Europe/Berlin`. Gruppen: Datum (alle Schreibweisen), Wochentage (Wochentag = heute, später in der Woche, nächste Woche), Monatsende („in einem Monat" am 31.1.), Schaltjahr (29.2.), Jahreswechsel („1.1." am 30.12.), Sommerzeit-Wochenenden (Uhrzeit bleibt 19:00 vor und nach der Umstellung), Uhrzeit-Formen, Standard-Uhrzeit, Wiederholungen, Priorität (`!`, `!!`, „wichtig", „Achtung!"), `@Person` (eindeutig, mehrdeutig, unbekannt, Groß/klein), `#Kategorie` (bekannt, unbekannt, mit Umlaut), Titel (Reste, Zahlen wie „2 Kisten", Satzzeichen, mehrere Leerzeichen), Zurücknehmen (`ignore`), leerer Titel.
- [ ] `lib/quickadd/` mit `dictionary/de.ts`, `dates.ts`, `times.ts`, `recurrence.ts`, `tokens.ts`, `index.ts`. Tests grün machen, Regel für Regel.
- [ ] Wörterbuch-Test: Alle Schlüssel kommen in jeder Sprachdatei vor (Grundlage für Englisch in Stufe 2).

### B. Einstellung

- [ ] **Test** API: `defaultDueTime` in `settings` (Vorgabe `09:00`, Format `HH:MM`, nur Administratoren); `GET /api/settings` liefert sie.
- [ ] Server und `SettingsSheet.svelte` (Abschnitt „Vorgaben").

### C. Oberfläche

- [ ] **Browser-Test (rot):** `e2e/15-schnelleingabe.spec.ts`: Eingabe `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !` → Chips, hervorgehobener Text, Eigenschaftschips darunter, nach „Anlegen" stimmt die Karte (Titel, Termin, Zuständige, Kategorie, Wiederholung, Priorität). Chip antippen nimmt zurück. Handänderung eines Wertes gewinnt. Unbekannte Kategorie fragt nach (Ja/Nein). Unbekannte Person bleibt als Warnchip sichtbar und erzeugt keine stille Karte ohne Zuständige.
- [ ] `QuickLine.svelte` (Spiegel-Ebene, durchsichtiges Feld) und `QuickChips.svelte`; Einbau in `NewCardSheet.svelte`; Aufräumen im Sheet: Titelfeld → Schnell-Zeile mit `aria-label="Titel"`.
- [ ] Prüfen auf dem iPhone-WebKit: Cursor, Auswahl, Zoom (Schrift ≥ 16 px), Autokorrektur aus, Umlaute, Zeilenumbruch.

### D. Doku und Veröffentlichung

- [ ] Changelog, DOCS.md (Bedienung mit Beispielen), Testliste, README-Kurzhinweis; Beta, Freigabe, Release wie oben.

---

## Release 1.12.0: `store.ts` und `api.ts` aufteilen (zuerst Beta)

- [ ] **Test (rot, dann grün):** `store-shape.test.ts` listet alle Methodennamen von `createStore` (aus dem heutigen Objekt erzeugt und eingecheckt). Gleiches für die Route-Tabelle von `apiRoutes` (Methode + Pfad aus `app.printRoutes` o. ä.).
- [ ] `store/context.ts` (Datenbank, Hilfen, Transaktion, Uhr, `touch` als No-op für jetzt).
- [ ] Themen herausziehen, **eins pro Commit**, danach alle Server-Tests: Kategorien → Boards/Spalten → Personen/Zugriff → Benachrichtigungen → Stupse → Wächter → Karten → Abschluss/Wiederholung. Wo Themen sich gegenseitig brauchen, über den Kontext, nicht über Importe im Kreis.
- [ ] `api/`: Routen-Dateien je Thema, gemeinsamer Kontext für `body`, `noContent`, Fehlerbehandlung.
- [ ] Danach: `store.ts`/`api.ts` bestehen nur noch aus dem Zusammenbau. Keine Funktionsänderung; Diff in Commits lesbar (Verschieben ohne Umschreiben).
- [ ] Doku (`entwicklung.md` Aufbau), Changelog („unter der Haube"), Beta, Freigabe, Release.

## Release 1.13.0: Live-Sync mit Änderungen (zuerst Beta)

- [ ] **Messung vorher:** `4-perf.spec.ts` erweitern (300 Karten **mit Fotos**; ein zweiter Browser sieht eine Änderung; Zeit und übertragene Bytes). Zahlen festhalten.
- [ ] **Tests (rot):** `store`-Unit-Tests: Jede schreibende Methode meldet die richtige Änderung (`kind`, `id`, `op`, `boardId`); Bus: eine Nachricht je Anfrage (nicht je Änderung), `seq` lückenlos; Hintergrundaufgaben (Wiederholung, Wächter, Tick) senden ebenfalls.
- [ ] `store/context.ts`: `touch(kind, id, boardId)` sammelt; `bus.flush()` am Ende der Anfrage (`onResponse`) und in Hintergrundaufgaben.
- [ ] Neue Route `GET /api/cards?ids=…` (geprüfter Zugriff, höchstens 50 Kennungen). **Test:** Zugriff, unbekannte Kennungen, Reihenfolge.
- [ ] Client (`sync.ts`, `store.svelte.ts`): Änderungen einarbeiten; Rückfall auf Neuladen bei unbekannter Art, mehr als 50, Lücke in `seq`, `hello` nach Wiederverbinden. **Browser-Test:** zwei Browser, Karte ändert sich → zweites Gerät aktualisiert sich ohne Board-Neuladen (Netzwerk-Mitschnitt), Löschen, Verschieben, Spaltenumbenennung (Neuladen-Pfad), Verbindungsabbruch → Neuladen.
- [ ] **Messung nachher**, Zahlen in den Changelog.
- [ ] Doku, Beta, Freigabe, Release.

---

## Ablauf nach jedem Release

- Testliste um die neuen Prüfpunkte ergänzen (am echten iPhone).
- Offene Punkte und Messwerte im Changelog bzw. in `docs/entwicklung.md`.
- Auswertung der Beta vor dem Merge: keine Fehler im Protokoll der Beta, Sensoren/Titel „Beta" eindeutig, normale App unberührt.
