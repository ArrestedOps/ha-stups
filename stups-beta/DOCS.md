# Stups (Beta)

> 🇩🇪 [Deutsche Fassung](DOCS.de.md). This English version is the authoritative one.

This is the **beta version** of Stups: the same app as "Stups", but with **its own data** and with new features before they are released. It is meant for trying things out, not for everyday use.

## What is different from the normal app

- **Its own data.** The beta has its own storage. Boards and cards of the normal app are not in it, unless you copy them in once (see below).
- **Push is off at first, the watchers run.** Otherwise the family would get reminders twice. Under **Settings › Help and data › Beta** an administrator switches push on selectively (for example only for themselves) and the watchers off if needed: if the same watchers also run in the normal app, tasks are created twice.
- **Only visible in Advanced mode.** The beta is marked experimental; the App Store shows it once Advanced mode is on in your profile.
- **Version number.** `X-beta.N` is the Nth test version of the next normal version `X`.
- **Its own names.** Push titles begin with "Beta ·", sensors are called `sensor.stups_beta_…`, the event for automations is called `stups_beta_create_card`, and the buttons in messages belong to the beta only.
- **Its own icon** ("BETA") and its own entry in the sidebar ("Stups Beta").

## Copying real data to test with

1. In the **normal** Stups app: **Settings › Help and data › Bin, archive, move › Export**. The data lands in `/share/stups-umzug`.
2. **Only afterwards** start the beta for the first time. It takes over the export on first start, but only if it has no data of its own yet.
3. The beta takes the data **as a copy**; the normal app stays untouched.

Need a new copy? Uninstall the **beta** (and only the beta, recognisable by its name), export again in the normal app and reinstall the beta. The normal app is never uninstalled.

## Installing the beta

In Home Assistant, under **Settings › Apps › App Store › ⋮ › Repositories**, add this address:

```
https://github.com/ArrestedOps/ha-stups#beta
```

**Stups (Beta)** appears there. From this address a second "Stups" also appears: **do not** install that one, it is not the normal app and would have its own, empty data.

Usage and options are as in the normal app ([Stups documentation](https://github.com/ArrestedOps/ha-stups/blob/main/stups/DOCS.md)).
