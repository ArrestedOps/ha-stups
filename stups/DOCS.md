# Stups

> 🇩🇪 [Deutsche Fassung](DOCS.de.md). This English version is the authoritative one.

A Kanban board for the household, right inside Home Assistant (Ingress, no separate login). Several boards, recurring tasks, push reminders with a "Done" button and live sync between all devices.

## Setup

1. Start the app and open **Stups** in the sidebar.
2. Open **avatar at the top right › Household › People and children** (administrators):
   - **Add people:** the people from Home Assistant (Settings › People) are offered. Whoever is added can be assigned cards and receives push messages.
   - **Choose push devices:** tick, per person, the devices that should receive the messages. The devices where the Home Assistant Companion App is signed in appear. Everyone chooses their own devices; an administrator can also do it for others.
   - **Set access:** *Everyone in Home Assistant* (every Home Assistant user may open the app) or *Only these people* (only the list and administrators; anyone else who opens it sees "No access" and appears for administrators under "Waiting for approval").
3. Under **Settings › Home Assistant › Dashboard and header** choose the dashboard for the "‹ Dashboard" button at the top left.
4. **Settings › For me › Language and colour:** Automatic (follows the device), German or English. The choice applies to you on all your devices, push messages included.
5. **Settings › For me › Language and colour:** pick your favourite colour on the colour wheel (green and teal are missing: teal belongs to the house, see "Today"). Buttons, the active tab and coloured text follow at once; it applies to you on all your devices. "Orange (default)" restores the original look.

### Roles

- **Administrator** is whoever is one in Home Assistant. Administrators change people, access and the dashboard and always get in.
- **Members** use the app and choose their own push devices.
- **Children** are people with limited rights (see "Child role and confirmation"). An administrator is never a child.
- Whoever is removed from the list loses assignments and messages; the cards stay unchanged. If the person comes back, everything applies again.

### Add-on options (configuration in Home Assistant)

You can also set everything in Home Assistant, under **Settings › Apps › Stups › Configuration**:

```yaml
users:                       # Who uses Stups and where the push messages go
  - name: Anna               # Name as in Home Assistant (Settings › People)
    notify:                  # Notify services of the Companion App, without "notify."
      - mobile_app_annas_iphone
  - name: Ben
    notify:
      - mobile_app_bens_iphone
      - mobile_app_bens_ipad
access_mode: selected        # selected = only these people and administrators, everyone = all Home Assistant users
dashboard_path: /            # Default for the back button, can be changed later in the app
daily_summary_time: "08:00"  # Daily summary
overdue_nag_time: "18:00"    # Follow-up for overdue cards
```

You find the device names in Home Assistant under Developer tools › Actions (services `notify.mobile_app_…`); in the app, Settings › Household › People and children shows which devices Home Assistant knows.

**Two ways, one result:** if at least one person is entered under `users`, **this list applies** (at every start of the app): the people named are created and get their devices, whoever is not on the list is no longer a person (their cards keep the assignment), and access follows `access_mode`. In the app, people, devices and access are then locked and can only be viewed; display name and quiet time can still be changed. Restart the app after changing the configuration. If `users` stays empty, you manage everything in the app under Settings › Household › People and children, and without a choice "Everyone in Home Assistant" applies.

## Usage

- **Boards** are switched by the title at the top. Each board has its own columns and categories. The easiest way to create categories is directly on the card (field "Category" › "New category"); renaming, recolouring and deleting works under Board switcher › Board settings. A new board gets the columns "Open", "Planned", "In progress" and "Done" in your language.
- **Cards** have a title, column, assignees, due date (always with a time), repeat, reminder, priority, categories, cost, description, checklist, links, attachments and comments.
- **Completing:** the circle on the left of the card, "Mark as done" at the top of the card window, or from the push message. For a moment there is "Undo".
- **Swiping:** swiping a card to the left moves it to the next status, to the right to the previous one. Behind the card it says where it will jump. "Planned" is skipped.
- **Moving and more:** via "⋯" on the card (Move to …, Mark as done, Duplicate, Details, Delete). On large screens cards can be dragged with the mouse.
- **Planned:** cards with a due date after today sit in "Planned" and move to "Open" on the due date. This keeps "Open" tidy. Per board you can choose which column is "Planned" and which is "Done".
- **Settings** are behind the **avatar at the top right** of every tab.

