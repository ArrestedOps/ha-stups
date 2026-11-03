# Spike: Stups als Home-Assistant-Integration (Stufe 3.5)

Stand 03.11.2026. **Nur ein Bericht, kein Code im Produkt.** Gefragt war: Können Stups-Karten als To-do-Listen und im HA-Kalender erscheinen, und wie viel kostet das? Die Entscheidung triffst du; ohne sie wird nichts gebaut.

> **English summary.** A small companion integration (HACS, `custom_components/stups`) can expose each board as a `todo` entity and the dated cards as one `calendar` entity. The hard part is not the entities but the **link**: today the add-on is reachable only through Ingress and has no token API, so the integration needs a new, token-protected read/write API plus discovery. Cheap alternatives exist: an **ICS feed** (calendar only, read-only, about 1 day) gets 80 % of the calendar value; the existing `stups_create_card` event and a few Assist sentences cover voice input. Recommendation: **ICS feed first (phase A), then decide on the integration (phases B/C) only if the todo entities and voice "add X to list" are wanted.** Effort: A ≈ 1 day, B (read-only) ≈ 4–6 days, C (two-way) ≈ 2 weeks plus ongoing upkeep of a second component.

## 1. Ausgangslage im Code

- Das Add-on läuft **nur hinter Ingress** (`ingress: true`, Port 8099, kein veröffentlichter Port). Der Server vertraut Anfragen nur, wenn sie vom Supervisor kommen (`ingressAuth` prüft IP und Benutzer-Kopfzeilen). Eine **Token-Schnittstelle für fremde Programme gibt es nicht.**
- Der eigenständige Container hat Anmeldung mit Sitzungs-Cookie (Konten, Passkeys), ebenfalls keine Token.
- Das Add-on hat `homeassistant_api: true` und spricht damit **mit** Home Assistant (Wächter, Push, Haus-Kanäle). Die Gegenrichtung (HA ruft Stups) läuft heute nur über das Ereignis `stups_create_card` und die Sensoren, die Stups in HA schreibt.
- Karten haben alles, was To-do und Kalender brauchen: Titel, Beschreibung, Termin (`dueAt`), Wiederholung, erledigt/offen, Zuständige, Spalte.

## 2. Wie eine Begleit-Integration die App findet und sich anmeldet

Eine Integration läuft im HA-Core-Container, das Add-on in einem eigenen Container im selben internen Netz.

| Frage | Befund |
|---|---|
| **Finden** | Add-ons können sich dem Core über **Supervisor-Discovery** ankündigen: `discovery: [stups]` in der `config.yaml`, der Add-on-Code schickt `POST /discovery` an den Supervisor, der Core startet einen Config-Flow mit Quelle `hassio` (Schritt `async_step_hassio`). Das ist der vorgesehene Weg ohne Handarbeit. Der interne Host-Name des Add-ons ist in den Entwicklerdokumenten **nicht** beschrieben; er steht aber in der Discovery-Nachricht, die der Add-on selbst sendet (Host und Port gehören in die Nachricht). Im eigenständigen Container trägt der Nutzer die Adresse im Config-Flow selbst ein. |
| **Anmelden** | Neu nötig: eine **Token-Schnittstelle** (`Authorization: Bearer …`), getrennt von Ingress. Vorschlag: Beim ersten Einrichten erzeugt Stups ein zufälliges Token, speichert nur den Hash, die Integration bekommt das Klartext-Token über die Discovery-Nachricht (Add-on) bzw. der Nutzer kopiert es (Container). Rechte des Tokens = nur lesen und Karten abhaken/anlegen, kein Admin. |
| **Absicherung** | Der Port 8099 darf nicht frei offen sein: Token plus, im Add-on, Beschränkung auf das interne Netz. Die vorhandene Prüfung `ingressAuth` bleibt für die Oberfläche unverändert. |
| **Wer ist „die Person"?** | Ein Token gilt für die **Instanz**, nicht für eine Person. Zuweisungen werden als Namen/IDs mitgeliefert; „meine Karten" gibt es in HA nicht automatisch. |

Aufwand nur für diese Strecke (Token, Hash, Rotation, Discovery, Tests): etwa 2 Tage, und sie wird von allen Varianten B/C gebraucht.

## 3. Welche Entitäten

