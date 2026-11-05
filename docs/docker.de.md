# Stups ohne Home Assistant (Docker)

> Deutsche Fassung. Die englische Fassung ([docker.md](docker.md)) ist maßgeblich.

> **Beta.** Der eigene Container ist noch eine Beta. Er läuft und wird bei jedem Release getestet (Konten, Passkeys, ntfy, Verbindung zu Home Assistant), bekommt aber **vorerst keine neuen Funktionen**, bis die App in Home Assistant veröffentlicht ist und Nutzer hat. Neue Funktionen der App erscheinen im Container nur, soweit sie ohne Zusatzaufwand mitlaufen; was dort nicht geht, blendet die Oberfläche aus.
>
> **Sicherheit.** Stelle ihn **nie ohne HTTPS und einen Reverse-Proxy** ins Internet (siehe „Sicherheit" weiter unten), gib den Port 8099 nicht direkt frei, **aktualisiere regelmäßig** (`docker compose pull && docker compose up -d`) und sichere den Datenordner.

Stups läuft nicht nur als Home-Assistant-App, sondern auch als eigener Docker-Container, zum Beispiel auf einer Synology-NAS. Es ist dasselbe Image und dieselbe Datenbank.

| | Home-Assistant-App | Eigener Container ohne Home Assistant |
|---|---|---|
| Anmeldung | die Benutzer von Home Assistant | eigene Konten mit Passwort |
| Personen | aus Home Assistant | in Stups gepflegt (jeder Benutzer ist eine Person) |
| Boards, Agenda, Kalender, Wiederholungen, Stupsen | ja | ja |
| Wächter und Sensoren | ja | nur mit Verbindung zu Home Assistant (siehe unten), sonst in der Oberfläche ausgeblendet |
| Push-Nachrichten | Companion App | über [ntfy](https://ntfy.sh), mit Verbindung zu Home Assistant auch über die Companion App |

Der Container läuft in einer von zwei Arten, je nachdem, ob `HA_URL` und `HA_TOKEN` gesetzt sind:

- **Ohne Home Assistant** (Vorgabe): alles bis auf Wächter und Sensoren.
- **Mit Home Assistant**: Stups verbindet sich über Adresse und Zugangs-Token mit deinem Home Assistant und bietet dann auch Wächter, Sensoren und Push über die Companion App an. Angemeldet wird weiter mit den Konten in Stups (siehe „Mit Home Assistant verbinden").

## Schnellstart

Datei `docker-compose.yml`:

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
      # Adresse, unter der du Stups im Browser öffnest. Beginnt sie mit https://, wird das Anmelde-Cookie nur über HTTPS gesendet.
      STUPS_PUBLIC_URL: "http://192.168.1.20:8099"
    volumes:
      - ./stups-daten:/data
```

```bash
docker compose up -d
docker logs stups
```

Beim ersten Start steht im Protokoll eine Zeile wie

```
Einrichtung: Öffne http://192.168.1.20:8099 und gib diesen Code ein: K7Q4-MX2P
```

Öffne die Adresse im Browser, gib den Code ein und lege den ersten Administrator an (Benutzername, Name, Passwort mit mindestens 10 Zeichen). Danach ist die Einrichtung für immer geschlossen. Weitere Benutzer legst du unter **Einstellungen › Haushalt › Personen & Zugriff › Benutzer anlegen** an.

Statt des Codes kannst du den ersten Administrator auch gleich in die Compose-Datei schreiben (nimm danach das Passwort wieder heraus, es wird nur beim allerersten Start gebraucht):

```yaml
    environment:
      STUPS_ADMIN_USER: "anna"
      STUPS_ADMIN_PASSWORD: "mindestens-zehn-zeichen"
```

## Einstellungen

Alle Einstellungen sind Umgebungsvariablen. Ohne Angabe gelten die Vorgaben.

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `STUPS_DATA_DIR` | `/data` | Ordner für Datenbank, Anhänge und Sicherungen (im Container; mit `volumes` nach außen legen) |
| `STUPS_PORT` | `8099` | Port im Container |
| `STUPS_SHARE_DIR` | `/share` | Ordner, aus dem ein Umzug (`stups-umzug`) beim ersten Start übernommen wird |
| `STUPS_PUBLIC_URL` | – | Adresse, unter der Stups erreichbar ist. `https://…` schaltet das Secure-Cookie ein und, mit einem Namen statt einer IP-Adresse, die Passkeys (siehe „Anmelden mit Passkey") |
| `STUPS_ADMIN_USER`, `STUPS_ADMIN_PASSWORD` | – | erster Administrator, nur beide zusammen. Gilt nur, solange es noch kein Konto gibt |
| `HA_URL` | – | Adresse deines Home Assistant, zum Beispiel `http://homeassistant.local:8123` (siehe „Mit Home Assistant verbinden") |
| `HA_TOKEN` | – | Long-Lived-Zugangs-Token aus Home Assistant. Nur zusammen mit `HA_URL` |
| `STUPS_NTFY_URL` | – | Adresse des ntfy-Servers, schaltet Push ein (siehe unten) |
| `STUPS_NTFY_TOKEN` | – | Zugriffstoken (`tk_…`) für einen Server mit Anmeldung |
| `STUPS_NTFY_USER`, `STUPS_NTFY_PASSWORD` | – | statt des Tokens: Benutzer und Passwort, nur beide zusammen |
| `STUPS_DAILY_SUMMARY_TIME` | `08:00` | Uhrzeit der Tageszusammenfassung (HH:MM); in der App unter Einstellungen › Tageszusammenfassung lässt sie sich ändern und hat dann Vorrang |
| `STUPS_OVERDUE_NAG_TIME` | `18:00` | ab wann an Überfälliges erinnert wird (HH:MM) |
| `STUPS_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |
| `STUPS_CONFIG` | `<Datenordner>/options.json` | JSON-Datei mit denselben Einstellungen wie die Add-on-Optionen, falls du lieber eine Datei nimmst |
| `TZ` | `Europe/Berlin` | Zeitzone |

Umgebungsvariablen gehen vor der Datei. In der Home-Assistant-App gelten sie nicht; dort stellt man alles unter Konfiguration ein.

## Anmelden mit Passkey

Statt das Passwort zu tippen, meldest du dich mit Fingerabdruck, Gesicht oder der Bildschirmsperre deines Geräts an (iPhone, Android, Windows Hello, Passwort-Manager mit Passkeys). Das Passwort bleibt als Rückfall.

**Voraussetzung:** `STUPS_PUBLIC_URL` ist eine `https://`-Adresse mit einem Namen, zum Beispiel `https://stups.example.org`. Passkeys gehören zu einer Domain; Browser erlauben sie nur über HTTPS (oder `localhost`) und nie für eine IP-Adresse wie `http://192.168.1.20:8099`. Stimmt die Adresse nicht, sind Passkeys aus, und das Protokoll sagt es beim Start. Aus dieser Adresse, nicht aus Kopfzeilen der Anfrage, nimmt Stups die Domain für die Prüfung.

**Einrichten:** Einstellungen › Für mich › Konto und Anmeldung › Passkeys › **Passkey hinzufügen**, Namen vergeben (zum Beispiel „iPhone von Anna"), das Gerät fragt nach Fingerabdruck oder Gesicht. Auf jedem Gerät, das du nutzt, einmal wiederholen. Danach zeigt die Anmeldeseite **Mit Passkey anmelden**, ganz ohne Benutzernamen.

**Wichtig**

- **Die Domain darf sich nicht ändern.** Ein Passkey gilt nur für die Domain, unter der er angelegt wurde. Wechselst du auf eine andere Adresse, legst du neue an (mit dem Passwort kommst du jederzeit hinein).
- **Das Gerät wird immer bestätigt.** Stups verlangt Fingerabdruck, Gesicht oder PIN; ein bloßes Berühren des Schlüssels genügt nicht.
- **Entfernen** geht unter Einstellungen › Für mich › Konto und Anmeldung › Passkeys. Das löscht ihn nur in Stups. Auf dem Gerät bleibt der Passkey liegen, bis du ihn dort löschst. Wird ein Konto gelöscht, verschwinden seine Passkeys mit.
- **Sicher aufbewahrt:** In der Datenbank liegt nur der öffentliche Schlüssel, der nicht geheim ist. Falsche Versuche zählen wie falsche Passwörter und führen zur gleichen Wartezeit.
- Die Home-Assistant-App nutzt keine Passkeys: Dort meldet Home Assistant an.

## Push-Nachrichten über ntfy

Ohne Home Assistant gibt es keine Companion App. Stups schickt Erinnerungen, Stupse und die Tageszusammenfassung stattdessen über [ntfy](https://ntfy.sh), eine freie Push-Lösung mit Apps für Android und iPhone. Jede Person abonniert in der ntfy-App ein eigenes **Thema**; Stups veröffentlicht ihre Nachrichten dort. Es funktioniert mit einem eigenen ntfy-Server und mit dem öffentlichen `https://ntfy.sh`.

**Einrichten**

1. Einen ntfy-Server haben (selbst betrieben oder `https://ntfy.sh`) und die ntfy-App auf den Handys installieren.
2. In der Compose-Datei eintragen:

```yaml
    environment:
      STUPS_PUBLIC_URL: "https://stups.example.org"
      STUPS_NTFY_URL: "https://ntfy.example.org"
      # nur, wenn der ntfy-Server eine Anmeldung verlangt (eines von beiden):
      # STUPS_NTFY_TOKEN: "tk_abc123"
      # STUPS_NTFY_USER: "stups"
      # STUPS_NTFY_PASSWORD: "…"
```

3. In Stups unter **Einstellungen › Für mich › Benachrichtigungen** bei **Push über ntfy** ein Thema eintragen (Administratoren tragen es für andere unter **Haushalt › Personen & Zugriff** ein) (**Zufälliges Thema** erzeugt eines). In der ntfy-App denselben Server verwenden und dieses Thema abonnieren.
4. Unter **Einstellungen › Für mich › Benachrichtigungen › An mich senden** eine Test-Nachricht schicken.

**Wichtig**

- **Das Thema ist das Passwort.** Auf einem offenen Server (wie `ntfy.sh`) kann jeder, der das Thema kennt, mitlesen und Nachrichten schicken. Nimm ein zufälliges Thema und gib es nicht weiter. Mit einem ntfy-Server, der Anmeldung verlangt, ist das weniger heikel. Stups zeigt das Thema nur der Person selbst und den Administratoren.
- **`STUPS_PUBLIC_URL` muss vom Handy aus erreichbar sein** (WLAN, VPN oder Reverse Proxy). Davon hängen zwei Dinge ab: der Link, der beim Tippen auf die Nachricht die Karte öffnet, und die **Knöpfe** („Erledigt" bei Fälligkeit; „Erledigt", „Mach ich", „Später" beim Stups). Ohne die Adresse kommen die Nachrichten ohne Link und ohne Knöpfe an. Stups sagt das in der App und im Protokoll.
- **Wie die Knöpfe arbeiten.** Sie sind ntfy-Knöpfe vom Typ „HTTP" (Android, iPhone und Web-App). Die ntfy-App ruft beim Tippen `STUPS_PUBLIC_URL/api/push/action` auf. Jede Nachricht trägt dafür ein Token: Person, Aktion und Ablaufzeit (14 Tage), mit einem Geheimnis aus der Datenbank signiert. Damit lässt sich genau diese eine Aktion für genau diese Person auslösen, ohne Anmeldung, und nichts sonst. Veränderte oder abgelaufene Tokens werden abgewiesen; ein Token zu erraten ist aussichtslos (HMAC-SHA-256). Mit **Rückweg prüfen** in der Test-Nachricht siehst du unter **Stand anzeigen**, ob der Weg vom Handy zu Stups frei ist.
- **Nachrichten ersetzen und entfernen.** Stups vergibt jeder Nachricht eine Kennung. Neuere ntfy-Server (ab Version 2.16) ersetzen damit eine ältere Nachricht und löschen erledigte Nachrichten vom Handy. Ältere Server legen stattdessen eine neue an und lassen die alte stehen; tippt man dort danach auf „Erledigt", meldet Stups „schon erledigt", und die Nachricht verschwindet.
- **Stups sendet nur, was du eingetragen hast.** Wer kein Thema hat, bekommt nichts; die Übersicht unter **Benachrichtigungen › Stand anzeigen** zeigt, wer erreichbar ist.

## Mit Home Assistant verbinden

Läuft Home Assistant bei dir (oder bei jemandem, dem du vertraust), kann der Container es nutzen, ohne selbst eine Home-Assistant-App zu sein.

1. In Home Assistant: **Profil (unten links) › Sicherheit › Langlebige Zugangs-Tokens › Token erstellen**, Name zum Beispiel „Stups". Das Token wird nur einmal angezeigt.
2. In die Compose-Datei:

```yaml
    environment:
      HA_URL: "http://homeassistant.local:8123"
      HA_TOKEN: "eyJhbGciOi…"
      STUPS_PUBLIC_URL: "https://stups.example.org"
```

3. Neu starten. Im Protokoll steht „Verbindung zu Home Assistant: …". In der Oberfläche erscheint der Reiter **Wächter**.

**Was damit geht**

- **Wächter und Sensoren** wie in der App: Stups beobachtet Entitäten und legt Karten an, und es schreibt `sensor.stups_…` nach Home Assistant. Das Token entscheidet, was Stups darf: Es hat die Rechte des Benutzers, dem es gehört.
- **Personen als Vorschläge.** Unter **Personen & Zugriff › Aus Home Assistant** erscheinen die Personen aus Home Assistant; mit **Hinzufügen** werden sie Personen in Stups. Für die Wächter („wer ist zu Hause", „wer zuerst nach Hause kommt") gilt: **Der Name in Stups muss zum Namen der Person in Home Assistant passen.** Eine über die Vorschläge hinzugefügte Person ist gleich verknüpft.
- **Push über die Companion App**, zusätzlich zu ntfy: Bei jeder Person lassen sich die Handys ankreuzen, auf denen die Companion App angemeldet ist. Tippt man auf die Nachricht, öffnet sie Stups unter `STUPS_PUBLIC_URL`. „Erledigt" in der Nachricht kommt über die Verbindung zu Home Assistant zurück, ohne dass Stups aus dem Netz erreichbar sein muss.
- **Wer Administrator ist**, bestimmt weiter das Konto in Stups, nie Home Assistant.

**Hinweise**

- **Adresse mit https und eigenem Zertifikat:** Node (und damit Stups) kennt es nicht. Binde die Zertifikatsdatei ein und setze `NODE_EXTRA_CA_CERTS: /pfad/zur/ca.pem`.
- **Erreichbarkeit:** Der Container muss Home Assistant erreichen (Port 8123). Home Assistant braucht Stups nicht zu erreichen.
- **Zeitzone:** Sie kommt von Home Assistant, sobald die Verbindung steht.
- Das Token gibt Zugriff auf deinen Home Assistant. Behandle die Compose-Datei wie ein Passwort und nimm für Stups einen eigenen Benutzer, wenn du ihm weniger erlauben willst.

## Synology (Container Manager)

1. **Container Manager** installieren (Paketzentrum). Eine DS218+ ist ein Intel-Gerät und läuft mit dem vorhandenen Image.
2. Ordner anlegen, zum Beispiel `/volume1/docker/stups` mit dem Unterordner `data`.
3. Im Container Manager unter **Projekt › Erstellen** die `docker-compose.yml` von oben einfügen, den Pfad anpassen (`/volume1/docker/stups/data:/data`) und starten.
4. Den Einrichtungscode unter **Container › stups › Protokoll** ablesen.
5. Von außen nur über HTTPS erreichbar machen (siehe unten), nicht den Port 8099 ins Internet freigeben.

Aktualisieren: `docker compose pull && docker compose up -d`; im Container Manager das Image neu herunterladen und das Projekt danach neu starten. Die Datenbank wird beim Start selbst auf den neuen Stand gebracht; vorher legt Stups eine Sicherung unter `data/backups` ab.

## Sicherheit

- **HTTPS.** Passwörter und das Sitzungs-Cookie sollten nie unverschlüsselt durchs Internet gehen. Stelle einen Reverse Proxy mit Zertifikat davor (bei Synology: **Systemsteuerung › Anmeldeportal › Erweitert › Reverse Proxy**, Ziel `http://localhost:8099`) und trage die https-Adresse als `STUPS_PUBLIC_URL` ein. Für WebSockets (Live-Sync) muss der Proxy die Kopfzeilen `Upgrade` und `Connection` durchreichen; bei Synology unter **Benutzerdefinierte Kopfzeile › WebSocket**.
- **Anmeldung.** Passwörter werden mit scrypt gespeichert, Sitzungen laufen 30 Tage und verlängern sich bei Nutzung. Nach fünf Fehlversuchen wartet man eine Minute, jeder weitere Fehlversuch verdoppelt die Wartezeit (höchstens 30 Minuten). Ändert jemand sein Passwort, melden sich seine anderen Geräte ab (Passkeys bleiben bestehen). Passkeys: siehe „Anmelden mit Passkey".
- **Kopfzeilen.** Anmelde-Kopfzeilen von Home Assistant oder einem Proxy werden im eigenen Container nie beachtet.
- **Offen ist nur ein Weg ohne Anmeldung:** `/api/push/action` für die Knöpfe in ntfy-Nachrichten, und nur mit gültigem, signiertem Token.
- **Datensicherung.** Alles liegt im Datenordner (`stups.sqlite`, `files`, `backups`). Eine Kopie dieses Ordners genügt.

## Von der Home-Assistant-App umziehen

In der App unter **Einstellungen › Hilfe und Daten › Papierkorb, Archiv, Umzug** die Daten exportieren; sie landen in `/share/stups-umzug` von Home Assistant. Kopiere diesen Ordner `stups-umzug` in einen Ordner auf der NAS (zum Beispiel `./share`) und binde ihn beim ersten Start des neuen Containers ein:

```yaml
    volumes:
      - ./stups-daten:/data
      - ./share:/share:ro
```

Ist der Datenordner noch leer, übernimmt Stups Datenbank und Anhänge daraus. Die Personen kommen mit, ihre Anmeldung nicht. Richte den ersten Administrator wie oben ein; gibst du ihm als Namen den einer vorhandenen Person, bekommt diese Person das Konto, ihre Karten bleiben ihr. Für jede weitere Person legst du unter **Personen & Zugriff** eine Anmeldung an.
