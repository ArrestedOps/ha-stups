# Stufe 1: Fokus und Feinschliff (Nachtrag zur Spec)

Stand 02.11.2026, Ausgangslage Stups 1.8.0. Grundlage ist das Briefing „Stups ausbauen" (Stufe 1). Dieses Dokument hält fest, **wie** wir es umsetzen, was beim Lesen des Codes anders war als im Briefing angenommen, und was in der Klärung entschieden wurde. Stufe 2 und 3 bekommen eigene Nachträge, wenn sie dran sind.

## 1. Ziel

Stups fühlt sich im Alltag wie eine native iPhone-App an, und neue Versionen gefährden keine Daten mehr. Alles Bestehende bleibt, wie es ist, sofern hier nicht ausdrücklich etwas geändert wird. Das Add-on `stups` (Slug) und seine Daten bleiben unberührt; es wird nie deinstalliert.

## 2. Entscheidungen aus der Klärung

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Beta mit echten Daten | Einmal-Kopie über den vorhandenen Umzug. **Push und Wächter sind in der Beta nach dem Import aus**, damit die Familie nichts doppelt bekommt. Gezieltes Einschalten durch einen Administrator (siehe 4.2) |
| 2 | Kartenansicht | **Nur noch kompakt.** Keine Einstellung „ausführlich / kompakt" |
| 3 | Schnell-Eingabe | **Nur im Fenster „Neue Karte".** Ein Feld direkt im Board ist ausdrücklich zurückgestellt |
| 4 | Wie sieht die Beta Home Assistant? | **Branch `beta` mit eigener Repository-Adresse** `https://github.com/ArrestedOps/ha-stups#beta` (siehe 4.2). Home Assistant erlaubt `#Branch` an der Adresse; dieselben Apps aus einem anderen Branch gelten dort als andere Apps (laut Entwicklerdokumentation) |

## 3. Was beim Lesen des Codes anders war als im Briefing