**To-do (`todo`-Plattform, `TodoListEntity`).** Pflicht ist `todo_items`; Anlegen/Ändern/Löschen/Verschieben sind einzeln zuschaltbare Funktionen (`CREATE/UPDATE/DELETE/MOVE_TODO_ITEM`). Der Zustand der Entität ist die Zahl der offenen Einträge. Wichtig: **Assist kann „setze X auf die Liste Y" von sich aus**, sobald eine To-do-Entität existiert (eingebaute Intents), und die HA-Oberfläche hat eine fertige To-do-Karte. Das ist der eigentliche Gewinn der Integration.

- **Zuschnitt:** *Eine Liste je Board* ist der natürliche Schnitt (Boards sind die Listen, die Leute kennen: „Einkauf", „Haushalt"). Je Spalte wäre zu fein (Spalten sind Status, kein Thema), je Person passt schlecht zu mehreren Zuständigen. Optional zusätzlich eine Liste „Meine offenen Karten" je Person, nur lesend.
- **Abbildung:** Spalte „Erledigt" ↔ `completed`, jede andere Spalte ↔ `needs_action`. Der Spaltenname geht verloren (To-do kennt nur zwei Zustände). Fällig = `due`, Beschreibung = `description`. Wiederholende Karten: Abhaken löst in Stups die nächste Karte aus; die Liste muss danach neu geladen werden.
- **Richtungen:** Lesen (leicht), Anlegen (leicht: Karte in die erste offene Spalte), Abhaken (mittel: Stups-Regeln für Wiederholung, Bestätigung bei Kindern!), Umbenennen/Löschen (mittel), Verschieben (schwer, wegen Spalten). Vorschlag: lesen, anlegen, abhaken, löschen; Verschieben nicht.
- **Rolle Kind:** Ein Token hat keine Person. Abhaken per Sprache am Lautsprecher darf die Bestätigung von Kindern **nicht umgehen**; die Schnittstelle müsste Abhaken wie ein Erwachsener behandeln, die Karte aber bei Bestätigungspflicht nur als „Anfrage" setzen.

**Kalender (`calendar`-Plattform, `CalendarEntity`).** Wesentlich ist `async_get_events(hass, start, end)`: gibt Ereignisse im Zeitraum zurück; Wiederholungen müssen als einzelne Ereignisse „flach" geliefert werden, ganztägige mit `date` statt `datetime`. Schreiben ist optional (`CREATE/UPDATE/DELETE_EVENT`) und verlangt dann RFC-5545-Wiederholungen: **nur lesen** ist sinnvoll.

- **Zuschnitt:** *Ein Kalender* mit allen Karten mit Termin (Titel = Kartenname, Beschreibung = Board und Zuständige) und optional einer je Board. Karten haben nur einen Zeitpunkt, keine Dauer: als Ereignis mit fester Länge (z. B. 30 Minuten) oder als Ganztag, wenn die Uhrzeit fehlt.
- **Wiederholung:** Stups legt die nächste Karte erst beim Erledigen an. Für den Kalender muss der Server die Regel selbst in den gefragten Zeitraum ausrollen (die Funktion `nextDue` gibt es schon).

## 4. Wartung: was eine zweite Komponente kostet

- **Zwei Releases, zwei Versionen.** Add-on und Integration müssen zueinander passen (Schnittstellenversion in der Antwort, Integration prüft sie, klare Fehlermeldung bei Abweichung). Das Add-on wird über das Repository verteilt, die Integration über **HACS** (eigenes Repository oder Unterordner mit `hacs.json`, `manifest.json` mit `domain, name, version, documentation, issue_tracker, codeowners`, Marken-Icon unter `brand/`). Das ist eine zweite Veröffentlichung mit eigenem Changelog.
- **Der Home-Assistant-Takt:** HA ändert die Entitäts-Schnittstellen etwa monatlich (neue Funktionsflags, Umbenennungen). Eine Integration braucht deshalb regelmäßig Pflege und Tests gegen neue HA-Versionen (HA-Testgerüst `pytest-homeassistant-custom-component`, **Python**; Stups ist heute reines TypeScript). Es kommt also eine **zweite Sprache und Testwelt** hinzu.
- **Fehlersuche:** Probleme liegen künftig an drei Stellen (Stups, Integration, HA). Die Diagnose-Seite müsste die Verbindung (Token, Version, letzte Abfrage) anzeigen.
- **Eigene Last:** Abfragen im Takt (Polling alle 30–60 s) oder, besser, Push über den vorhandenen Live-Sync (WebSocket `GET /api/events`), den die Integration abonniert.
- **Lizenz und Veröffentlichung:** Die Integration ist ein eigenes Repository/Verzeichnis mit eigener Lizenz (am einfachsten dieselbe wie Stups). Aufnahme in die HACS-Standardliste ist freiwillig; ohne sie fügen Nutzer das Repository von Hand als „Benutzerdefiniertes Repository" hinzu. Für HA-Core selbst (offizielle Integration) wäre es ein langer Prüfprozess und eine Python-Bibliothek auf PyPI: **nicht empfohlen**.

