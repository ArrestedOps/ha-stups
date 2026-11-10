<!-- ENTWURF, NICHT VERÖFFENTLICHT. Für r/homeassistant. Kurz halten (unter 200 Wörter), das GIF als Bild hochladen, nicht verlinken. Flair prüfen (Share your Projects). -->

**Title:** I built a Kanban board for our household as a Home Assistant app – push reminders with a "Done" button, nudges, and cards created from entities (washing machine done → "empty it")

Body:

We kept forgetting chores, so I built **Stups**: boards, agenda and calendar inside Home Assistant, made for the iPhone.

- Quick entry: `Take out trash tomorrow 7pm @Ben every week !!` → finished card
- Push via the Companion App with a "Done" button
- "Nudges" – a friendly poke for the person who forgot, with quiet hours
- Watchers: entity-based triggers that create and assign cards (washing machine, robot vacuum after 3 cleanings, "whoever gets home first") – no YAML
- English and German, data stays in the add-on (part of your backup)

One-click add: https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FArrestedOps%2Fha-stups

Heads-up: the source is viewable but not open source (PolyForm Strict – free for non-commercial use, no redistribution or changes). Feedback very welcome: https://github.com/ArrestedOps/ha-stups