1. **Beta und Home Assistants Store.** Home Assistant liest die App-Liste aus dem Standard-Branch. Eine neue Beta-Version wäre ohne weiteres erst nach dem Merge nach `main` sichtbar, also zu spät. Lösung: die zweite Repository-Adresse mit `#beta` (Entscheidung 4). Folge: Im Store erscheint aus dieser Adresse auch ein zweites „Stups" (anderer Hash, anderes `/data`). Das wird in der Anleitung ausdrücklich gesagt: **nur „Stups (Beta)" installieren**.
2. **Doppelte Benachrichtigungen durch Gleichnamigkeit.** Beta und normale App teilen sich Home Assistant: die Ereignisse `stups_create_card` und `mobile_app_notification_action`, die Sensor-Namen und die Companion-App-Geräte. Ohne Trennung würden beide Apps auf dieselben Ereignisse reagieren (eine Beta mit kopierten Karten würde „Erledigt"-Taps der normalen App mit verarbeiten). Siehe 4.2: Alles bekommt in der Beta einen eigenen Namen.
3. **Auswahlfelder.** Es gibt keine eigene Auswahl-Komponente „wie überall sonst". Es gibt ein Muster: In `CardProps.svelte` liegt über dem Status-Chip ein durchsichtiges natives `<select>` (der iOS-Picker öffnet sich, der Chip bestimmt das Aussehen). Rund 17 weitere Stellen (`WatcherSheet`, `RecurrenceEditor`, `BoardSettings`, `SettingsSheet`, Erinnerung in `CardProps`) nutzen dagegen ein sichtbares, ungestyltes `<select>`. Lösung in 4.4: **eine** Komponente `SelectField`, die das Muster verallgemeinert (nativer Picker bleibt, Aussehen einheitlich).
4. **Prioritäten.** Es gibt `low`, `medium`, `high` (nicht nur „Hoch"). In der Liste erscheinen `medium` und `high`.
5. **`store.ts`** hat inzwischen 2.629 Zeilen (nicht 2.860), `api.ts` 795.
6. **Gemeinsamer Code für `stups_create_card`.** Der Parser der Schnell-Eingabe läuft im Browser (Live-Vorschau). Damit der Server ihn auch nutzen könnte, bräuchte es ein neues gemeinsames Paket (Workspace, Build, Dockerfile, CI). Das ist nicht „ohne großen Aufwand". **Zurückgestellt:** Der Parser liegt framework-frei in `packages/web/src/lib/quickadd/` und lässt sich später in ein gemeinsames Paket verschieben.

## 4. Design

### 4.1 Docker-Betrieb einfrieren (1.1)

- README und `docs/docker.md`: deutlich als **Beta** gekennzeichnet (eigener Kasten am Anfang), mit einem Absatz „Sicherheit": nie ohne HTTPS und Reverse-Proxy ins Internet stellen, regelmäßig aktualisieren, Datenordner sichern.
- Keine neuen Container-Funktionen. Was neue Funktionen im Container nicht ohne Zusatzaufwand mitmacht, meldet `/api/capabilities` ab; die Oberfläche blendet es aus.
- Keine Code-Änderung außer dem, was die Stufe-1-Aufgaben ohnehin berühren.

### 4.2 Beta-Kanal (1.2)

**Dateien**

- `stups-beta/config.yaml`: `name: "Stups (Beta)"`, `slug: stups_beta`, `image: ghcr.io/arrestedops/ha-stups-beta-{arch}`, `ingress: true`, `panel_title: "Stups Beta"`, eigenes `panel_icon`, gleiches `arch`, gleiche `options`/`schema` wie `stups`. Versionen der Form `1.10.0-beta.3`.
- `stups-beta/icon.png`, `logo.png`: das Stups-Symbol mit „BETA"-Band (aus dem Original erzeugt, Skript im Repository, damit es wiederholbar ist).
- `stups-beta/translations/de.yaml`, `DOCS.md`, `CHANGELOG.md`: übersetzt/kurz, mit Hinweis „Beta-Version, siehe Changelog der normalen App".
- `stups/Dockerfile` wird wiederverwendet: neues Build-Argument `STUPS_CHANNEL` (Vorgabe `stable`), im Image als `ENV STUPS_CHANNEL`.

**Verhalten der Beta** (alles hängt an `STUPS_CHANNEL=beta`, das das Image mitbringt; es ist keine Nutzer-Option und wirkt auch im Add-on-Betrieb)

| Bereich | normal | Beta |
|---|---|---|
| Push-Titel | `Stups`, Kartentitel, … | `Beta · …` |
| Sensoren | `sensor.stups_…` | `sensor.stups_beta_…`, Anzeigename „Stups Beta …" |
| Ereignis für Automationen | `stups_create_card` | `stups_beta_create_card` |
| Aktions-Kennungen der Push-Knöpfe | `STUPS_…` | `STUPS_BETA_…`; jede App verarbeitet nur die eigenen |
| Panel | `Stups` | `Stups Beta` mit eigenem Symbol |
| Oberfläche | – | gut sichtbares Band „Beta" oben in den Einstellungen und ein Hinweis, solange Push oder Wächter aus sind |
| Daten | `/data` des Add-ons | eigenes `/data` (anderer Slug) |

**Push und Wächter in der Beta.** Zwei Einstellungen in der Datenbanktabelle `settings` (kein Schema-Umbau, keine Migration), nur für Administratoren, nur in der Beta sichtbar:

- `betaPush`: `off` (Vorgabe), `only:<personId>` („nur für mich", die Person, die es einstellt) oder `all`.
- `betaWatchers`: `off` (Vorgabe) oder `on`.

Durchgesetzt wird auf dem Server: Ein Torwächter um das `PushGateway` (`main.ts`), der bei `off` nichts sendet und bei `only:` nur an diese Person; der Wächter-Betrieb (`watchers.start()`) startet nur bei `on` und reagiert beim Umschalten. Zeitgesteuerte Zusammenfassungen laufen durch dasselbe Tor. Der Torwächter ist auf dem Server und nicht in der Oberfläche, weil sonst ein offenes Browserfenster fehlt, das ihn „einschaltet".

**Datenkopie.** Export in der normalen App (Einstellungen › Umzug) nach `/share/stups-umzug`, die Beta übernimmt ihn beim ersten Start (vorhandener Mechanismus für eine App ohne eigene Daten). **Erneuern** heißt: Beta (und nur die Beta!) deinstallieren, neu exportieren, Beta neu installieren. Das steht in der Anleitung mit dem Hinweis, die Apps am Namen zu unterscheiden.

**CI** (`.github/workflows/ci.yml`)

- Auslöser: `push` auf `main` **und** `beta`.
- `test`: unverändert für beide Branches.
- `image`: Kanal aus dem Branch. `main` → Tags `ha-stups-{arch}:<Version aus stups/config.yaml>` und `:latest`. `beta` → Tags `ha-stups-beta-{arch}:<Version aus stups-beta/config.yaml>` und `:latest`, mit `--build-arg STUPS_CHANNEL=beta`. **Nie** baut `beta` die normalen Images und nie `main` die Beta-Images.
- `manifest` (`ghcr.io/arrestedops/stups`, nur für den Container) bleibt auf `main` beschränkt.

**Ablauf (Zielzustand)**

1. Änderung auf Branch `beta`, Version in `stups-beta/config.yaml` erhöhen (`X.Y.Z-beta.N`), pushen. CI baut das Beta-Image.
2. In Home Assistant über die Adresse `…#beta`: „Nach Updates suchen", **Stups (Beta)** aktualisieren, testen (mit kopierten Daten, Push/Wächter nach Bedarf gezielt an).
3. Nach deiner Freigabe: auf `beta` die normale Version in `stups/config.yaml` erhöhen und den Changelog schreiben, Merge nach `main` (schneller Vorlauf, ohne neue Änderungen). CI baut die normalen Images und das Manifest.
4. In der normalen App aktualisieren (nach Sicherung bei Migrationen). Danach `main` zurück nach `beta` mergen, falls dazwischen etwas auf `main` landete.

**Das allererste Release (1.9.0)** geht direkt nach `main`, weil es den Kanal erst anlegt. Reihenfolge: erst den Branch `beta` auf denselben Stand pushen (damit das Beta-Image `1.9.0-beta.1` existiert), dann `main` pushen. Sonst zeigt der Store auf `main` eine Beta, deren Image fehlt.

**Test `addon-files.test.ts`** deckt beide Apps ab: Slugs fest (`stups`, `stups_beta`), Architekturen, `ingress`, Bildnamen (normal ohne `beta`, Beta mit), Version (normal `x.y.z`, Beta `x.y.z-beta.n`), gleiche `options`/`schema` in beiden, Übersetzungen nennen nur vorhandene Optionen, Panel-Titel verschieden.

### 4.3 Kompakte Karten (1.3)

`CardItem.svelte` (Listen in Boards). Agenda (`AgendaView`) und Kalender prüfen und angleichen, falls sie eigene Zeilen haben.

- **Zeile 1:** Erledigen-Kreis, Titel (höchstens **zwei** Zeilen, `line-clamp`), Zuständige, Menü. Weniger vertikaler Abstand (`py-3` statt `py-4`).
- **Zeile 2 (nur wenn etwas da ist), eine Zeile ohne Umbruch:** Termin (Uhr + Text, rot bei überfällig, „Überfällig ·" entfällt, die Farbe genügt), Wiederholungs-Symbol (ohne Text), Priorität (Flagge: `medium` bernstein, `high` rot), Checkliste „1/2", Link-, Anhang- und Kommentar-Symbol mit Zahl, Kosten (nur wenn gesetzt), Wächter-Auge (ersetzt „Angelegt vor …" als Hinweis), Kategorien als 9-px-Punkte in ihrer Farbe (Namen als `aria-label` und im Karten-Fenster). Was nicht passt, wird abgeschnitten, zuerst Kosten und Anhänge, weil sie in der Reihenfolge zuletzt stehen.
- **Entfällt in der Liste:** „Angelegt vor …" (`data-testid="card-created"`); bleibt im Karten-Fenster (`created-note`).
- **Bleibt:** Farbbalken der Dringlichkeit, Wischen, Menü, Stups-Hinweis („stupst dich" / „Du hast … gestupst") und „Erledigt …" in der Erledigt-Spalte, aber auf eine Zeile verkleinert.
- **Messbares Ziel:** In einem Browser-Test mit der Ansicht eines iPhone 15 (393×852) stehen mit einer typischen Karte (Titel, Termin, eine Person, eine Kategorie) mindestens **4 Karten** vollständig im sichtbaren Bereich über der Leiste.

### 4.4 Kleine Ärgernisse (1.4)

- **„+" verdeckt Inhalt.** Die scrollenden Listen bekommen unten einen Abstand aus Knopfhöhe, Leiste und Safe-Area (`env(safe-area-inset-bottom)`). Ein Browser-Test prüft, dass sich der letzte Eintrag über den Knopf hinaus scrollen lässt.
- **Abgeschnittene Chips und Tabs.** Waagerecht scrollende Leisten (Spalten-Tabs, Filter-Chips in der Agenda) bekommen am Rand einen **Verlauf**, der verschwindet, wenn man am Ende ist, und die aktive Auswahl scrollt automatisch in den sichtbaren Bereich (`scrollIntoView({ inline: 'center' })`).
- **„Speichern" → „Fertig"** im Karten-Fenster (rechts oben). Die Anzeige „Gespeichert" bleibt. Das „Speichern" in Formularen, die wirklich speichern (Personen, Passwort, Wächter), bleibt.
- **`SelectField.svelte`.** Verallgemeinert das Muster aus `CardProps`: sichtbar ein Feld im Stil der Zeilen (Wert rechts, Chevron), darüber ein durchsichtiges natives `<select>` (iOS-Picker). Ersetzt die sichtbaren `<select>` in `WatcherSheet`, `RecurrenceEditor`, `BoardSettings`, `SettingsSheet`, der Vorab-Erinnerung in `CardProps`. Der Status-Chip in `CardProps` nutzt es ebenfalls. **Nativ bleiben** `datetime-local` und `time`: Das sind die iOS-Rädchen und wirken nativ.
- **Bestandsaufnahme der Formularelemente** in allen Sheets (Checkboxen, Zahlenfelder, Textbereiche) wird abgehakt in einer Liste im Plan; was nicht passt, wird korrigiert oder dort begründet stehen gelassen.

### 4.5 Schnell-Eingabe (1.5)

**Parser** (`packages/web/src/lib/quickadd/`, ohne Oberfläche, ohne Abhängigkeiten vom Browser)

```
parseQuickAdd(text, ctx) → {
  title: string,
  dueAt: ISO-UTC | null, hasTime: boolean,
  assignees: { name, personId | null }[],
  categories: { name, categoryId | null }[],
  recurrence: Recurrence | null,
  priority: 'medium' | 'high' | null,
  tokens: { kind, start, end, text }[]     // zum Hervorheben und Zurücknehmen
}
ctx = { now: Date, timeZone: string, locale: 'de', defaultTime: 'HH:MM', people, categories, ignore?: Set<tokenId> }
```

- **Sprache als Daten.** Die Wörter (Wochentage, Monate, „morgen", „jede Woche", …) stehen in einem Wörterbuch pro Sprache (`de.ts`); die Regeln lesen nur aus dem Wörterbuch. Englisch kommt in Stufe 2 als zweites Wörterbuch.
- **Datum:** heute, morgen, übermorgen, Wochentage, „nächsten Montag", „in 3 Tagen", „in 2 Wochen", „1.12.", „1. Dezember", „1.12.2027". Entscheidungen für Mehrdeutigkeiten: *Ein Wochentag allein* meint den **nächsten** dieses Tages **nach heute** (ist heute Montag, ist „Montag" der Montag in einer Woche; „heute" schreibt man aus). „Nächsten Montag" ist dasselbe. Ein Datum ohne Jahr meint die nächste Wiederkehr (liegt es schon hinter uns, im Folgejahr); der 29.2. in einem Nicht-Schaltjahr wird abgelehnt (kein Datum erkannt). „In einem Monat" ist am Monatsende auf den letzten Tag des Zielmonats begrenzt. Alle Rechnungen laufen in der Zeitzone aus `ctx`, der Wechsel der Sommerzeit verschiebt keine Uhrzeit.
- **Uhrzeit:** „19 Uhr", „19:30", „um 19", „7:05". „Halb 8" ist optional und **nicht** Teil von 1.11.0 (die Vormittags-/Nachmittags-Frage ist ohne Rückfrage nicht zu beantworten). Ohne Uhrzeit gilt die Standard-Uhrzeit (neue Einstellung `defaultDueTime`, Vorgabe `09:00`, nur Administratoren ändern sie, liegt in `settings`). Sie gilt nur, wenn die Schnell-Eingabe ein Datum erkennt; ein manuell gewählter Termin ist davon unberührt.
- **Wiederholung:** „jeden Tag", „täglich", „jede Woche", „wöchentlich", „alle 2 Tage", „alle 3 Wochen", „jeden Montag" (wöchentlich am Montag; ohne anderes Datum ist der nächste Montag der Termin), „monatlich", „jeden Monat", „jährlich". Abgebildet auf das vorhandene Wiederholungsmodell (`Recurrence`, siehe `lib/recurrence.ts`). Wiederholung ohne Datum: Termin = heute bzw. der nächste passende Tag mit Standard-Uhrzeit.
- **Priorität:** `!` → `medium`, `!!` → `high`, „wichtig" → `high`. Erkannt nur als eigenes Wort (siehe Annahme A3).
- **`@Person`:** Vorname oder Anzeigename ohne Beachtung der Groß-/Kleinschreibung, eindeutiger Anfang genügt (`@be` → Ben, wenn es keinen zweiten gibt). Unbekannt oder mehrdeutig → Chip „?" in Warnfarbe, wird **nicht** stillschweigend verworfen (die Karte würde sonst ohne Zuständige entstehen, und es kommt keine Erinnerung).
- **`#Kategorie`:** aus dem aktuellen Board. Unbekannt → Chip „neu: Haushalt". Beim Anlegen fragt eine Bestätigung: „Kategorie „Haushalt" neu anlegen?" (Ja: anlegen und zuweisen; Nein: Karte ohne diese Kategorie).
- **Titel:** der Text ohne die erkannten Teile, Leerzeichen bereinigt. Bleibt der Titel leer, ist die Eingabe ungültig (Anlegen gesperrt).

**Oberfläche** (`NewCardSheet.svelte`)

- Das Titelfeld **wird** die Schnell-Zeile (gleiche Stelle, Fokus beim Öffnen, `aria-label="Titel"` bleibt, Platzhalter nennt ein Beispiel). Ohne besondere Wörter verhält sie sich wie bisher.
- Erkannte Teile sind im Text farblich hinterlegt (Spiegel-Ebene hinter einem durchsichtigen Eingabefeld; Cursor und Auswahl bleiben die des Browsers).
- Darunter eine Zeile **Chips** (Datum/Uhrzeit, Person, Kategorie, Wiederholung, Priorität). Ein Tipp auf einen Chip nimmt ihn zurück (der Text bleibt, wird dann Teil des Titels). „Rückgängig" gilt je erkanntem Teil (`ignore`).
- Die Eigenschaftschips darunter (`CardProps`) zeigen die erkannten Werte. Ändert jemand einen Wert dort von Hand, **gewinnt die Handeingabe**: Die Schnell-Eingabe überschreibt dieses Feld danach nicht mehr.
- `default-time`-Einstellung: Einstellungen › Vorgaben, ein Feld „Standard-Uhrzeit für Termine".

**Nicht in diesem Release:** Feld im Board, `stups_create_card` mit `text`, Englisch (die Stufe-2-Aufgabe wird nur vorbereitet), „halb 8".

**Wie es gebaut wurde (1.11.0), wo es von der Spec abweicht oder sie präzisiert**

- **Priorität:** Das Briefing nennt im Beispiel bei einem einzelnen `!` „Priorität hoch", in der Regelliste aber `!` = mittel und `!!` = hoch. Umgesetzt ist die Regelliste (`!` mittel, `!!` oder „wichtig" hoch); im Beispiel mit `!!`.
- **„heute" ohne Uhrzeit**, wenn die Standard-Uhrzeit schon vorbei ist: die nächste volle Stunde (höchstens 23:00) statt eines Termins, der sofort überfällig wäre.
- **Nur eine Uhrzeit** („19 Uhr"): heute, wenn sie noch kommt, sonst morgen. **Nur eine Wiederholung:** heute zur Standard-Uhrzeit, sonst morgen; „jeden Montag" ohne Datum: der nächste Montag nach heute.
- **29.2. ohne Jahr:** der nächste Schalttag (statt abzulehnen). Mit ungültigem Jahr („29.2.2027") oder ungültigem Datum („31.4.") wird nichts erkannt, der Text bleibt im Titel.
- **Ohne erkannte Teile** bleibt der Titel genau, wie er getippt wurde. Nach dem Zurücknehmen eines Datums rückt kein zweites nach, ein zweites Datum im Text bleibt Titel, solange das erste gilt.
- **Kategorien** werden, wie ein Name, auch über einen eindeutigen Anfang gefunden (`#Haus` → Haushalt).
- **Rückfrage bei neuer Kategorie:** „Anlegen" legt sie an und gibt sie der Karte; zum Weglassen schließt man die Frage und tippt auf den Chip.
- **Agenda (Fehler aus der Praxis, mit 1.10.0-beta.2 behoben):** Karten, die mehr als 60 Tage entfernt sind, fehlten, und bei leerer Liste gab es den Knopf „Weitere 60 Tage laden" nicht. Jetzt steht der Knopf auch dann, und die Agenda schaut bei leerer Liste gleich ein Jahr voraus.

### 4.6 Technik (1.6)

**Aufteilen** (reine Umstrukturierung, keine Verhaltensänderung, alle Tests bleiben unverändert grün)

- `store.ts` → Verzeichnis `store/` mit je einem Thema: Boards/Spalten/Kategorien, Karten, Abschluss und Wiederholung, Personen und Zugriff, Benachrichtigungen, Stupse, Wächter. Gemeinsame Hilfen (`one/all/run`, `transaction`) in einem Kontext, den jedes Teilstück bekommt. `createStore` setzt sie zusammen und gibt **dasselbe Objekt wie bisher** zurück (Aufrufer und Tests ändern sich nicht).
- `api.ts` → Routen-Dateien je Thema, `apiRoutes` registriert sie.
- Vorgehen: Thema für Thema, nach jedem Schritt alle Tests (Reihenfolge: das am wenigsten verflochtene zuerst). Vor Beginn ein Test, der die Form von `createStore` festschreibt (Liste der Methoden), damit nichts verloren geht.

**Live-Sync mit Änderungen**

- Heute: `bus.emit({by})` ohne Inhalt; der Client lädt das ganze Board neu.
- Neu: Jede schreibende Store-Methode meldet `touch(art, id, boardId?)`. Am Ende der Anfrage (bzw. der Hintergrundaufgabe) schickt der Bus **eine** Nachricht `changed` mit `seq`, `by` und `changes: [{ kind: 'card'|'board'|'column'|'category'|'person'|'nudge'|'watcher'|'settings', id, op: 'upsert'|'delete', boardId? }]`.
- Client: Für `card` holt er nur die betroffenen Karten (`GET /api/cards?ids=…`, in einem Aufruf) und setzt sie in die Ansicht; `board`/`column`/`category` laden das Board; unbekannte Arten, mehr als 50 Änderungen oder eine Lücke in `seq` → Neuladen wie heute. **Neuladen bleibt der Rückfall** nach Verbindungsabbruch (`hello`).
- Zugriff: Die Nachricht trägt nur Kennungen, keine Inhalte; geholt wird über die normalen, geprüften Routen.
- **Messung vor und nach** mit `4-perf.spec.ts`, erweitert um ein Board mit 300 Karten **mit Fotos** (Vorschaubilder) und den Fall „eine Karte ändert sich": übertragene Bytes und Zeit bis zur Anzeige am zweiten Gerät. Die Zahlen kommen in den Changelog.

## 5. Release-Schnitt

Jedes Release hat einen Changelog-Eintrag. **Keine Migration in Stufe 1 geplant** (alle neuen Einstellungen liegen in der vorhandenen Tabelle `settings`). Falls doch eine nötig wird: Migrationstest und Sicherung vorher.

| Release | Inhalt | Weg |
|---|---|---|
| **1.9.0** | 1.1 Docker-Hinweise, 1.2 Beta-Kanal | direkt `main` (es legt den Kanal an), davor `beta` pushen |
| **1.10.0** | 1.3 Kompakte Karten, 1.4 Ärgernisse | zuerst Beta, nach Freigabe `main` |
| **1.11.0** | 1.5 Schnell-Eingabe | zuerst Beta |
| **1.12.0** | 1.6 `store`/`api` aufteilen (unsichtbar) | zuerst Beta |
| **1.13.0** | 1.6 Live-Sync mit Änderungen | zuerst Beta |

1.12.0 und 1.13.0 lassen sich zusammenlegen, wenn die Beta-Phase der Aufteilung ohne Auffälligkeiten ist. Die Aufteilung allein riskiert nichts am Verhalten, die Deltas schon; deshalb getrennt vorgeschlagen.

## 6. Tests (Überblick)

- **1.9.0:** `addon-files.test.ts` für beide Apps; Unit-Tests für Kanal (`runtime.ts`), Sensorpräfix, Push-Titel, Ereignisname, Aktions-Kennung, Torwächter für Push/Wächter; ein Test, der prüft, dass die Beta-Aktionen der normalen App ignoriert werden und umgekehrt. Die CI-Datei selbst lässt sich lokal nicht ausführen: Prüfung durch den ersten Lauf auf `beta`.
- **1.10.0:** Browser-Test „mindestens 4 Karten auf iPhone 15", Leisten-Verlauf und Scrollen zum aktiven Chip, Abstand unten, „Fertig", `SelectField` (Auswahl, Beschriftung, Tastatur). Bestehende Tests, die „Angelegt …" in der Liste oder „Speichern" im Karten-Fenster erwarten, werden angepasst (`1-board.spec.ts`, `10-waechter.spec.ts`).
- **1.11.0:** sehr viele Parser-Tests (jede Regel, Mehrdeutigkeiten, Monatsende, Schaltjahr, Sommerzeitwechsel, Wochentag = heute, Unbekanntes, Reihenfolge der Teile, Zahlen im Titel wie „2 Kisten"), Browser-Test der Oberfläche (Vorschau, Zurücknehmen, Handeingabe gewinnt, Rückfrage für neue Kategorie).
- **1.12.0/1.13.0:** Form-Test für `createStore`, die vorhandenen ~650 Server-Tests unverändert, neue Tests für `changes`, Rückfall und Zugriff, Messung mit `4-perf`.

## 7. Annahmen zur Prüfung

- **A1** Die Beta heißt `Stups (Beta)`, Slug `stups_beta`, Panel `Stups Beta`, Versionen `X.Y.Z-beta.N`.
- **A2** Das Beta-Symbol erzeuge ich aus dem vorhandenen Symbol mit einem „BETA"-Band; du siehst es vor dem Release.
- **A3** `!` und `!!` zählen nur als **eigenes Wort** (von Leerzeichen umgeben oder am Ende), nicht als Satzzeichen („Achtung!" bleibt Titel).
- **A4** Die Standard-Uhrzeit ist eine Einstellung für die ganze Installation (nicht pro Person).
- **A5** Kategorien werden in der Liste als Punkte gezeigt, die Namen stehen im Karten-Fenster und im Filter.
- **A6** `stups_create_card` mit `text` kommt später (siehe 3.6).
