# Stufe 4: Heute, Zuhause, Wächter aus Vorlagen, neue Einstellungen

Stand 03.11.2026, Ausgangslage Stups 1.17.0 (stabil). Grundlage ist das Brainstorming vom 03.11.2026 und der freigegebene Entwurf auf der Leinwand „Stups Redesign" (Screens Heute, Zuhause, Gefunden, Wächter einrichten, Diese Woche, Einstellungen, Benachrichtigungen). Die Desktop-Fassung ist **nicht** Teil dieser Stufe; sie folgt als eigene Spec.

## 1. Ziel

Stups bleibt eine Home-Assistant-App für Familien und WGs, mit und ohne Smart Home. Die **Wächter werden zum sichtbaren Kern**: Karten, die vom Haus kommen, stehen im Alltag vorn, und das Einrichten wird so leicht, dass auch Haushalte ohne Bastelerfahrung es tun. Die Startseite zeigt, was **heute für mich** ansteht, statt einer Liste aller Termine. Die Einstellungen werden von einer langen Liste zu einer gegliederten Seite mit Unterseiten.

Erfolg heißt:
- Wer Stups öffnet, sieht in einem Blick: was vom Haus kam, was für mich heute dran ist.
- Ein Wächter ist in unter einer Minute eingerichtet, ohne Entitäts-ID, Schwellwert oder Minuten selbst zu kennen.
- Jede Einstellung ist in höchstens zwei Schritten von der Startseite erreichbar und steht bei dem, für den sie gilt (ich, Haushalt, Home Assistant, Hilfe).

## 2. Entscheidungen aus der Klärung

| Frage | Entscheidung |
|---|---|
| Fokus | **Nur die HA-App** (Add-on). Cloud, eigene Apps und andere Smart-Home-Quellen ruhen. Der Docker-Betrieb bleibt lauffähig, bekommt aber nichts Neues. |
| Zielgruppe | Familien und WGs, mit und ohne Smart Home |
| USP | Wächter: sichtbar im Alltag, einfach einzurichten, vertrauenswürdig (Probelauf) |
| Leiste unten | **Heute · Boards · Kalender · Zuhause**. Die Agenda als Reiter entfällt. |
| Einstellungen | **Avatar oben rechts** auf jedem Hauptreiter (ersetzt das Zahnrad). Öffnet eine gegliederte Seite mit Unterseiten. |
| Farbe | **Zwei Stimmen:** Akzent (heute Orange, je Person wählbar) für Menschen und Aktionen; **Türkis** für alles, was vom Haus kommt. |
| Fairness | Bleibt ohne Rangliste, Prozente, Punkte oder Score. Zieht aus der Agenda auf die Seite „Diese Woche". |
| Wächter ohne Smart Home | Vorlagen für Wetter, Abfallkalender und zeitbasierte Pflege, die jede HA-Installation bietet |

## 3. Was beim Lesen des Codes zu beachten war

- **Wächter-Logik liegt in Stups** (`watchers.ts`): HA liefert über `subscribe_trigger` nur Zustandswechsel, Bedingung, Dauer, Zähler und Zuweisung wertet Stups selbst aus. Der Zustand der beobachteten Entitäten liegt im Speicher (`seen`). Darauf baut die Ansicht „Zuhause" auf.
- **Vorlagen gibt es schon**, aber nur in der Oberfläche (`web/src/lib/watchers.ts`, `TEMPLATES`): sie füllen das Formular vor und suchen per Text nach einer Entität. Neu ist, dass Stups passende Entitäten **selbst findet**.
- **Karten vom Haus** tragen `cards.watcher_id`. „Vom Haus" auf Heute ist eine Abfrage, keine neue Datenhaltung.
- **Aktivität der Wächter** liefert `GET /api/watchers/activity` bereits.
- **Eigene Ruhezeit und Sonntags-Rückblick** darf jede Person schon heute selbst ändern (`PATCH /api/access/people/:id`, eigene Person ohne Admin-Recht). Sie stehen aber nur im Fenster „Personen & Zugriff". Sie ziehen nach „Für mich".
- **Kalender** kennt Tag, Woche, Monat (gemerkt in `localStorage`). Die Agenda-Liste wird dort eine vierte Ansicht.
- **Rolle Kind** sieht keine Wächter. Für Kinder hat die Leiste drei Reiter.
- **Docker ohne HA** hat keine Wächter: auch dort drei Reiter (ohne Zuhause), Einstellungen ohne die Gruppe Home Assistant, dafür mit „Konto und Anmeldung".