### Creating cards quickly

In the **New card** window a single line is enough. Stups reads date, time, repeat, people, category and priority out of it; the rest is the title:

```
Take out trash tomorrow 7pm @Ben #Home every week !!
```

gives the card "Take out trash", due tomorrow 19:00, assigned to Ben, category Home, every week, high priority. Recognised parts are highlighted in colour in the text, and **chips** below show what was understood. **Tapping a chip undoes it** (the text then stays in the title, for example when "Monday" is part of the title). What you change by hand below the title no longer overwrites the line.

| What | Examples (English) |
|---|---|
| Date | `today`, `tomorrow`, `Friday`, `next Monday`, `on Friday`, `in 3 days`, `in 2 weeks`, `in a month`, `1 December`, `1st Dec`, `Dec 1`, `December 1st 2027`, `1.12.` |
| Time | `7pm`, `7:30pm`, `19:30`, `at 7`. If only a date is given, the **default time** applies (Settings › Defaults, default 09:00) |
| Repeat | `every day`, `daily`, `every week`, `weekly`, `every 2 days`, `every 3 weeks`, `every Monday`, `monthly`, `yearly` |
| Person | `@Ben` (a unique beginning is enough: `@be`) |
| Category | `#Home` (from the current board; a new one is created after confirmation) |
| Priority | `!` medium, `!!` or `important` / `urgent` high (`!` only as a word of its own: "Warning!" stays a title) |

In German the words are `morgen`, `19 Uhr`, `jede Woche`, `wichtig` and so on; the recognised words follow the language of the app.

Good to know: a **weekday** on its own means the next one after today (if today is Monday, "Monday" is the Monday in a week). A **date without a year** means the next occurrence. If you only write "today" and the default time has already passed, the due date gets the next full hour. If an `@person` does not fit (unknown or ambiguous), creating waits until you change the name or tap the chip, because otherwise no reminder would come.

### Appearance

Dark and light follow the iPhone (or the device). A coloured **bar on the left** of every card shows urgency: red overdue, orange today, yellow in the next two days, grey later. The card shows the title (at most two lines) and **one line** with the most important things: due date (red when overdue), repeat, priority as a flag (orange medium, red high), checklist ("1/2"), comments, links, attachments and cost. **Categories** appear as small coloured dots on the right. When the card was created ("Created …") is shown in the card window with time and person.

### The four tabs and the header

The bar at the bottom has four tabs: **Today** (the start: the app always opens there, only Boards and Calendar are remembered), **Boards**, **Calendar** and **Home**. A child and the container without Home Assistant have three (no Home). The same header sits on every tab: **"‹ Dashboard"** on the left (add-on only; takes you back to the Home Assistant dashboard), an **offline notice** on the right when the connection is missing, and your **avatar**. The avatar opens the settings. It shows your picture (from Home Assistant or uploaded by you) or your initial in your colour.

Two colours: your **accent** (orange unless you pick one) belongs to people and actions; **teal** belongs to everything that comes from the house (watcher cards, Home). That is why green and teal are missing from the colour wheel.

### Today

Today shows at a glance what is on for you:

- **From the house** (only when there is something): open cards from watchers that are assigned to you or to nobody yet. Each shows what triggered it and when ("Washing machine done · 4 min ago") and why you are up ("in turn among everyone who is home"). Buttons: **Done**, **Pass on** (to the next person in the rotation, without counting as done) and, with "Suggest first", **Take it**.
- **For you:** your open cards with a due date until the end of tomorrow, overdue and today first. The time is red when overdue and in the accent colour when due today.
- **With the others:** one line with the avatars and the number of open cards. It leads to **This week**.

A child only sees "From the house" (its own cards) and "For you". When nothing is open, a friendly sentence appears.

### This week: who does how much?

Through "With the others" on Today you reach **This week** (or this month). It shows how many cards each person completed, as bars for the *effort*. There is **no ranking**: no places, no medals, no percentages, the order is that of the people list, all bars have the same colour. The point is to see the load, not to compete.

