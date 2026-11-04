<p align="center"><img src="docs/images/stups-logo.png" alt="Stups" width="420"></p>

# Stups

> Deutsche Fassung. Die englische Fassung ([README.md](README.md)) ist maßgeblich.

Kanban-Board, Aufgabenliste und Kalender als Home-Assistant-App (Add-on). Für den Haushalt, die Familie oder die WG: Aufgaben auf Boards, wiederkehrende Termine, Fotos und Links, Push-Erinnerungen mit „Erledigt"-Knopf über die Companion App und ein freundlicher **Stups** an die, die etwas vergessen haben. Fürs iPhone gebaut, mit Dunkel- und Hellmodus.

<p align="center">
  <a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FArrestedOps%2Fha-stups"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Zu Home Assistant hinzufügen"></a>
  <br><sub>Öffnet in deinem Home Assistant den Dialog mit vorausgefüllter Repository-Adresse. Das Hinzufügen und die Installation bestätigst du dort selbst.</sub>
</p>

<p align="center">
  <img src="docs/images/board-dunkel.png" alt="Board, dunkel" width="23%">
  <img src="docs/images/aufgaben-dunkel.png" alt="Aufgaben, dunkel" width="23%">
  <img src="docs/images/kalender-woche-dunkel.png" alt="Kalender, Woche, dunkel" width="23%">
  <img src="docs/images/stupsen-dunkel.png" alt="Stupsen, dunkel" width="23%">
</p>
<p align="center">
  <img src="docs/images/board-hell.png" alt="Board, hell" width="23%">
  <img src="docs/images/aufgaben-hell.png" alt="Aufgaben, hell" width="23%">
  <img src="docs/images/kalender-woche-hell.png" alt="Kalender, Woche, hell" width="23%">
  <img src="docs/images/stupsen-hell.png" alt="Stupsen, hell" width="23%">
</p>

<p align="center">
  <img src="docs/images/waechter-dunkel.png" alt="Wächter, dunkel" width="23%">
  <img src="docs/images/gefunden-dunkel.png" alt="Gefunden, dunkel" width="23%">
  <img src="docs/images/waechter-bearbeiten-dunkel.png" alt="Ein Wächter als Satz, dunkel" width="23%">
  <img src="docs/images/einstellungen-dunkel.png" alt="Einstellungen, dunkel" width="23%">
</p>

## Was kann es?

