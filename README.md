<p align="center"><img src="docs/images/stups-logo.png" alt="Stups" width="420"></p>

# Stups

Kanban-Board, Agenda und Kalender als Home-Assistant-App (Add-on). Für den Haushalt, die Familie oder die WG: Aufgaben auf Boards, wiederkehrende Termine, Fotos und Links, Push-Erinnerungen mit „Erledigt"-Knopf über die Companion App und ein freundlicher **Stups** an die, die etwas vergessen haben. Fürs iPhone gebaut, mit Dunkel- und Hellmodus.

<p align="center">
  <img src="docs/images/board-dunkel.png" alt="Board, dunkel" width="23%">
  <img src="docs/images/agenda-dunkel.png" alt="Agenda, dunkel" width="23%">
  <img src="docs/images/kalender-woche-dunkel.png" alt="Kalender, Woche, dunkel" width="23%">
  <img src="docs/images/stupsen-dunkel.png" alt="Stupsen, dunkel" width="23%">
</p>
<p align="center">
  <img src="docs/images/board-hell.png" alt="Board, hell" width="23%">
  <img src="docs/images/agenda-hell.png" alt="Agenda, hell" width="23%">
  <img src="docs/images/kalender-woche-hell.png" alt="Kalender, Woche, hell" width="23%">
  <img src="docs/images/stupsen-hell.png" alt="Stupsen, hell" width="23%">
</p>

## Was kann es?

- **Boards** mit eigenen Spalten und Kategorien, Karten mit Zuständigen, Termin, Priorität, Kosten, Beschreibung, Checkliste, Links, Fotos/PDFs und Kommentaren. Wischen verschiebt Karten, ein Farbbalken zeigt die Dringlichkeit.
- **Agenda:** alle Karten mit Termin aus allen Boards, nach Tagen, Überfälliges zuerst. Filter nach Personen und Boards.
- **Kalender:** Tag, Woche und Monat. Auf einen freien Zeitpunkt tippen legt eine Karte mit diesem Termin an.
- **Wiederkehrende Aufgaben:** fester Rhythmus oder ab Erledigung; die erledigte Karte bleibt samt Verlauf erhalten, die nächste entsteht neu.
- **Push über die Companion App:** zur Fälligkeit, vorab, nachhaken, Tageszusammenfassung. „Erledigt" direkt in der Nachricht.
- **Stupsen:** einer anderen Person zu ihrer Karte einen Stups schicken („Denkst du dran?"). Mit Sperrzeit und Ruhezeit pro Person, damit niemand genervt wird.
- **Mehrere Personen:** Zugriff steuerst du unter Einstellungen › Personen & Zugriff. Wer Administrator in Home Assistant ist, stellt ein; alle freigegebenen Personen dürfen Boards, Karten und Kategorien anlegen.
- **Sensoren** für Home Assistant: überfällige und heute fällige Karten, gesamt und je Person, offene Stupse.
- Alles bleibt bei dir: SQLite im Add-on-Speicher, Teil des normalen HA-Backups.

## Installation

1. In Home Assistant: **Einstellungen → Apps → App-Store → ⋮ → Repositories**
2. `https://github.com/ArrestedOps/ha-stups` hinzufügen
3. **Stups** installieren, Personen und Notify-Dienste in den Optionen eintragen, starten.

Bedienung und Optionen: [stups/DOCS.md](stups/DOCS.md). Änderungen: [stups/CHANGELOG.md](stups/CHANGELOG.md).

## Dokumentation

| | |
|---|---|
| [stups/DOCS.md](stups/DOCS.md) | Bedienung und Optionen (steht auch in Home Assistant unter „Dokumentation") |
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

[MIT](LICENSE)