- **Effort:** every card has an optional *effort* (small = 1, medium = 2, large = 3). Without a choice it counts as medium. A large task weighs more than a small one.
- Below the bar, when there are any: cards created, nudges answered and watcher cards completed. One line tells how many cards **came from the house** this week. If somebody has **little time**, it says so.
- **Waiting for you:** confirmations from children that you may give, with **Looks good** and **Once more**.
- Cards from children with confirmation only count **after** the confirmation. Children do not see the page.
- **Sunday summary (optional):** every person can switch on a message on Sunday evening under *Settings › For me › Notifications* (from 18:00, not during quiet time): "This week you completed 14 tasks together." It is off until somebody switches it on, and it never says "0".
- **Little time:** whoever has a busy week sets a date under *Settings › For me › Notifications* (up to 90 days). Until then the watchers' rotations skip that person. You can still assign cards by hand. Administrators can set it for others too.

### Calendar

The third tab at the bottom shows the cards with a due date in a calendar, as **Day**, **Week**, **Month** or **List**. The arrows page through, "Today" jumps back.

- **Day and week** show a time grid. A card sits at the time of its due date in the colour of its board; cards at the same time sit side by side. A tap opens the card, a tap on the day number in the week view opens the day.
- **Month:** dots (on a large screen the titles) show where something is due. A tap on a day opens the day view.
- **Creating a card:** tap a free time in the grid. A short form opens with the due date: choose title, board and assignees, "Create". If exactly one board or person is chosen in the filter, they are preset. "All fields …" opens the full form.
- **List:** the former agenda. All cards with a due date from all boards, sorted by day: **Overdue** first, then Today, Tomorrow and every further day. Tap the circle on the left to complete a card, tap the card to open it. It loads the next 60 days; if nothing is due in that time it looks a year ahead, and **"Load 60 more days"** fetches cards further away.
- **Filter:** the "Filter" button at the top right (in the list: the chips above it) filters by **people** (yourself, every other person, "Nobody" for cards without an assignee) and **boards**; **Done** shows the ones completed in the last seven days, "Reset" clears all filters. The filter is remembered on the device.

### Recurring tasks

- **Fixed rhythm** (e.g. every Saturday): the next due date follows the plan, not the completion. Whoever completes on Monday what was due on Saturday gets the next Saturday.
- **After completion** (e.g. filter every 3 months): the next due date is the completion date plus the interval.
- **On completion** (in the app, by swiping, by dragging to "Done" or from the push message) the card stays **in "Done"** and no longer repeats. It shows when it was completed and keeps everything: comments, photos, checklist and history. At the same time a **new card** with the next due date is created, at the top of "Open" or, for a due date after today, in "Planned". The history of the new card says "Created from a repeat".
- **What the new card carries over:** title, assignees, categories, priority, repeat and reminders always. Description, checklist (all items open again), links, cost, photos and PDFs, and comments can be switched on or off per card in the **Repeat** field under "Carry over to the next card". Without your own choice, description, checklist, links and cost are carried over, photos and comments are not. Photos carried over share the file with the completed card.
- **"Undo"** (shortly after completing) reverses both: the card is open again, the new one disappears. This is no longer possible once the new card itself has been completed.
- A note on repeats: after completing, the next due date is on the **new** card. If you want to change the due date, do it there, not on the completed card.

### Notifications

Recipients are always the **assigned** people. Cards without assignment or without a due date do not notify. When creating a new card, the creating person is therefore preselected, and whoever sets a due date on a card without assignees gets a hint with "Assign to me". Whether a message comes for a card is shown by Settings › Notifications › "Show status".

- when due, optionally in advance (15 minutes to 2 days before) and a daily follow-up while overdue
- a summary with your own tasks every morning
- on the iPhone the **"Done"** button appears when you expand the message (swipe left and "View", pull down, or long-press)
- after a restart, missed reminders up to 12 hours back are caught up, without duplicates
- Messages arrive **in the language of the person**: the language their device last reported (or their choice in Settings). Until a device has reported one, push stays in German.

### Nudging

With **Nudge** you give another person a friendly nudge for a card ("Are you on it?"). The button is in the card window and in the "⋯" menu of every card. It applies to all people listed under Settings › Household › People and children.

1. **To whom:** the card's assignees (except you) are preselected. If there are none, you choose. Whoever has no push device appears greyed out with a hint.
2. **Message:** one of the four templates or your own text of up to 120 characters (it replaces the template).
3. **Send nudge.** The card hops briefly, a hint confirms it.