- **Boards** mit eigenen Spalten und Kategorien, Karten mit Zuständigen, Termin, Priorität, Kosten, Beschreibung, Checkliste, Links, Fotos/PDFs und Kommentaren. Wischen verschiebt Karten; jede Karte ist eine Zeile mit farbiger Kachel.
- **Schnell-Eingabe:** Eine Zeile wie `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!` wird zur fertigen Karte mit Termin, Zuständigem, Kategorie, Wiederholung und Priorität.
- **Aufgaben** (Startseite, drei Reiter: Aufgaben, Boards, Wächter): was für dich dran ist. Oben Karten vom Haus (von Wächtern), deine Zahlen (heute fällig, überfällig, heute erledigt), die Woche mit Punkten, ein Banner, wenn dich jemand gestupst hat, und deine Karten in den Gruppen Überfällig, Heute, Diese Woche und Später. Chips wechseln zwischen Meine, Alle und jeder Person. Ein Umschalter darüber zeigt stattdessen **Tag, Woche oder Monat** (der frühere Kalender); auf einen freien Zeitpunkt tippen legt eine Karte mit diesem Termin an. Am Ende die Fairness dieser Woche, ohne Rangliste.
- **Wiederkehrende Aufgaben:** fester Rhythmus oder ab Erledigung; die erledigte Karte bleibt samt Verlauf erhalten, die nächste entsteht neu.
- **Wächter:** Stups beobachtet Entitäten in Home Assistant und legt von selbst Karten an: „Die Waschmaschine ist fertig, also bekommt eine Person, die zu Hause ist, die Karte ‚ausräumen'." Stups **findet passende Geräte selbst** (Waschmaschine, Trockner, Abfallkalender, Regen, Batterien, Saugroboter), du richtest einen Wächter als **Satz** ein, mit **Probelauf** auf den letzten 7 Tagen. Dazu „Weitergeben", „Erst vorschlagen" (wer zuerst tippt, übernimmt) und „Wenig Zeit" für stressige Wochen. **Zuhause** zeigt, was das Haus gerade tut. Einrichtung ohne YAML.
- **Push über die Companion App:** zur Fälligkeit, vorab, nachhaken, Tageszusammenfassung. „Erledigt" direkt in der Nachricht.
- **Stupsen:** einer anderen Person zu ihrer Karte einen Stups schicken („Denkst du dran?"). Mit Sperrzeit und Ruhezeit pro Person, damit niemand genervt wird.
- **Haus-Kanäle:** Ein Stups kann auch im Haus ankommen: als Ansage über einen Lautsprecher oder als Lampe, die in deiner Farbe aufleuchtet, für Kinder ohne Handy. Je Kanal wählst du, welche Nachrichten ankommen und was geschieht, wenn jemand nicht zu Hause ist.
- **Diese Woche (Fairness):** Wer diese Woche oder diesen Monat wie viel erledigt hat, als Balken für den Aufwand (klein, mittel, groß). Keine Rangliste, keine Medaillen. Auf Wunsch eine Zusammenfassung am Sonntagabend.
- **Rolle Kind:** Kinder sehen und haken nur ihre eigenen Karten ab. Mit Bestätigung: Die Karte wartet, bis ein Elternteil „Bestätigen“ oder „Nochmal“ sagt, und zählt dann für das Kind.
- **Board-Vorlagen:** Ein Board aus Haushalt, Umzug, Renovierung und mehr starten oder ein eigenes Board als Vorlage speichern.
- **Mehrere Personen:** Zugriff steuerst du unter Einstellungen › Haushalt › Personen und Kinder. Jede Person bekommt ein Bild (aus Home Assistant oder hochgeladen). Wer Administrator in Home Assistant ist, stellt ein; alle freigegebenen Personen dürfen Boards, Karten und Kategorien anlegen.
- **Sensoren** für Home Assistant: überfällige und heute fällige Karten, gesamt und je Person, offene Stupse.
- Alles bleibt bei dir: SQLite im Add-on-Speicher, Teil des normalen HA-Backups.

## Installation

Am einfachsten über den Knopf oben („Zu Home Assistant hinzufügen"). Von Hand:

1. In Home Assistant: **Einstellungen → Apps → App-Store → ⋮ → Repositories**
2. `https://github.com/ArrestedOps/ha-stups` hinzufügen
3. **Stups** installieren, Personen und Notify-Dienste in den Optionen eintragen, starten.

Bedienung und Optionen: [stups/DOCS.md](stups/DOCS.md). Änderungen: [stups/CHANGELOG.md](stups/CHANGELOG.md).

### Beta testen

Neue Versionen erscheinen zuerst als **Stups (Beta)**, einer zweiten App mit eigenen Daten, und erst nach dem Test in der normalen App. Wer früh ausprobieren will, fügt in Home Assistant unter **Einstellungen › Apps › App-Store › ⋮ › Repositories** diese Adresse hinzu:

```
https://github.com/ArrestedOps/ha-stups#beta
```

Dort erscheint **Stups (Beta)** (mit „BETA"-Symbol). Aus dieser Adresse erscheint auch ein zweites „Stups": das nicht installieren. In der Beta sind Push und Wächter zunächst aus, damit niemand Nachrichten doppelt bekommt; über **Einstellungen › Hilfe und Daten › Papierkorb, Archiv, Umzug** lassen sich echte Daten einmal hineinkopieren. Alles dazu: [stups-beta/DOCS.md](stups-beta/DOCS.md).

### Ohne Home Assistant (Docker, Beta)

> **Beta.** Der eigene Container ist noch eine Beta: Er funktioniert und wird getestet, bekommt aber vorerst keine neuen Funktionen, bis die App in Home Assistant veröffentlicht ist. **Sicherheit:** Stelle ihn nie ohne HTTPS und einen Reverse-Proxy ins Internet und aktualisiere ihn regelmäßig (Einzelheiten in [docs/docker.md](docs/docker.md)).

Stups läuft auch als eigener Container, zum Beispiel auf einer Synology-NAS, mit eigenen Konten statt Home Assistant:

```yaml
services:
  stups:
    image: ghcr.io/arrestedops/stups:latest
    restart: unless-stopped
    ports: ["8099:8099"]
    environment:
      TZ: Europe/Berlin
    volumes: ["./stups-daten:/data"]
```

Beim ersten Start zeigt das Protokoll (`docker logs stups`) einen Code für die Einrichtung des ersten Administrators. Hinter einer https-Adresse (`STUPS_PUBLIC_URL`) meldest du dich auch mit **Passkey** an (Fingerabdruck oder Gesicht statt Passwort). Boards, Agenda, Kalender, Wiederholungen und Stupsen funktionieren wie in der App. Wächter und Sensoren brauchen Home Assistant: Mit `HA_URL` und `HA_TOKEN` (Long-Lived-Token) verbindet sich auch der Container damit. Push-Nachrichten kommen dort über [ntfy](https://ntfy.sh) (`STUPS_NTFY_URL`), mit Knöpfen wie „Erledigt" direkt in der Nachricht. Alles Weitere (Synology, HTTPS, ntfy einrichten, Einstellungen, Umzug): [docs/docker.md](docs/docker.md).

## Dokumentation

| | |
|---|---|
| [stups/DOCS.md](stups/DOCS.md) | Bedienung und Optionen (steht auch in Home Assistant unter „Dokumentation") |
| [docs/docker.md](docs/docker.md) | Stups ohne Home Assistant: Docker, Synology, Anmeldung, Einstellungen |
| [docs/entwicklung.md](docs/entwicklung.md) | Betrieb, Fehlersuche und Entwicklung |
| [docs/testliste.md](docs/testliste.md) | Was am iPhone zu prüfen ist |

## Entwicklung

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install webkit   # einmalig
pnpm e2e                              # Browser-Tests (WebKit, iPhone-Ansicht)
node e2e/screenshots.mjs              # Screenshots für diese Seite (docs/images)
```

Details und der Ablauf für neue Versionen stehen in [docs/entwicklung.md](docs/entwicklung.md).

## Lizenz

Stups steht unter der [PolyForm Strict License 1.0.0](LICENSE). Der Quelltext ist einsehbar, aber **nicht frei**:

- **Erlaubt:** Stups für **nicht-kommerzielle Zwecke** nutzen (privat, Haushalt, Familie, WG, Hobby, auch gemeinnützige Organisationen) und den Code lesen. Dass Home Assistant oder Docker das Repository für die Installation und Updates herunterladen, gehört dazu.
- **Nicht erlaubt:** **Weitergeben** (auch Hochladen in ein anderes Repository), **Verändern** und abgeleitete Werke, Unterlizenzieren. **Kommerzielle Nutzung** (zum Beispiel in einer Firma) braucht meine ausdrückliche Genehmigung.
- **GitHub:** Die Nutzungsbedingungen von GitHub erlauben jedem, ein öffentliches Repository innerhalb von GitHub zu forken. Die Lizenz gibt dafür keine weiteren Rechte: Ein Fork darf nicht zum Weitergeben oder Verändern benutzt werden.
- **Frühere Versionen:** Stups 1.9.0 und alle früheren Versionen standen unter der MIT-Lizenz; für diese Versionen, so wie sie damals veröffentlicht wurden, gilt sie weiter.

Die App nutzt die Schrift **Inter** (SIL Open Font License 1.1, lokal aus dem npm-Paket `@fontsource-variable/inter` eingebunden, kein Download von einem Schriftserver).

Der Lizenztext ist der unveränderte englische Standardtext von [PolyForm](https://polyformproject.org/licenses/strict/1.0.0).