## 5. Alternativen ohne zweite Komponente

| Weg | Was er bringt | Was fehlt | Aufwand |
|---|---|---|---|
| **ICS-Feed** (`/api/calendar/<geheimes-token>.ics`, abonnierbar in HA über die Integration „Lokaler Kalender"/„Remote Calendar", in Apple/Google Kalender) | Kalender überall, ohne Python; Wiederholungen ausgerollt; nur lesen | Kein To-do, kein Abhaken; Feed-Token ist ein Geheimnis in der URL; HA holt nur alle ~15 Min.; Ingress muss für diese eine Route das Token statt der Sitzung prüfen | **ca. 1 Tag** |
| **Ereignis `stups_create_card`** (gibt es) plus **Assist-Sätze** („erinnere mich … an …" per benutzerdefiniertem Satz → Automation → Ereignis) | Karten per Sprache anlegen | Kein Abhaken, keine Liste; Sätze pflegt der Nutzer in YAML | **0,5 Tag** (nur Anleitung) |
| **REST-Befehle** (`rest_command` in HA gegen eine kleine Token-API des Add-ons) | Anlegen/Abhaken aus Automationen, Schaltflächen im Dashboard | Keine Entitäten, keine Sprachanbindung ohne zusätzliche Skripte; braucht dieselbe Token-API wie die Integration | 2 Tage (Token-API) |
| **Sensoren** (Stups schreibt schon Zähler/Zustände nach HA) | Dashboard-Karten, Automationen („offene Karten > 5") | Keine Einzelkarten | fertig |

## 6. Empfehlung

1. **Phase A – ICS-Feed (empfohlen, ca. 1 Tag, eigenes kleines Release).** Löst den Wunsch „Stups im Kalender" fast vollständig, ohne Python und ohne zweite Komponente. Dazu eine kurze Anleitung für `stups_create_card` + Assist.
2. **Phase B – lesende Integration (ca. 4–6 Tage plus 2 Tage Token/Discovery),** nur wenn du To-do-Listen in HA und „Setze X auf die Liste" per Sprache wirklich willst. Entitäten: je Board eine To-do-Liste und ein Kalender, nur lesen plus „Karte anlegen".
3. **Phase C – abhaken und löschen (ca. +1 Woche).** Erst nach Phase B, mit Regeln für Wiederholung und Rolle Kind (Bestätigung bleibt).
4. **Nicht tun:** Aufnahme in HA-Core, Verschieben von Karten, Kalender-Schreiben.

**Gesamtaufwand:** A ≈ 1 Tag · B ≈ 6–8 Tage · C ≈ 5 Tage; dazu dauerhaft etwa ein halber Tag pro HA-Quartal Pflege (neue HA-Version testen). **Risiko:** Der größte Posten ist nicht der Code, sondern das Dauerversprechen, eine Python-Komponente mit dem HA-Takt zu pflegen.

**Entscheidung für dich:** (1) nur Phase A, (2) A und B, (3) A, B und C, (4) nichts davon.

## Quellen

- [To-do list entity](https://developers.home-assistant.io/docs/core/entity/todo) – Entwicklerdokumentation
- [Calendar entity](https://developers.home-assistant.io/docs/core/entity/calendar) – Entwicklerdokumentation
- [Config Flow](https://developers.home-assistant.io/docs/config_entries_config_flow_handler/) – Entdeckung über `hassio`
- [App-Konfiguration (`discovery`, `homeassistant_api`, `ingress`)](https://contributors.home-assistant.io/apps/reference/configuration/)
- [HACS: Integration veröffentlichen](https://hacs.xyz/docs/publish/integration/)

Nicht belegt in diesen Quellen und deshalb vor einer Umsetzung zu prüfen: der genaue interne Host-Name eines Add-ons, das Format der Discovery-Nachricht und die Häufigkeit des ICS-Abrufs der Integration „Remote Calendar".