The person gets a push message with three buttons (on the iPhone expand the message):

- **Done** completes the card like the familiar "Done" button; for a repeat the new card is created.
- **On it** sends the sender "… is on it 👍".
- **Later** delivers the nudge again in an hour, at most three times. After that the button is gone. The sender is not told, the card's history shows it.

If someone completes the card (wherever), every sender of an open nudge gets "… has done it ✓", unless they completed it themselves. Feedback arrives quietly. A nudge with a template arrives **in the recipient's language**; your own text stays as written.

**So that it never annoys:**

- Per card, sender and recipient at most **one nudge every 30 minutes**. The sheet shows "again from 14:32".
- **Quiet time** (default 22:00 to 07:00): nudges to a person during their quiet time are delivered at the end. The sender sees "delivered at 07:00". Everyone sets their own quiet time (Settings › For me › Notifications) or switches it off. The quiet time only applies to nudges, not to reminders when due.
- If the card is completed or deleted before a waiting nudge is delivered, it lapses.
- You cannot nudge yourself. That is what the due date and advance reminder are for.

On the card an orange badge "Conny nudges you" shows when someone nudged you, and a subtle hint "You nudged Conny" for your own. The **Nudged** filter above the list shows the cards with an open nudge to you. "Show status" in the settings lists the nudges with their state.

### House channels: announcements and lamps

A nudge (and, if you like, a due-date reminder or a watcher card) can arrive **in the house** instead of on a phone. That is meant for children without a phone, and for everybody who is at home and not looking at a screen. It needs the connection to Home Assistant.

Administrators set it up: choose the speech service once under **Settings › Home Assistant › Announcements and lamp**, then open a person under **Household › People and children** and add channels under **House**:

- **Announcement:** a speaker (`media_player`). Stups says, for example: "Ben, Anna nudges you: Take out the trash. Are you on it?" You can set a volume; afterwards the speaker goes back to its previous volume.
- **Lamp:** a light that lights up for five seconds in the person's accent colour and then returns to what it was before (also when it was off).

Each channel can be switched on and off on its own. For every channel you choose **which messages may arrive** (nudges, due dates, watcher cards; a new channel only has nudges) and **what happens when the person is not at home**: *discard* the message, or *wait until the person comes home* (with a time limit in minutes; the message is dropped if the card is done or the nudge answered in the meantime). **Test** tries the channel right away.

Good to know:

- The person's **quiet time** applies: nudges wait until it is over, due-date reminders and watcher cards are dropped during it.
- "At home" comes from the person in Home Assistant (matched by user, otherwise by name). If none matches, Stups treats the person as at home, and the settings say so.
- Someone with only a house channel can still be nudged and assigned cards.
- What happens to music that is playing is up to the speaker: some lower the volume, some pause, some play on. A lamp that cannot show colours simply lights up white.
- There are no buttons in a house message. You finish a card in the app.
- In the **beta**, house channels stay silent until push is switched on (Settings › Beta), so nothing is announced twice.
- The overview under Settings › Notifications shows every channel with its last result.

### Child role and confirmation

Administrators can turn a person into a **child** under *Settings › Household › People and children › Child role*. A child gets a reduced app, and the server enforces it (not just the screen):