## 4. Design

### 4.1 Navigation

- `Tab` wird `'today' | 'boards' | 'calendar' | 'home'`. Start ist **Heute**. Alte gemerkte Werte (`agenda`, `watchers`) werden auf `today` bzw. `home` abgebildet.
- **Gemeinsame Kopfzeile** (`TopBar.svelte`) auf allen vier Reitern: links **„‹ Dashboard"** (nur im Add-on, `feat.haUi`, heute nur auf Boards in `App.svelte`), rechts der Offline-Hinweis und der **Avatar-Knopf** (Bild der Person, sonst Initiale in der Personenfarbe; 36 px, Trefferfläche 44 px). Der Avatar ersetzt `SettingsButton` und öffnet die Einstellungen.
- Kind und Docker ohne HA: Leiste ohne Zuhause.

### 4.1a Bilder der Personen

- **Aus Home Assistant:** Ist eine Person einer HA-Person zugeordnet und hat diese ein `entity_picture`, holt der Server das Bild über die HA-Verbindung (Supervisor-Token), verkleinert es auf 256 × 256 und legt es im Datenordner ab. Neu geholt beim Start und wenn sich `entity_picture` ändert (Zustandswechsel der `person.*`-Entität). Der Browser bekommt es von Stups, nie direkt von HA (Ingress, keine Token im Browser).
- **Eigenes Bild hochladen** (Rückfall oder bewusste Wahl): in Einstellungen › Profilkopf „Bild ändern" für sich selbst; Administratoren auch je Person unter Personen und Kinder (für Kinder ohne HA-Konto). Bild wird im Browser mit dem vorhandenen `prepareUpload` verkleinert, Server prüft Typ (JPEG, PNG, WebP) und Größe (höchstens 2 MB). Ein hochgeladenes Bild hat Vorrang vor dem HA-Bild; „Bild entfernen" kehrt zum HA-Bild bzw. zur Initiale zurück.
- **Daten:** Migration 20 bekommt `users.avatar_source` (`ha` | `upload` | null) und `users.avatar_rev` (Zähler für den Cache). Datei unter `<dataDir>/avatars/<userId>.webp`, gehört zum normalen Backup und zum Umzug-Export.
- **Schnittstellen:** `GET /api/people/:id/avatar` (mit `?rev=` für langes Caching, 404 ohne Bild), `PUT /api/people/:id/avatar` (eigene Person oder Administrator), `DELETE /api/people/:id/avatar`. `User` in der API bekommt `avatarRev` (null = kein Bild).
- **Anzeige:** `Avatar.svelte` zeigt das Bild, wenn `avatarRev` gesetzt ist, sonst wie heute die Initiale. Gilt überall (Karten, Agenda, Personen, Woche, Push-Ansicht nicht).
- Docker ohne HA: nur Hochladen.

### 4.2 Heute (ersetzt die Agenda als Start)

