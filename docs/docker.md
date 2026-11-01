# Stups ohne Home Assistant (Docker)

Stups läuft nicht nur als Home-Assistant-App, sondern auch als eigener Docker-Container, zum Beispiel auf einer Synology-NAS. Es ist dasselbe Image und dieselbe Datenbank.

| | Home-Assistant-App | Eigener Container ohne Home Assistant |
|---|---|---|
| Anmeldung | die Benutzer von Home Assistant | eigene Konten mit Passwort |
| Personen | aus Home Assistant | in Stups gepflegt (jeder Benutzer ist eine Person) |
| Boards, Agenda, Kalender, Wiederholungen, Stupsen | ja | ja |
| Wächter und Sensoren | ja | nein, in der Oberfläche ausgeblendet |
| Push-Nachrichten | Companion App | folgt mit Version 1.6 (ntfy) |

Ein eigener Container **mit** Verbindung zu Home Assistant (Wächter und Sensoren über eine Adresse und ein Zugangs-Token) folgt mit Version 1.7. `HA_URL` und `HA_TOKEN` werden bis dahin noch nicht genutzt.

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

Öffne die Adresse im Browser, gib den Code ein und lege den ersten Administrator an (Benutzername, Name, Passwort mit mindestens 10 Zeichen). Danach ist die Einrichtung für immer geschlossen. Weitere Benutzer legst du unter **Einstellungen › Personen & Zugriff › Benutzer anlegen** an.

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
| `STUPS_PUBLIC_URL` | – | Adresse, unter der Stups erreichbar ist. `https://…` schaltet das Secure-Cookie ein |
| `STUPS_ADMIN_USER`, `STUPS_ADMIN_PASSWORD` | – | erster Administrator, nur beide zusammen. Gilt nur, solange es noch kein Konto gibt |
| `STUPS_DAILY_SUMMARY_TIME` | `08:00` | Uhrzeit der Tageszusammenfassung (HH:MM) |
| `STUPS_OVERDUE_NAG_TIME` | `18:00` | ab wann an Überfälliges erinnert wird (HH:MM) |
| `STUPS_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |
| `STUPS_CONFIG` | `<Datenordner>/options.json` | JSON-Datei mit denselben Einstellungen wie die Add-on-Optionen, falls du lieber eine Datei nimmst |
| `TZ` | `Europe/Berlin` | Zeitzone |

Umgebungsvariablen gehen vor der Datei. In der Home-Assistant-App gelten sie nicht; dort stellt man alles unter Konfiguration ein.

## Synology (Container Manager)

1. **Container Manager** installieren (Paketzentrum). Eine DS218+ ist ein Intel-Gerät und läuft mit dem vorhandenen Image.
2. Ordner anlegen, zum Beispiel `/volume1/docker/stups` mit dem Unterordner `data`.
3. Im Container Manager unter **Projekt › Erstellen** die `docker-compose.yml` von oben einfügen, den Pfad anpassen (`/volume1/docker/stups/data:/data`) und starten.
4. Den Einrichtungscode unter **Container › stups › Protokoll** ablesen.
5. Von außen nur über HTTPS erreichbar machen (siehe unten), nicht den Port 8099 ins Internet freigeben.

Aktualisieren: `docker compose pull && docker compose up -d`; im Container Manager das Image neu herunterladen und das Projekt danach neu starten. Die Datenbank wird beim Start selbst auf den neuen Stand gebracht; vorher legt Stups eine Sicherung unter `data/backups` ab.

## Sicherheit

- **HTTPS.** Passwörter und das Sitzungs-Cookie sollten nie unverschlüsselt durchs Internet gehen. Stelle einen Reverse Proxy mit Zertifikat davor (bei Synology: **Systemsteuerung › Anmeldeportal › Erweitert › Reverse Proxy**, Ziel `http://localhost:8099`) und trage die https-Adresse als `STUPS_PUBLIC_URL` ein. Für WebSockets (Live-Sync) muss der Proxy die Kopfzeilen `Upgrade` und `Connection` durchreichen; bei Synology unter **Benutzerdefinierte Kopfzeile › WebSocket**.
- **Anmeldung.** Passwörter werden mit scrypt gespeichert, Sitzungen laufen 30 Tage und verlängern sich bei Nutzung. Nach fünf Fehlversuchen wartet man eine Minute, jeder weitere Fehlversuch verdoppelt die Wartezeit (höchstens 30 Minuten). Ändert jemand sein Passwort, melden sich seine anderen Geräte ab.
- **Kopfzeilen.** Anmelde-Kopfzeilen von Home Assistant oder einem Proxy werden im eigenen Container nie beachtet.
- **Datensicherung.** Alles liegt im Datenordner (`stups.sqlite`, `files`, `backups`). Eine Kopie dieses Ordners genügt.

## Von der Home-Assistant-App umziehen

In der App unter **Einstellungen › Umzug** die Daten exportieren; sie landen in `/share/stups-umzug` von Home Assistant. Kopiere diesen Ordner `stups-umzug` in einen Ordner auf der NAS (zum Beispiel `./share`) und binde ihn beim ersten Start des neuen Containers ein:

```yaml
    volumes:
      - ./stups-daten:/data
      - ./share:/share:ro
```

Ist der Datenordner noch leer, übernimmt Stups Datenbank und Anhänge daraus. Die Personen kommen mit, ihre Anmeldung nicht. Richte den ersten Administrator wie oben ein; gibst du ihm als Namen den einer vorhandenen Person, bekommt diese Person das Konto, ihre Karten bleiben ihr. Für jede weitere Person legst du unter **Personen & Zugriff** eine Anmeldung an.