- A child **sees** all boards or only the **boards with their own cards** (your choice per child) and can **tick off** their own cards, tick checklist items, **comment**, and attach **photos and links**. Nothing else: no creating, moving, deleting, no board management, no watchers, no fairness, no settings except language and colour.
- **Confirmation:** per child you can switch on *"Done" needs confirmation*, and per card you can override it (*Confirmation*: person's default, always, never). When the child ticks a card, it stays open and shows **"Waiting for confirmation"**. The **confirmers** get a push message with **Confirm** and **Again**:
  - *Confirm* completes the card. It counts for the **child** (recurrence, fairness, watcher counters).
  - *Again* withdraws the request. The child gets "Again, please" (on the phone and, if a house channel is set up, spoken in the house, except in quiet time).
  - Who answers first decides; the others see that it is already answered. Unanswered requests remind the confirmers after two hours, at most once a day.
- **Who confirms:** administrators always; besides them the people you choose per child. If nobody is chosen, all adults may.
- Whoever completes a waiting card another way (an adult in the app) ends the request.

### Settings

The avatar at the top right opens the settings as an overview with sub-pages. At the top are your picture, your name and where the picture comes from; **Change picture** uploads your own (JPEG, PNG or WebP up to 2 MB, shrunk to 256 pixels on the device), **Remove picture** goes back to the picture from Home Assistant or to the initial. If your person is matched with a person in Home Assistant that has a picture, Stups fetches it from there (never directly in the browser, always through Stups). An uploaded picture takes precedence. Administrators can also change the picture for others.

| Group | Pages |
|---|---|
| **For me** (everyone) | Notifications (test to me, my devices or ntfy topic, quiet time, Sunday recap, little time) · Language and colour · Account and sign-in (container only) |
| **Household** (administrators) | People and children · Watchers · Templates (board templates) · Dates (default time) |
| **Home Assistant** (administrators) | Dashboard and header (back dashboard, hide the HA header, Bubble Card button) · Announcements and lamp (speech service) |
| **Help and data** | Why does nothing arrive? · Bin, archive, move · Beta (beta only) |

At the bottom are the version and the link to the diagnostics page. Members do not see "Household" and "Home Assistant"; a child only sees "Language and colour". The "hide the HA header" choice only applies to the device; members find it under *Language and colour*.

### Board templates

When you create a board (board switcher), you can start **empty** or from a **template**, with a preview of columns, categories and cards. Built in: *Household, Moving house, Renovation, Packing for a trip, Baby on the way, Ideas and outings*, in the language of your app. Under *Board settings › Templates* you can **save a board as a template** (columns, categories and open cards, without assignees, attachments and comments) and delete your own templates.

### Watchers: cards created automatically from Home Assistant

A watcher observes an entity in Home Assistant and **creates a card and assigns it by itself** as soon as something happens. The standard example: the washing machine is done, and a person who is at home gets the card "Empty the washing machine" (due in 30 minutes) along with a push message. Only Home Assistant **administrators** may set up and change watchers; everyone sees them.

![The Watchers tab](https://raw.githubusercontent.com/ArrestedOps/ha-stups/main/docs/images/en/waechter-liste-dunkel.png)

**Home shows the state, not the rules.** The **Home** tab (fourth tab, for all adults) sorts the watchers by what is going on: **Waiting for someone** (a card is open: who is up, since when, **Nudge** button), **Running now** (the machine is running: since when, which card comes next), **Coming up** (the counter is at "2 of 3", or a calendar appointment is due) and a **Quiet** line with the watchers that report nothing. Without a connection to Home Assistant it says "No connection to Home Assistant since …" (boards and cards keep working). Administrators also see "Stups has found N more devices". **Tapping a watcher opens it:** administrators edit it right there (sentence, More rules, Test, Pause, Delete), everyone else sees settings and history read-only. At the bottom is the **recent activity** of all watchers; inside a watcher the history of its latest runs.

**Managing** (list, on/off, edit, delete, recent activity): *Settings › Household › Watchers*. All adults see the list, **administrators** change it.

**Setting up, easiest via "Found":** *Settings › Household › Watchers › Watchers from templates* (or the hint on Home). Stups looks in Home Assistant and shows what a watcher fits, with a reason ("Socket dryer measures the power"): washing machine, dryer, dishwasher (power sensor or the appliance's programme status), put the bins out (waste calendar), laundry in it is raining (weather), battery low, robot vacuum bin. **Set up** fills in the sentence; entities that a watcher already observes are left out. **If a suggestion does not fit** (you do not have that device), tap **Hide**: Stups never suggests it again. Under **Hidden** you bring it back with "Show again". Below, **Also without a device**: cards that repeat by themselves (descale, test smoke detectors, change the filter, change the bedding), no watcher needed. "View all templates" also shows the ones nothing was found for.

![Edit a watcher](https://raw.githubusercontent.com/ArrestedOps/ha-stups/main/docs/images/waechter-bearbeiten-dunkel.png)

**The form is a sentence:** "When [entity] stays below [5 W] for more than [3 min], [whoever is home, in turn] gets the card [title]." You tap every field in square brackets and change it. Below:

- **Trial run:** Stups fetches the history of the entity for the last 7 days (at most 20,000 states) from Home Assistant and applies the rule to it without saving anything. You see a small chart of when the watcher would have fired and a sentence: "3 triggers detected, no false alarm" or "Fired 5 times, 4 of them within 10 minutes: increase the minimum duration?". Without history (recorder off, new entity) a notice replaces the chart.
- **Suggest first:** the card appears without an assignee, every adult who is home gets the question "Who takes it?" with a **Take it** button (push) and on Today. Whoever taps first gets the card; the others learn who was faster. If nobody answers within **30 minutes**, the watcher's fallback applies. If nobody is home, it applies at once.
- **Honest about self-completing:** a power sensor cannot prove that someone emptied the appliance. For templates where that is so, "Completes itself" is off, with the reason next to it. With the battery template the card completes itself when the sensor rises above 50 % again.
- **More rules** opens everything else: name, board, column, description, categories, priority, due date, who exactly is in the circle, the fallbacks, "Completes itself when …", counter, lockout, duplicate cards, reminder.
- **Calendar and weather:** two more kinds of triggers that Stups queries itself **every 30 minutes**. *Appointment in a calendar* with a lead time (for example 12 hours before the collection; every appointment gets exactly one card, all-day appointments start at midnight) and *rain in the forecast* of a weather entity (within the next 1 to 48 hours; after the rain the watcher is armed again). There is no trial run for them.

The conditions in detail:

1. **When:** the entity (with its current state), then the condition:
   - *Value drops below* or *rises above* a number, for example the washing machine's power below 5 W.
   - *State changes to* a value, for example `docked` for the robot vacuum.
   - **For at least … minutes:** the condition must hold uninterrupted for that long (default 3 minutes for numeric values so short dips trigger nothing).
   - **Only the Nth time:** Stups counts by itself and only creates the card on the Nth trigger (robot vacuum: after 3 cleanings). The state is shown on the watcher ("2 of 3"). Once the card is completed, counting starts over; "Reset" does that by hand.
2. **Then card:** board, column, title, description, categories, priority and due date (none, "in … minutes" or "today/tomorrow at …").
3. **To whom:**
   - *In turn among those present*: in rotation, whoever is currently `home` in Home Assistant. If nobody is home, the fallback decides (next person, everyone, fixed person, nobody).
   - *Whoever gets home first*: if someone is already there, the card goes at once to a present person as with "in turn among those present". Otherwise it appears **without assignees and without push** with the note "Waiting for the first person to get home". Whoever gets home first receives it and the message, and the due date counts from then. If several come within 2 minutes, all of them get the card. If nobody comes for 24 hours, the card stays unassigned (configurable: to everyone or to a fixed person).
   - *Everyone present*, *In turn (whoever is there)*, *Fixed person(s)* or *Nobody*.
   - Which person belongs to which Home Assistant person is recognised by Stups from the person's user, otherwise by name. If the match is unclear, the person counts as not present.
4. **Completes itself when …** (optional): a second entity and condition, for example the washing machine door opens. The watcher's open card is then completed.

**Rules:**
- A **lock time** (default 10 minutes) catches flapping sensors. It also applies to the counter.
- As long as the watcher's card is **open**, no second one is created; the card's history says "Triggered again". This can be switched off.
- **Nudge after … minutes** (optional): if the card is still open by then, the assignees get one reminder.
- When **creating**, a watcher does not trigger by itself if the condition is already met (a device that is already off): after saving, Stups asks whether the card should be created now ("Yes, create card" or "No, wait for the next time"). Levels such as battery, temperature and humidity are the exception: a value that is already past the limit is a finding, so the card comes without a question. The same goes for changes, when the entity or the condition has changed. After a restart of Stups or Home Assistant the current state is reconciled: a missed transition triggers **exactly once**, never twice. The "from" value of state changes cannot be checked after a restart.
- If the entity is missing in Home Assistant, the watcher shows "Entity missing", it is not deleted. If the board or column no longer exists, the watcher pauses with a hint.
- The card is an entirely normal card (due push, reminders, nudging), with an eye symbol and the entry "Created by watcher …" in the history.
- **Test** creates the card once immediately (marked "Test") so you can check push and assignment.

![Card from a watcher](https://raw.githubusercontent.com/ArrestedOps/ha-stups/main/docs/images/en/waechter-karte-dunkel.png)

**A note on washing machine and dryer:** if both are on the same socket, power alone cannot tell them apart. A separate sensor per appliance helps then (for example a template sensor or a second socket).

#### Your own automations: event `stups_create_card`

If you prefer building your own automations in Home Assistant, you can create cards directly with them. Stups reacts to the event `stups_create_card`:

```yaml
automation:
  - alias: Replace air purifier filter
    triggers:
      - trigger: numeric_state
        entity_id: sensor.air_purifier_filter
        below: 10
    actions:
      - event: stups_create_card
        event_data:
          board: Household             # Name or ID; without it the first board
          column: Open                 # Name or ID; without it the first open column
          title: Replace filter
          description: Air purifier in the living room
          assignees: present           # Names of the people, or "present" for everyone at home
          due_in_minutes: 60           # optional
          dedupe_key: air-purifier     # optional: no second card while this one is open
```

Errors (unknown board, missing title, duplicate `dedupe_key`) are not lost: the last 20 events with their result are shown to administrators on the diagnostics page (Settings › Diagnostics page) under "Automations". Your own automations are as trustworthy as Home Assistant itself: whoever may create automations can create cards.

### Sensors

For dashboards and automations: `sensor.stups_ueberfaellig` (overdue), `sensor.stups_heute_faellig` (due today) and per person `sensor.stups_ueberfaellig_<name>` and `sensor.stups_heute_faellig_<name>`. The `tasks` attributes contain title, due date and board. Also `sensor.stups_stupse_offen` (all open nudges) and per person `sensor.stups_gestupst_<name>` (open nudges to this person, with card, sender and time as attributes). `sensor.stups_waechter_offen` counts the open cards created by a watcher. The sensor names stay German for now.

### Archive and trash

- Completed cards are archived after the board's archive period (default 7 days), including the completed rounds of a recurring card. The open, recurring card is never archived.
- Deleted items stay in the trash for 30 days.

### Attachments

Photos are reduced to at most 2048 pixels before uploading, stored as JPEG and stripped of location data. PDFs up to 20 MB are uploaded unchanged.

## Dashboard button (Bubble Card)

The app shows the path under Settings. Example:

```yaml
type: custom:bubble-card
card_type: button
button_type: name
name: Stups
icon: mdi:view-column
tap_action:
  action: navigate
  navigation_path: /XXXXXXXX_stups
```

## Moving data

If Stups moves to another address in Home Assistant (another repository = another app), the data does not carry over automatically. It travels through an export:

1. In the previous app: **Settings › Move › Export data** (administrators only). Database and attachments are then in `/share/stups-umzug`.
2. Install the new Stups app and **start it for the first time**. It takes over the export by itself, the log says "Daten aus dem Umzug übernommen". An app that already has its own data takes nothing over.
3. Check that boards, cards, people and photos are there. The dashboard button of the new app has its own panel path (`/<id>_stups`).
4. Only then deactivate the previous app. Until then it stays as a fallback.

## Backup

Database and attachments live in the add-on directory `/data` and are part of the normal Home Assistant backup. Before every database update the app makes a copy under `/data/backups` (the last 5 are kept).

## Updating

New versions appear in the app store as soon as they are on GitHub. The Docker image is then still built for a few minutes. Only update when the last run under "Actions" of the repository is green, otherwise Home Assistant reports "manifest unknown 404". Update, **do not** uninstall: uninstalling deletes all data of the app.

## Troubleshooting

- **Diagnostics page:** `…/diagnose.html` in the panel (Settings › Diagnostics page) shows the detected user, the connection to Home Assistant and a test push.
- **Push does not arrive:** is a device ticked under Settings › For me › Notifications (for you) or Household › People and children (for others)? "Why does nothing arrive?" › "Show status" shows who gets a message for which card. The diagnostics page marks services that no longer exist.
- **"No access" when opening:** access is set to "Only these people" and you are not among them. An administrator approves you under Settings › Household › People and children.
- **The panel opens nothing on the phone:** then the panel is only visible to administrators. Stups releases the panel to all users; if it is missing anyway, check "Show in sidebar" on the app in Home Assistant.