Von oben nach unten:
1. Datum, „Heute", ein Satz: „3 für dich · 1 vom Haus". Plus-Knopf für neue Karte.
2. **Vom Haus** (nur wenn es etwas gibt): offene Karten mit `watcher_id`, die mir zugewiesen sind oder noch niemandem (Modus „Erst vorschlagen", 4.5). Jede Karte zeigt Auslöser und Zeit („Waschmaschine fertig · vor 4 Min.") und warum ich dran bin („reihum unter allen, die zu Hause sind"). Knöpfe: **Erledigt**, **Weitergeben** (4.5); bei nicht zugewiesenen Karten **Übernehmen**.
3. **Für dich**: meine offenen Karten, überfällig und heute zuerst, dann die nächsten bis morgen. Quelle (Board oder Wächter) als kleine Zeile; Wächter-Quellen in Türkis.
4. **Bei den anderen**: eine Zeile mit Avataren und Zahl offener Karten, führt zu „Diese Woche".
- Leerzustand: freundlicher Satz, kein Bild.
- Kind: nur „Vom Haus" (eigene) und „Für dich", ohne „Bei den anderen".

### 4.3 Kalender

- Neue Ansicht **Liste** neben Tag, Woche, Monat: die bisherige Agenda (alle Karten mit Termin nach Tagen, Filter nach Personen und Boards, Erledigte einblendbar). `AgendaView` wird dafür wiederverwendet, ohne Fairness-Umschalter.

### 4.4 Zuhause (ersetzt den Reiter Wächter)

Zeigt den **Zustand**, nicht die Regeln. Abschnitte, jeweils nur wenn befüllt:
- **Wartet auf jemanden**: offene Wächter-Karten mit zuständiger Person und Alter; Knopf **Stupsen**.
- **Läuft gerade**: Wächter, deren Auslöser gerade „im Gang" ist (bei `below`: Wert liegt über dem Schwellwert; bei `above`: darunter, aber zuletzt darüber gewesen; bei `state`: nicht im Zielzustand und seit dem letzten Auslösen verändert). Zeigt Dauer seit Beginn und welche Karte danach kommt.
- **Bald dran**: Wächter mit Zähler (Fortschritt „2 von 3") und Wächter auf Kalender-Entitäten mit dem nächsten Termin.
- **Ruhig**: eine Zeile, welche Wächter nichts melden.
- Hinweis **„Stups hat N weitere Geräte gefunden"** (4.6), nur für Administratoren.
- Verwalten (Liste, An/Aus, Bearbeiten) zieht in die Einstellungen › Haushalt › Wächter; dort bleibt die heutige `WatchersView` mit ihren Funktionen.
- **Server:** `GET /api/home` liefert je aktivem Wächter `phase` (`waiting` | `running` | `soon` | `quiet`), `since`, `progress` (`{n, of}` oder null), `nextCard` (Titel), offene Karte mit Zuständigen. Berechnet aus `seen`, Zählerstand und offenen Karten. Live-Sync wie bisher über `ui.rev`.

### 4.5 Weitergeben, Erst vorschlagen, Wenig Zeit

- **Weitergeben** (jede Karte vom Haus, die mir zugewiesen ist): die Karte geht an die **nächste Person der Rotation** dieses Wächters (derselbe Personenkreis und dieselbe Anwesenheitsregel wie beim Zuweisen, ohne Personen mit „wenig Zeit"); gibt es niemanden, bleibt sie bei mir mit Hinweis. Die Rotation des Wächters rückt **nicht** weiter (wer weitergibt, bleibt beim nächsten Mal dran). Zählt nicht als erledigt. `POST /api/cards/:id/pass`.
- **Erst vorschlagen** (neuer Zuweisungsmodus `suggest`): Die Karte entsteht ohne Zuständige, alle Anwesenden bekommen eine Push-Nachricht „Wer übernimmt?" mit Knopf **Übernehmen**; wer zuerst tippt, bekommt sie. Nach 30 Minuten ohne Antwort greift der Rückfall des Wächters (`fallback`).
- **Wenig Zeit** (je Person, bis Datum): `users.busy_until`. Rotationen der Wächter überspringen die Person bis dahin; manuelle Zuweisung bleibt möglich. Einstellbar von der Person selbst und von Administratoren, sichtbar auf „Diese Woche".
- Migration 20 (gemeinsam mit 4.1a): `users.busy_until`, Modus `suggest` in der Prüfung von `AssignRule`.

### 4.6 Gefunden: Wächter aus Vorlagen

- **Vorlagen ziehen auf den Server** (`packages/server/src/watcher-templates.ts`, zweisprachig) und bekommen eine **Erkennung**: welche HA-Entitäten passen. Erste Vorlagen:
  - Waschmaschine, Trockner, Spülmaschine fertig: `sensor` mit `device_class: power` und passendem Namen; Hersteller-Integrationen mit Programmstatus (Entitäten mit Zustand wie `finished`/`end`/`ready`, Liste in der Vorlage).
  - Tonnen rausstellen: `calendar`-Entitäten (z. B. Abfallkalender), Karte am Vorabend.
  - Wäsche rein, es regnet: `weather`-Entität, Regen in der Vorhersage der nächsten Stunden.
  - Sensor-Batterie schwach: `sensor` mit `device_class: battery` unter 20 %.
  - Saugroboter Behälter leeren: `vacuum`, Zähler.
  - Ohne Gerät: Entkalken, Rauchmelder testen, Filter wechseln, Bettwäsche (wiederkehrende Karten aus Vorlage, kein Wächter).
- **Server:** `GET /api/watchers/suggestions` gleicht `getStates()` gegen die Erkennung ab und lässt Entitäten weg, die schon ein Wächter beobachtet. Antwort je Treffer: Vorlage, Entität, Name, Begründung („Steckdose Trockner misst Leistung").
- **Neue Vorlagen-Art für Wetter und Kalender** braucht zwei neue Auslöser-Arten in `watcher-types.ts`: `calendar_event` (Termin mit Vorlauf) und `forecast` (Bedingung in der Vorhersage). Beides wird von Stups ausgewertet; die Vorhersage über den HA-Dienst `weather.get_forecasts`, Abfrage im Takt (alle 30 Min.).
- Die Seite **Gefunden** (nur Administratoren) listet die Treffer, darunter „Auch ohne Gerät" und „Alle Vorlagen ansehen".

### 4.7 Wächter einrichten: Satz und Probelauf

- Das Formular wird ein **Satz** mit antippbaren Feldern: „Wenn [Entität] länger als [3 Min.] unter [5 W] liegt, bekommt [wer zu Hause ist, reihum] die Karte [Titel]." Jedes Feld öffnet die heutige Auswahl. „Mehr Regeln" klappt Sperrzeit, Zähler, Erinnern, Fälligkeit, Erledigen-Bedingung auf.
- **Probelauf:** Stups holt die HA-Historie der Entität der letzten 7 Tage (WebSocket `history/history_during_period`) und wendet die Bedingung darauf an. Anzeige: kleines Diagramm, erkannte Auslösungen mit Zeitpunkt, Satz („3 Trockengänge erkannt, kein Fehlalarm" bzw. „5 Mal ausgelöst, davon 2 innerhalb von 10 Minuten: Mindestdauer erhöhen?"). `POST /api/watchers/dry-run` mit der Regel, ohne zu speichern. Fehlt Historie (Recorder aus, neue Entität): Hinweis statt Diagramm.
- **Ehrlich beim Selbst-Erledigen:** Vorlagen, deren Sensor das Erledigen nicht belegen kann, schalten „Von selbst erledigen" aus und sagen warum.
- Schalter **Erst vorschlagen** (4.5).

### 4.8 Diese Woche (ersetzt die Fairness in der Agenda)

- Erreichbar über „Bei den anderen" auf Heute. Inhalt wie bisher (`GET /api/fairness`): je Person ein Balken nach Aufwand, Zahl der Karten, in der Reihenfolge der Personenliste, ohne Prozente.
- Neu: Hinweis bei „wenig Zeit", Abschnitt **Wartet auf dich** (Bestätigungen von Kindern mit Passt / Nochmal, wie in 3.3), Zeile „N Karten kamen diese Woche vom Haus".
- Kind sieht die Seite nicht (wie bisher).

### 4.9 Einstellungen

Eine Seite mit Gruppen und Unterseiten (Stapel im vorhandenen `Sheet`, zurück oben links). Kopf: Avatar, Name, Herkunft des Bilds („Bild aus Home Assistant" / „Eigenes Bild"), Knopf **Bild ändern** (4.1a).

| Gruppe | Einträge (Unterseite) | Inhalt, aus dem heutigen Stand |
|---|---|---|
| **Für mich** (alle) | Benachrichtigungen | Zustellstatus dieses Geräts, Test an mich, Ruhezeit (eigene), Sonntagabend-Rückblick (eigener), „Etwas kommt nicht an? Prüfen" (heutiger Stand-Bericht) |
| | Sprache und Farbe | Sprache, Akzentfarbe |
| | Konto und Anmeldung (nur Docker) | Passwort, Passkeys, Abmelden |
| **Haushalt** (nur Administratoren) | Personen und Kinder | heutiges „Personen & Zugriff" ohne die Ruhezeit-/Rückblick-Felder der eigenen Person; Haus-Kanäle je Person bleiben dort |
| | Wächter | heutige Wächter-Liste und Bearbeiten |
| | Vorlagen | Board-Vorlagen |
| | Termine | Standard-Uhrzeit |
| **Home Assistant** (nur Add-on) | Dashboard und Kopfzeile | Zurück-Dashboard, HA-Kopfzeile ausblenden, Bubble-Card-YAML |
| | Ansage und Lampe | Sprachdienst (heute im Personen-Fenster) |
| **Hilfe und Daten** | Warum kommt nichts an? | Stand-Bericht (für Administratoren mit allen Personen) |
| | Papierkorb, Archiv, Umzug | Papierkorb, Archiv, Export nach /share |
| | Beta | heutige Beta-Einstellungen (nur im Beta-Kanal) |
| Fuß | Version, Link zur Diagnose-Seite | |

- Nicht-Administratoren sehen „Haushalt" und „Home Assistant" nicht. Kind sieht nur „Sprache und Farbe".
- Jede Unterseite ist eine eigene Komponente (`settings/…svelte`); `SettingsSheet.svelte` (heute 407 Zeilen) wird zur Übersicht.

### 4.10 Gestaltung

- **Türkis für „vom Haus"** als feste Farbe (`--house`, `--house-bg`, `--house-line`, hell und dunkel), unabhängig vom wählbaren Akzent. Die Akzent-Auswahl bekommt kein Türkis/Grün mehr, damit beide Stimmen unterscheidbar bleiben.
- Überschriften in einer eigenen Schrift (Bricolage Grotesque, OFL), **lokal als woff2 im Add-on**, kein Google-CDN (Ingress, Datenschutz, offline). Fließtext bleibt Systemschrift.
- Kein Emoji in der Oberfläche, keine Illustrationen, keine Kennzahl-Kacheln.
- Dringlichkeit weiter über Farbe der Uhrzeit; der farbige Balken links an Karten entfällt auf Heute.
- Hell und Dunkel wie bisher nach System.

## 5. Fehlerfälle

- HA nicht erreichbar: Heute und Boards funktionieren; Zuhause zeigt „Keine Verbindung zu Home Assistant seit …", Gefunden und Probelauf sind aus.
- Entität eines Wächters fehlt: Zuhause zeigt den Wächter unter „Ruhig" mit Warnhinweis (Status `entity_missing` gibt es schon).
- Weitergeben ohne mögliche nächste Person: Karte bleibt, Meldung „Gerade ist niemand sonst dran".
- „Erst vorschlagen" und niemand zu Hause: sofort Rückfall des Wächters.
- Historie zu groß: Probelauf liest höchstens 7 Tage und höchstens 20 000 Zustände.

## 6. Tests

- Server (vitest, Attrappe `fake-ha`): Personenbild aus HA holen, Hochladen hat Vorrang, Entfernen fällt zurück, Rechte (eigene Person, Administrator), Typ- und Größenprüfung; Phasen von `/api/home`, Weitergeben (Rotation, Kind, wenig Zeit, niemand), `suggest` mit Übernehmen und Rückfall, `busy_until`, Erkennung der Vorlagen gegen Beispielzustände, Probelauf gegen Beispielhistorie, neue Auslöser `calendar_event` und `forecast`.
- Oberfläche (vitest): Dashboard-Link nur im Add-on auf allen Reitern, Abbildung alter Reiter, Sortierung von Heute, Rechte in den Einstellungen (Admin, Mitglied, Kind, Docker).
- Browser (Playwright, WebKit, iPhone): Heute mit Karte vom Haus erledigen und weitergeben; Zuhause; Wächter aus „Gefunden" mit Probelauf anlegen; Einstellungen › Benachrichtigungen; Kind-Ansicht. Bildschirmfotos für README neu.
- `i18n`-Abdeckung für alle neuen Texte (Deutsch und Englisch).

## 7. Reihenfolge und Release

Ein Beta-Release **1.18.0-beta.1**, Arbeit in dieser Reihenfolge (jede Stufe für sich lauffähig):
1. Farben, Schrift, Kopfzeile mit Dashboard und Avatar, Personenbilder (4.1a, Migration 20), neue Leiste, Heute, Kalender-Liste
2. Einstellungen als Seite mit Unterseiten
3. Zuhause mit `/api/home`
4. Weitergeben, Erst vorschlagen, Wenig Zeit (Migration 20), Diese Woche
5. Vorlagen auf dem Server, Gefunden, Satz-Formular, Probelauf
6. Neue Auslöser Kalender und Wetter

## 8. Nicht in dieser Stufe

Desktop-Fassung (eigene Spec), Cloud, eigene Apps, andere Smart-Home-Quellen als HA, Punkte und Belohnungen, Verschieben von Karten aus Zuhause heraus.
