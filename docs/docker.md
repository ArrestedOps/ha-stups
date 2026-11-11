# Stups without Home Assistant (Docker)

> 🇩🇪 [Deutsche Fassung](docker.de.md). This English version is the authoritative one.

> **Beta.** The standalone container is still a beta. It runs and is tested with every release (accounts, passkeys, ntfy, connection to Home Assistant), but gets **no new features of its own for now**, until the app is published in Home Assistant and has users. New features of the app only appear in the container as far as they run without extra effort; what does not work there, the interface hides.
>
> **Security.** **Never** put it on the internet without HTTPS and a reverse proxy (see "Security" below), do not expose port 8099 directly, **update regularly** (`docker compose pull && docker compose up -d`) and back up the data folder.

Stups runs not only as a Home Assistant app but also as a standalone Docker container, for example on a Synology NAS. It is the same image and the same database.

| | Home Assistant app | Standalone container without Home Assistant |
|---|---|---|
| Sign-in | the Home Assistant users | own accounts with a password |
| People | from Home Assistant | maintained in Stups (every user is a person) |
| Boards, agenda, calendar, repeats, nudging | yes | yes |
| Watchers and sensors | yes | only with a connection to Home Assistant (see below), otherwise hidden in the interface |
| Push messages | Companion App | via [ntfy](https://ntfy.sh), with a connection to Home Assistant also via the Companion App |

The container runs in one of two ways, depending on whether `HA_URL` and `HA_TOKEN` are set:

- **Without Home Assistant** (default): everything except watchers and sensors.
- **With Home Assistant**: Stups connects to your Home Assistant with an address and an access token and then also offers watchers, sensors and push via the Companion App. Sign-in still uses the accounts in Stups (see "Connecting to Home Assistant").

## Quick start

File `docker-compose.yml`:

```yaml
services:
  stups:
    image: ghcr.io/arrestedops/stups:latest
    container_name: stups
    restart: unless-stopped
    ports:
      - "8099:8099"
    environment:
      TZ: Europe/Berlin
      # Address under which you open Stups in the browser. If it starts with https://, the sign-in cookie is only sent over HTTPS.
      STUPS_PUBLIC_URL: "http://192.168.1.20:8099"
    volumes:
      - ./stups-data:/data
```

```bash
docker compose up -d
docker logs stups
```

On first start the log shows a line like

```
Einrichtung: Öffne http://192.168.1.20:8099 und gib diesen Code ein: K7Q4-MX2P
```

(setup: open the address and enter this code). Open the address in the browser, enter the code and create the first administrator (username, name, password with at least 10 characters). After that, setup is closed for good. You create more users under **Settings › Household › People & access › Create user**.

Instead of the code you can also put the first administrator right into the compose file (take the password out again afterwards, it is only needed at the very first start):

```yaml
    environment:
      STUPS_ADMIN_USER: "anna"
      STUPS_ADMIN_PASSWORD: "at-least-ten-characters"
```

## Settings

All settings are environment variables. Without a value, the defaults apply.

| Variable | Default | Meaning |
|---|---|---|
| `STUPS_DATA_DIR` | `/data` | Folder for database, attachments and backups (inside the container; map it outside with `volumes`) |
| `STUPS_PORT` | `8099` | Port in the container |
| `STUPS_SHARE_DIR` | `/share` | Folder from which a move (`stups-umzug`) is taken over on first start |
| `STUPS_PUBLIC_URL` | – | Address under which Stups is reachable. `https://…` switches the secure cookie on and, with a name instead of an IP address, passkeys (see "Signing in with a passkey") |
| `STUPS_TRUST_PROXY` | `false` | Only behind a reverse proxy: how many proxies sit in front of Stups (for example `1`), a list of their addresses or networks (`172.18.0.0/16`) or `true`. Then the sign-in lock sees the real address from `X-Forwarded-For`; without it everyone behind the proxy shares one address. Set it **only** when Stups is reachable solely through that proxy, otherwise anyone can fake their address |
| `STUPS_ADMIN_USER`, `STUPS_ADMIN_PASSWORD` | – | first administrator, only both together. Only applies while there is no account yet |
| `HA_URL` | – | Address of your Home Assistant, for example `http://homeassistant.local:8123` (see "Connecting to Home Assistant") |
| `HA_TOKEN` | – | Long-lived access token from Home Assistant. Only together with `HA_URL` |
| `STUPS_NTFY_URL` | – | Address of the ntfy server, switches push on (see below) |
| `STUPS_NTFY_TOKEN` | – | Access token (`tk_…`) for a server with sign-in |
| `STUPS_NTFY_USER`, `STUPS_NTFY_PASSWORD` | – | instead of the token: user and password, only both together |
| `STUPS_DAILY_SUMMARY_TIME` | `08:00` | Time of the daily summary (HH:MM); can be changed in the app under Settings › Reminder times, which then takes precedence |
| `STUPS_OVERDUE_NAG_TIME` | `18:00` | From when overdue cards are followed up (HH:MM); can be changed in the app under Settings › Reminder times, which then takes precedence |
| `STUPS_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |
| `STUPS_CONFIG` | `<data folder>/options.json` | JSON file with the same settings as the add-on options, if you prefer a file |
| `TZ` | `Europe/Berlin` | Time zone |

Environment variables take precedence over the file. In the Home Assistant app they do not apply; there you set everything under Configuration.

## Signing in with a passkey

Instead of typing the password, you sign in with the fingerprint, face or screen lock of your device (iPhone, Android, Windows Hello, password managers with passkeys). The password remains as a fallback.

**Requirement:** `STUPS_PUBLIC_URL` is an `https://` address with a name, for example `https://stups.example.org`. Passkeys belong to a domain; browsers only allow them over HTTPS (or `localhost`) and never for an IP address like `http://192.168.1.20:8099`. If the address does not fit, passkeys are off, and the log says so at start. Stups takes the domain for verification from this address, not from request headers.

**Setting up:** Settings › For me › Account and sign-in › Passkeys › **Add passkey**, give it a name (for example "Anna's iPhone"), the device asks for fingerprint or face. Repeat once on every device you use. After that the sign-in page shows **Sign in with passkey**, without a username at all.

**Important**

- **The domain must not change.** A passkey only applies to the domain it was created under. If you switch to another address, you create new ones (with the password you can always get in).
- **The device is always confirmed.** Stups requires fingerprint, face or PIN; merely touching the key is not enough.
- **Removing** works under Settings › For me › Account and sign-in › Passkeys. That deletes it only in Stups. On the device the passkey stays until you delete it there. If an account is deleted, its passkeys disappear with it.
- **Stored safely:** the database holds only the public key, which is not secret. Wrong attempts count like wrong passwords and lead to the same waiting time.
- The Home Assistant app does not use passkeys: there, Home Assistant signs you in.

## Push messages via ntfy

Without Home Assistant there is no Companion App. Stups sends reminders, nudges and the daily summary through [ntfy](https://ntfy.sh) instead, a free push solution with apps for Android and iPhone. Each person subscribes to their own **topic** in the ntfy app; Stups publishes their messages there. It works with your own ntfy server and with the public `https://ntfy.sh`.

**Setting up**

1. Have an ntfy server (self-hosted or `https://ntfy.sh`) and install the ntfy app on the phones.
2. Enter in the compose file:

```yaml
    environment:
      STUPS_PUBLIC_URL: "https://stups.example.org"
      STUPS_NTFY_URL: "https://ntfy.example.org"
      # only if the ntfy server requires sign-in (one of the two):
      # STUPS_NTFY_TOKEN: "tk_abc123"
      # STUPS_NTFY_USER: "stups"
      # STUPS_NTFY_PASSWORD: "…"
```

3. In Stups, under **Settings › For me › Notifications**, enter a topic under **Push via ntfy** (administrators do it for others under **Household › People & access**) (**Random topic** creates one). In the ntfy app use the same server and subscribe to this topic.
4. Under **Settings › For me › Notifications › Send to me** send a test message.

**Important**

- **The topic is the password.** On an open server (like `ntfy.sh`) anyone who knows the topic can read along and send messages. Take a random topic and do not pass it on. With an ntfy server that requires sign-in this is less delicate. Stups shows the topic only to the person themselves and to administrators.
- **`STUPS_PUBLIC_URL` must be reachable from the phone** (Wi-Fi, VPN or reverse proxy). Two things depend on it: the link that opens the card when you tap the message, and the **buttons** ("Done" when due; "Done", "On it", "Later" for a nudge). Without the address the messages arrive without a link and without buttons. Stups says so in the app and in the log.
- **How the buttons work.** They are ntfy buttons of the type "HTTP" (Android, iPhone and web app). When tapped, the ntfy app calls `STUPS_PUBLIC_URL/api/push/action`. Every message carries a token for this: person, action and expiry (14 days), signed with a secret from the database. With it exactly this one action can be triggered for exactly this person, without signing in, and nothing else. Altered or expired tokens are rejected; guessing a token is hopeless (HMAC-SHA-256). With **Check return path** in the test message you see under **Show status** whether the path from the phone to Stups is open.
- **Replacing and removing messages.** Stups gives every message an identifier. Newer ntfy servers (version 2.16 and up) use it to replace an older message and to remove completed messages from the phone. Older servers create a new one instead and leave the old one; if you tap "Done" there afterwards, Stups reports "already done" and the message disappears.
- **Stups only sends what you entered.** Whoever has no topic gets nothing; the overview under **Notifications › Show status** shows who is reachable.

## Connecting to Home Assistant

If Home Assistant runs at your place (or at someone you trust), the container can use it without being a Home Assistant app itself.

1. In Home Assistant: **Profile (bottom left) › Security › Long-lived access tokens › Create token**, name for example "Stups". The token is shown only once.
2. In the compose file:

```yaml
    environment:
      HA_URL: "http://homeassistant.local:8123"
      HA_TOKEN: "eyJhbGciOi…"
      STUPS_PUBLIC_URL: "https://stups.example.org"
```

3. Restart. The log says "Verbindung zu Home Assistant: …" (connection to Home Assistant). The **Watchers** tab appears in the interface.

**What this enables**

- **Watchers and sensors** as in the app: Stups observes entities and creates cards, and it writes `sensor.stups_…` to Home Assistant. The token decides what Stups may do: it has the rights of the user it belongs to.
- **People as suggestions.** Under **People & Access › From Home Assistant** the people from Home Assistant appear; with **Add** they become people in Stups. For watchers ("who is at home", "whoever gets home first") this applies: **the name in Stups must match the name of the person in Home Assistant.** A person added via the suggestions is linked right away.
- **Push via the Companion App**, in addition to ntfy: for every person you can tick the phones where the Companion App is signed in. Tapping the message opens Stups at `STUPS_PUBLIC_URL`. "Done" in the message comes back through the connection to Home Assistant, without Stups having to be reachable from outside.
- **Who is an administrator** is still decided by the account in Stups, never by Home Assistant.

**Notes**

- **Address with https and your own certificate:** Node (and with it Stups) does not know it. Mount the certificate file and set `NODE_EXTRA_CA_CERTS: /path/to/ca.pem`.
- **Reachability:** the container must reach Home Assistant (port 8123). Home Assistant does not need to reach Stups.
- **Time zone:** it comes from Home Assistant as soon as the connection is up.
- The token gives access to your Home Assistant. Treat the compose file like a password, and use a user of its own for Stups if you want to allow it less.

## Synology (Container Manager)

1. Install **Container Manager** (Package Center). A DS218+ is an Intel device and runs the existing image.
2. Create a folder, for example `/volume1/docker/stups` with the subfolder `data`.
3. In Container Manager under **Project › Create** paste the `docker-compose.yml` from above, adjust the path (`/volume1/docker/stups/data:/data`) and start.
4. Read the setup code under **Container › stups › Log**.
5. Make it reachable from outside only via HTTPS (see below), do not expose port 8099 to the internet.

Updating: `docker compose pull && docker compose up -d`; in Container Manager download the image again and restart the project afterwards. The database brings itself up to date on start; before that Stups makes a backup under `data/backups`.

## Security

- **HTTPS.** Passwords and the session cookie should never travel unencrypted across the internet. Put a reverse proxy with a certificate in front (on Synology: **Control Panel › Login Portal › Advanced › Reverse Proxy**, target `http://localhost:8099`) and enter the https address as `STUPS_PUBLIC_URL`. For WebSockets (live sync) the proxy must pass on the `Upgrade` and `Connection` headers; on Synology under **Custom header › WebSocket**.
- **Sign-in.** Passwords are stored with scrypt, sessions last 30 days and extend with use. The lock works **per address and per account, separately**: after five failed attempts from one address that address waits a minute, every further failed attempt doubles the waiting time (at most 30 minutes). An account is never locked, only slowed down: from the sixth attempt within 15 minutes, further attempts queue with 0.5 to at most 8 seconds between them (beyond 15 seconds of queue they are turned away), and a correct password resets it. So nobody can lock the owner out of their own account from many addresses, and guessing gets slow. Behind a reverse proxy set `STUPS_TRUST_PROXY`, otherwise all users share one address. If someone changes their password, their other devices are signed out (passkeys stay). Passkeys: see "Signing in with a passkey".
- **Headers.** Sign-in headers from Home Assistant or a proxy are never considered in the standalone container.
- **Only one path is open without sign-in:** `/api/push/action` for the buttons in ntfy messages, and only with a valid, signed token.
- **Backup.** Everything lives in the data folder (`stups.sqlite`, `files`, `backups`). A copy of this folder is enough.

## Moving from the Home Assistant app

In the app, export the data under **Settings › Help and data › Bin, archive, move**; it lands in `/share/stups-umzug` of Home Assistant. Copy this folder `stups-umzug` into a folder on the NAS (for example `./share`) and mount it on the first start of the new container:

```yaml
    volumes:
      - ./stups-data:/data
      - ./share:/share:ro
```

If the data folder is still empty, Stups takes over database and attachments from it. The people come along, their sign-in does not. Set up the first administrator as above; if you give them the name of an existing person, that person gets the account and keeps their cards. For every other person you create a sign-in under **People & Access**.

The export contains **no secrets**: the push secret (it is created anew, old buttons in messages stop working), password hashes, sessions and passkeys are left out. Accounts without a password need a new one from an administrator (sign-in after the move: set it up again). The export is readable only by its owner (mode 0600), expires after **24 hours** (a stale export is deleted at the next start of a Stups app) and is deleted by the new app after a successful import. Exports from earlier versions can still be imported.
