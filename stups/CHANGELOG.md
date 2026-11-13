# Changes

> 🇩🇪 [Deutsche Fassung](CHANGELOG.de.md) · This English version is the authoritative one.

## Unreleased

- **New design.** Stups looks calmer and more like an iPhone app: flat orange instead of glowing gradients, grouped lists with hairlines, a floating tab bar (Tasks · Boards · **+** · Calendar · Watchers) and four number tiles on Tasks. The board shows as a coloured dot with its name in every row; the check circle stays neutral. Dark mode follows the same rules, and the contrast of every colour pair is tested.
- **“Nudge” card on Tasks.** When someone nudged you, a card at the top lets you answer right there: **Done**, **On it** or **Later**. The card disappears after your reply and the row keeps a quiet trace with **Undo**.
- **Calendar.** Day, **3 days** (the default on the phone, swipe to page), week and month. On the desktop the calendar has its own entry in the sidebar.
- **Watchers as pages.** Every category opens as its own page, the same for all of them, with search, a filter (All · Active · Off) and “Show more” for large categories such as batteries.
- **Swipe on tasks (phone).** Swipe right to complete, swipe left for **Later** (moves the due date to tomorrow) and **Delete**.
- **Desktop.** A sidebar with the views (All open, Nudged, Today, Overdue, This week, Done), Boards, More and People; tasks as a table with a nudge bar and a quick-add line; calendar with a mini month and board selection; watchers with a list on the left (All, With a problem, Waiting, Running, Soon, Paused, categories); a command palette (**Ctrl/Cmd+K**), **/** focuses the filter field and **G** then **T / B / C / W** switches page.
- **“Card” is now “Task”** everywhere (app, messages, guide).
- **Search on the phone** under the title on Tasks.
- **Task details.** The properties are now a grouped list (Due, Assignee, Repeat, Reminder, Priority, …) with the value on the right; tapping a row opens its editor below it. On the phone a big **Done** button and **Move to tomorrow** sit under the list, and a nudge sent to you shows as the orange card with the three replies. On the desktop the details fill the full height on the right, next to the list.
- **New watcher assistant.** Templates as a list with icon and one-line explanation, a single progress bar (“Step 2 of 4”) and a plain “Back” in the header.
- **Settings, notifications and start screens.** Settings rows are single-line with the value on the right and **Done** at the top right; notifications are one grouped list with **Mark all as read** at the bottom; “No access yet” and sign-in lose the glow. Watcher categories have a **…** menu (pause all, turn all on, new watcher in this category); the last wizard step starts with a short WHEN / THEN / WHO summary.
- **Phone list rows.** Tasks and board cards now always show who is assigned, as photos and as first names in the line below, next to the date and the category. The calendar page gets the same header as every other tab (logo, Home Assistant, bell, settings). On the desktop the sidebar header no longer cuts off the gear and no longer scrolls sideways.
- **Watchers on the desktop.** Watchers are a group of their own in the sidebar (below Boards and Calendar) with the filters (With problem, Waiting, Running, Soon, Paused) and the categories. The page is one full-width table with rows of equal height; a click opens the whole flow (When, Then, Who, Done by itself) right below the row, where you can edit and save, instead of a window. “Activity” is a tab next to “Watchers” with the same table.
- **Long watcher names.** The watcher name now gets the most room in the table: the condition moved into the name cell (second line, next to the device) and a long name wraps onto two lines instead of being cut off. The sidebar shows each board with the symbol chosen in the board settings, in the board colour.
- **Tasks on the desktop open in place.** A click on a task opens it right below its row, in two columns (properties on the left; description, checklist, links and comments on the right), like the watchers. A second click, Esc or the close button folds it up again. The right-hand detail column is gone, so the list keeps its full width.
- **Phone: no more “Manage all watchers”.** The Watchers tab is where you manage them (open, switch on and off, add), so the extra button and the settings page behind it are gone. “Watchers from templates” now sits next to “New watcher” on the Watchers tab.
- **Watchers fire right away when created.** If the condition already holds when you create a watcher (the battery is at 16 % and the limit is 20 %, the door is already in the target state), the task is created at once, after the wait time counted from the last change. Editing an existing watcher still asks first. In the expanded watcher on the desktop, the four steps (When, Then, Who, Done by itself) now sit one under the other, so editing one no longer breaks the layout.
- **Desktop: “View for” and a new open task.** The people are no longer at the bottom of the sidebar: a field **View for** sits at the very top (All, you, the others) and applies to tasks **and** watchers; a chip such as “Only Ben ✕” next to the title shows what is filtered. An opened task now has its properties as a grid of fields (label above, value below) instead of the long list, with notes, checklist (with progress) and links on the left and comments and history as tabs on the right.

## 1.41.1

Fixes after a review. No new features.

- **Privacy.** “Recognise icons from titles” showed administrators the titles of cards from other people's private boards and could set icons there. Both now only apply to boards you may see yourself.
- **Recently done** also shows what was finished today when the card was due weeks ago or never had a date: it asks for the completion date, not the due date.
- **Phones in the setup.** The last phone can be deselected again and is saved that way. “Ann” no longer finds a phone called “Anna's iPhone”, and a device that matches the names of two people is preselected for neither. A child can send the test message to their own phone in the setup; adding the phone stays an adult's job, and the text says so. The error text is “The test message could not be sent” and names the reason; the final page only promises “From now on your home speaks up by itself” if a watcher was set up.
- **Working at the same time.** “Undo” after “Move overdue” only restores cards whose date is still as the move left it. If someone has set another date in the meantime, their decision stands, and Stups says so. “Move all overdue to today/tomorrow/weekend” and “Tomorrow” write with the version the list has seen: a card changed in the meantime stays as it is, and the message says it could not be moved. An error on one card no longer stops the others.
- **Tasks load faster and completely.** The date list was silently cut off at 2000 cards. It now arrives page by page and complete; with 6000 cards the server needs about a third of the time. Quick successive changes reload once instead of several times, and outdated requests are cancelled.
- **Docker no longer runs as root.** Without Home Assistant, a small entry point hands the data folder to the user `node` (ID 1000) and starts Stups as that user. Existing data and a new volume both work; folders that cannot be handed over (network drive) run as root as before, with a note in the log. **Nothing changes in the Home Assistant add-on**: it stays root, like every add-on.
- **Smaller things.** Calendar and Tasks assign cards just before and after midnight to the right day. Import cycles between files in the server and the interface are resolved, and a new test prevents new ones.

## 1.41.0

- **Setup on first start.** The first time an administrator opens Stups, a short setup (about three minutes) guides them: **Who lives here?** (the people from Home Assistant are preselected, phones are detected from Home Assistant's own assignment, anyone without a phone gets a link to the Companion App, and you mark the children), **Your first watcher** (the same “Found” list and assistant as under Watchers), **Test message** (a real example of the message a new card sends, with a preview like on the iPhone) and **Done**. Every step can be skipped; where you stopped is saved on the server, so you can carry on on another device. Members see a short version. Existing installations do not show it by themselves; it can be opened at any time under *Settings › Help and data › Go through the setup again* (not for children).
- **Options in the app.** People, push devices, access, dashboard and the two times are now set in the app, no longer in the Home Assistant configuration. At the first start after the update, Stups takes over what is entered there, once, and removes nobody; after that the app is in charge, and changes in the configuration no longer have any effect (people and access are no longer locked either). New: **Settings › Reminder times** (for administrators and people with the “App settings” permission, where push is available) with the daily summary and **Follow up at …** (default 18:00), which could only be set as an option before. New installations only see the log level and the empty list of people in the configuration; the other options appear with the switch “Show unused optional configuration options”. In Docker nothing changes except the new setting, which takes precedence over `STUPS_OVERDUE_NAG_TIME` there.
- **Faster start, especially on the go.** The start now loads about 198 kB (compressed) instead of 369 kB: rarely used windows, the Watchers tab, the English text and the icon keywords load on first use. The Inter font only has the Latin characters (Cyrillic, Greek and Vietnamese appear in the system font). The Docker image is leaner.
- **Guide reorganised.** “Getting started” and “If something does not work” come first, the page names match the app, and the deprecated add-on options are at the bottom. The changelog is split by language (`CHANGELOG.md` English, `CHANGELOG.de.md` German).
- **Smaller fixes.** The name field in the board settings is no longer reset while you type. The code is split into smaller parts (watchers, API, interface); the app does not change because of it.
- Database: **migration 30** (setup progress), preceded by a backup as always.

## 1.27.1

**Links open in the phone's browser.** A link on a card now opens in a new tab / the default browser instead of a black window inside the app.

## 1.27.0

- **Private and shared boards.** Each board is visible to "Only me", "Everyone in Stups" or "Selected people". Nobody else sees a private board, not even administrators; the server hides it everywhere (cards, Today, calendar, notifications, attachments, sensors, live sync). Existing boards stay visible to everyone. Children can create "Only me" boards.
- **Fairness per board.** A switch decides whether a board counts towards the weekly fairness (private boards never do; retroactive). Watchers have their own switch.
- **Watchers know who may be responsible.** Only board members can be chosen, private boards cannot be targets, and removing a person from a board first shows every affected watcher. A watcher left without anyone to assign is marked "needs new assignees" (red, at the top of the list) and creates no cards until you choose someone; the bell tells the right people.
- **Bell with a small number** instead of a dot. Watcher names are just the template name; created cards get the entity added ("Replace battery: Nuki lock").
- **Repeat without a due date, hourly, and a small delay is okay.** The repeat row is always tappable, "Hourly" (optionally only within a time window) is new, and weekly/monthly rules can tolerate a few days of lateness. Every option shows a live example.
- **Nudge yourself.** "Remind me again if not done" on tasks (after X, repeat every X, at most N times; only for you). Watchers can nudge the people responsible after a time, repeating, with a maximum.
- **Boards: selection, settings, delete, archive, duplicate.** The board list shows only boards; "New board", "Board settings" (name, icon, who sees it, fairness, columns …) and "Archived boards" sit below it. Deleting a board lists its tasks, repeating tasks, watchers and reminders, and for each watcher you choose pause, move or delete. Boards can be archived, duplicated or saved as a template; the order can be changed.
- **Beta badge** next to the logo in the beta app only.
- **Back online by itself.** After the phone slept, the app reconnects immediately and no longer stays on "Offline".
- Database: **migrations 27 to 29** (board visibility and fairness, reminders, archived boards), with a backup beforehand as always.

## 1.26.0

- **Desktop layout (from 1024 px wide).** A fixed sidebar replaces the bottom bar (tabs, boards, user card), the header has search (Ctrl/Cmd + K), "New task", Home and the bell. Tasks open in a detail column on the right, Boards are a full-width Kanban, Watchers a table. Windows open as a centred dialog. Phones and the Companion App look exactly as before; tablets show the phone view centred.
- **Watchers: all watchers always visible**, sorted by **category** (suggested when you create one, or your own), collapsible, each with an **on/off switch**. Running ones stay on top. On the desktop it is a table with condition, current value, status, last trigger, next card and who. Creating a watcher on the desktop is **one form that unfolds above the list**; on the phone the assistant stays, now with a "Back" button in every step.
- **Watchers: the device is in the name** ("Battery low: iPhone Rene"), existing ones show the entity's friendly name below the title and the current value at the top right; one button adds the device to old names (only with your consent).
- **Watchers: "Found" suggests every matching device**, grouped by template with search (no more limit of five per template).
- **Watchers: already met when you create it?** Levels like a battery below the limit create the card right away. For everything else the app asks "Create the card now?". Fixed: battery watchers were shown as "Running", and after an update all watchers briefly showed "Entity missing".
- **Tasks: the three numbers are tappable** and open a sheet (due today, overdue with "Tomorrow" / "Move all", done today with Undo). **Chips** are now All, Mine, people; the app always starts on "Mine".
- **Permissions.** An administrator can give individual people specific rights (watchers, announcements and lamps, app settings, people, confirming for children, feedback) without making them administrators.
- **Feedback.** Report bugs, suggest improvements, praise or criticise from inside the app (type, up to 1000 characters, optional picture); administrators read it under Settings › Help and data. Everything stays on your installation.
- **Security and robustness.** Several hardenings (login behind a reverse proxy, uploads, link previews, the move export without secrets, push actions only for the assigned person), a more robust connection to Home Assistant and a more careful database migration. Update recommended.
- Database: **migrations 24 to 26** (feedback, permissions, watcher categories), with a backup beforehand as always.

## 1.25.1

- **New design.** Three tabs: **Tasks, Boards, Watchers**. The app always opens on Tasks. Tasks has stats, a week strip, the stups banner, person chips with their pictures, a filter sheet and groups (Overdue, Today, This week, Later). The header has **Home** (back to Home Assistant), **Notifications**, **Settings** and your picture. Every list uses one row: round tick, **icon tile**, title, date • category • priority, and the people on the right
- **Icon per card.** About 300 icons with German and English search words; Stups picks one from the title (sparkle badge). Choose it in a sheet with search, suggestions, recently used and colour. A new date and time sheet. In Settings › Icons you can let Stups detect icons for existing cards
- **Filter.** One filter for Tasks and Calendar: who, when (several at once), boards, priority, only with an open nudge, only from watchers, show done, sorting. It is remembered per device
- **Notifications (bell).** A real inbox per person with read marks, "Mark all read" and filters. The **Home** button takes you back to your dashboard, which every person chooses in Settings › Home Assistant (preselected: your Home Assistant default dashboard)
- **Watchers.** The editor is a flow (When → Then card → To whom → Done by itself) with the **history of the entity** (last 3 hours, threshold, trigger points). A four-step assistant creates new ones; "rotation" is preselected. Long entity names wrap
- **Everything else in the new style:** calendar, boards (switch, settings, archive, trash), settings, people and access with push status ("x of y devices reachable"), dashboard button, login and account, dialogs. The daily summary time can be set in the app. Almost all tick boxes are switches now
- **Swipe** right = next status, left = back. **Priority** high glows red, medium is orange
- **Home Assistant 2026.8 and later:** Stups takes over the safe-area padding itself: no black strip above or below, the bar reaches the bottom edge
- **Fixes:** a security hole in the standalone container login (encoded paths) and the diagnostics routes for children; "Undo" on a recurring card no longer deletes the next card after you worked on it; open confirmation requests, the "Done" column, wrong field types and recurrence limits; live sync after the phone wakes; delete and access messages
- Database: **migrations 22 and 23** (with a backup beforehand as always)

## 1.18.2

- **Found: hide suggestions.** Every suggestion (washing machine, waste calendar, battery …) now has a **Hide** button. Whatever you do not have, Stups never suggests again, not even after a restart. Under **Hidden (n)** it is listed with **Show again**, in case you need it after all. It applies to all administrators; the next suggestion of the same kind moves up
- Database: migration 21 (a small table for the hidden ones, with a backup beforehand as always)

## 1.18.1

- **Always opens on "Today".** Anyone who was last on Home used to land there again on the next start. Now the app always opens on Today; only Boards and Calendar are remembered
- **Home: open a watcher directly.** Tapping a watcher opens it. **Administrators edit it right there** (sentence, More rules, Test, Pause, Delete). **Everyone else sees it read-only:** settings and history, without saving and without changes (the server refuses them anyway)
- **History visible.** At the bottom of Home is the **recent activity** of all watchers; inside a watcher the history of its runs, older ones on request. The "Quiet" line is now a list, every entry tappable
- No change to the database

## 1.18.0

- **A new start page, "Today".** The bar at the bottom is now **Today · Boards · Calendar · Home**. Today shows what is on for you: **From the house** (cards from watchers, with what triggered them, when, and why you are up; buttons **Done**, **Pass on** and, with "Suggest first", **Take it**), **For you** (your cards due until tomorrow) and a line **With the others** that leads to **This week** (the former fairness view, now with "Waiting for you" for confirmations and the number of cards that came from the house). The agenda is now the fourth calendar view, **List**
- **One header on every tab.** "‹ Dashboard" on the left (in the app), an offline notice and your **avatar** on the right, which opens the settings (the gear is gone). **Pictures of people:** from Home Assistant (always fetched through Stups, never directly by the browser) or uploaded by you; administrators can change them for others
- **Home** shows the state of the watchers: waiting for someone (with **Nudge**), running now, coming up (counter, next appointment), quiet; without a connection to Home Assistant it says since when
- **Watchers from templates.** "Found" detects in Home Assistant what a watcher fits (washing machine, dryer, dishwasher, waste calendar, rain, batteries, robot vacuum), with a reason. The form is a **sentence with tappable fields**, plus a **trial run** on the last 7 days ("3 triggers detected, no false alarm"). New triggers: **an appointment in a calendar with a lead time** and **rain in the forecast** (queried every 30 minutes). Templates without a device create repeating cards (descale, test smoke detectors, change the filter, change the bedding)
- **Pass on, suggest first, little time.** Passing on sends a card from the house to the next person in the rotation. "Suggest first" asks everyone who is home "Who takes it?", whoever taps first gets it, after 30 minutes the fallback applies. Whoever has **little time** (up to 90 days) is skipped by the rotations
- **Settings** are now an organised page with sub-pages: For me (notifications, language and colour, account), Household (people and children, watchers, templates, dates), Home Assistant (dashboard and header, announcements and lamp), Help and data (why does nothing arrive?, bin, archive, move, beta). Nothing was lost; members do not see "Household" and "Home Assistant". The version and the diagnostics page are at the bottom
- **Colours:** teal is the colour for everything that comes from the house, and the colour wheel leaves out green and teal. Headings use their own font (bundled locally in the app, no download)
- Database: migration 20 (with a backup beforehand as always). Without watchers nothing else changes for anyone

## 1.17.0

This version combines everything that ran in the beta app as 1.16.0 and 1.17.0.

- **Stups in the house.** A nudge (and, if you like, a due-date reminder or a watcher card) can arrive in the house: as an **announcement on a speaker** ("Ben, Anna nudges you: Take out the trash. Are you on it?") or as a **lamp that lights up for five seconds in the person's accent colour** and then returns to what it was. Meant for children without a phone. Needs the connection to Home Assistant. Administrators set it up under Settings › People & access (speech service once, then channels per person); each channel can be switched on and off, chooses which messages may arrive, and what happens when the person is not at home (discard, or wait until they come home). The person's quiet time applies
- **Fairness.** Agenda › "Dates | Fairness": who completed how much this week or this month, as a bar for the **effort**. Every card has an optional effort (small, medium, large; without it, medium). **No ranking:** no places, no medals, the order is that of the people list. If you like, switch on a **Sunday-evening summary** for yourself (off until you switch it on, never "0")
- **Child role.** Settings › People & access › Child role (administrators only). A child sees all boards or only those with their own cards and can tick off their own cards, comment, and attach photos and links, nothing else; the **server** refuses everything else. The app shows a reduced interface
- **Confirmation.** Switchable per child, overridable per card: the child ticks a card, it **waits for confirmation**, and the adults get **Confirm / Again** (in the message or in the card). Confirmed, it counts **for the child**; "Again" sends it back, spoken in the house if a house channel exists. Unanswered requests remind the confirmers after two hours, at most once a day. If nobody is chosen as confirmer, all adults may confirm
- **Board templates.** When creating a board, start empty or from a template (Household, Moving house, Renovation, Packing for a trip, Baby on the way, Ideas and outings) with a preview. Save your own boards as templates
- Database: new tables and columns for house channels, templates, effort, summary and the child role (migrations 16 to 19, with a backup beforehand as always). Without children, templates and the Sunday summary, nothing changes for anyone

## 1.15.0

This version combines everything that ran in the beta app as 1.13.1, 1.14.0 and 1.15.0.

- **Stups is available in English.** If your device (iPhone, browser) reports English, Stups shows the interface in English: board, cards, agenda, calendar, watchers, settings, messages. **A German device keeps seeing German, nothing changes for it.** Settings › Language: "Automatic", "Deutsch" or "English"; it applies to you on all your devices and takes effect at once
- **Quick entry understands English:** `Take out trash tomorrow 7pm @Ben #Home every week !!`, also `in 3 days`, `next Monday`, `Dec 1`, `at 18:30`, `every 2 weeks`, `important`. Times, dates and weekdays follow the language
- **Push messages, the daily summary, nudges and error messages arrive in the language of the person.** The server remembers the language your device last reported (or your choice in Settings). **Anyone who has not reported a language yet keeps getting German push messages** until the app has been opened once. Nudge templates arrive in the recipient's language, your own texts stay as written
- A new board gets its columns ("Open", "Planned", "In progress", "Done", or the German names) in the language of the person; existing boards and names you chose stay. Watcher run notes appear in the language of the interface, and the app options in Home Assistant are available in English. The names of the Home Assistant sensors stay German for now
- **Your own colour.** Settings › Colour: a colour wheel on which you tap or drag your favourite hue. Buttons, the active tab, the plus button and coloured text follow at once. It applies to you on all your devices, everyone picks their own; "Orange (default)" restores the original look. Light and dark are calculated separately, and the text on buttons stays readable for every hue. The urgency bars on cards (red, orange, yellow) stay as they are
- **The plus button always creates an open card**, even when "Done" or "In progress" is showing; if you pick a date after today, the card goes to "Planned". On the desktop there is only the one orange plus button instead of one per column, as on the phone
- **Settings gear.** A subtle gear without a frame at the top right of every tab (Boards, Agenda, Calendar, Watchers) opens the settings; the way through the board name stays
- **Fixed:** ticking two boxes quickly under "Carry over to the next card" could lose the first one when the server was slow. They are now saved in order and the display follows your tap at once
- **Faster:** "People & access" opens at once in the standalone container; without Home Assistant it used to wait 2 to 3 seconds for a Home Assistant that does not exist
- **Documentation:** README, app documentation and Docker guide are now in English (the German versions stay as `*.de.md`), with English screenshots and a short demo GIF
- Database: two new columns for the language and the hue of the person (migrations 14 and 15, with a backup beforehand as always)

Versions before 1.15.0 exist only in German: see [CHANGELOG.de.md](CHANGELOG.de.md).
