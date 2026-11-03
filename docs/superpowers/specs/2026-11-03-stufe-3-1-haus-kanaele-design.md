# Stufe 3.1: Stups ins Haus (Haus-Kanäle) – Nachtrag zur Spec

Stand 03.11.2026, Ausgangslage Stups 1.15.0. Grundlage ist das Briefing „Stups ausbauen" (Stufe 3, Abschnitt 3.1). Dieses Dokument hält fest, **wie** wir es umsetzen, was beim Lesen des Codes zu beachten war und was in der Klärung entschieden wurde. Die übrigen Teile von Stufe 3 (3.2 Fairness, 3.3 Kind, 3.4 Vorlagen, 3.5 HA-Integration) bekommen je einen eigenen Nachtrag, wenn sie dran sind.

## 1. Ziel

Ein Stups kommt nicht nur aufs Handy, sondern ins Zuhause: als **Lautsprecher-Ansage** oder als **aufleuchtende Lampe**. Gedacht für Kinder ohne Handy und für alle, die im Haus sind, ohne aufs Telefon zu schauen. Wahlweise auch Fälligkeits-Erinnerungen und Wächter-Karten. Nur mit Verbindung zu Home Assistant.

## 2. Entscheidungen aus der Klärung

| Frage | Entscheidung |
|---|---|
| Kanäle im ersten Release | **Ansage und Lampe**, jeder Kanal einzeln ein- und ausschaltbar. Das Popup über Browser Mod kommt in einem späteren Release (braucht eine Zusatz-Integration) |
| Nachrichtenarten | **Pro Kanal wählbar** (Stups, Fälligkeit, Wächter-Karte). Neu eingerichtet ist nur „Stups" an |
| Person nicht zu Hause | **Beides, der Administrator wählt je Kanal:** *verwerfen* oder *warten bis zur Heimkehr* (mit Frist, Vorschlag 2 Stunden, einstellbar) |
| Ruhezeit | Die der Person, wie beim Stupsen. Stupse sind dort ohnehin zurückgehalten; Erinnerungen und Wächter-Karten werden in der Ruhezeit **verworfen**, nicht nachgeholt |
| Wer richtet ein | Nur Administratoren, unter Personen & Zugriff |
| Sprachdienst (TTS) | **Einmal für alle Haus-Kanäle** gewählt, nicht je Kanal |
| Reihenfolge in Stufe 3 | 3.1 Haus-Kanäle, dann 3.2 Fairness, 3.3 Kind, 3.4 Vorlagen, 3.5 Spike. Jeder Teil ein eigenes Release, zuerst in die Beta |

## 3. Was beim Lesen des Codes zu beachten war

- **`PushGateway` und `combinePush`** (`push.ts`) sind schon für mehrere Wege gebaut: erreichbar über einen, gesendet über alle, die die Person kennen. Der Haus-Weg ist ein dritter Weg daneben. Doppelungsschutz, Protokoll und der Beta-Schalter (`beta-gate.ts` wickelt das kombinierte Gateway ein) greifen dadurch ohne Umbau. Ohne das würden Beta und normale App im selben Haus gleichzeitig ansagen.
- **`PushMessage` kennt weder die Art der Nachricht noch einen Sprechtext.** Der Notifier baut Titel und Text fürs Handy, ein Lautsprecher braucht einen eigenen, kurzen Satz. Der Notifier bekommt zwei neue Felder an der Nachricht: `kind` (`nudge` | `due` | `watcher`) und `spoken` (fertiger Satz in der Sprache des Empfängers, über `inLang`). Nachrichten ohne `kind` (Tageszusammenfassung, Test) erreichen den Haus-Weg nie.
- **Anwesenheit gibt es schon bei den Wächtern** (`watchers.ts`, `presence()` und `arrival()`): Zuordnung der Stups-Person zur HA-`person.*`-Entität über `user_id`, sonst über den Namen, dazu ein Abonnement auf Zustandswechsel. Das wird in ein gemeinsames Modul gezogen (`presence.ts`), damit die Wächter unverändert bleiben und der Haus-Weg dieselbe Zuordnung benutzt.
- **Erreichbarkeit** (`push.canReach`) entscheidet an mehreren Stellen, ob man jemanden stupsen oder zuweisen darf (`notifications.ts`, `api/settings.ts`). Wer einen eingeschalteten Haus-Kanal hat, gilt dadurch als erreichbar, auch ohne Push-Gerät.
- **Stupse in der Ruhezeit** werden schon im Datenteil bis zum Ende der Ruhezeit zurückgehalten (`store/nudges.ts`, `deliverAtFor`). Der Haus-Weg muss sie nicht noch einmal prüfen.
- Der nachgebaute Home Assistant der Tests (`e2e/mock-ha.mjs`) zeichnet Push-Aufrufe auf. Er lernt Ansage, Lautstärke, Lampe, Szenen, Entitätsliste und Personen-Zustand dazu.
- **Lehre aus 1.15.0:** Tests mit Wanduhr hängen von der Tageszeit ab. Alle Zeitregeln hier laufen in Einheiten-Tests mit fester Uhr (`deps.now`), nie mit der echten.

## 4. Design

### 4.1 Aufbau und Daten

- Neuer Weg `createHousePush` (Datei `house.ts`), zusammen mit den bestehenden Wegen in `combinePush`. Er ist nur da, wenn es eine Verbindung zu Home Assistant gibt (`runtime.ha`).
- **Migration 16** (vorher wie immer eine Sicherung):
  - `house_channels`: `id`, `user_id` (Person, löscht mit), `type` (`speak` | `light`), `name`, `entity_id`, `enabled`, `kinds` (JSON, Vorgabe `["nudge"]`), `when_away` (`skip` | `wait`, Vorgabe `skip`), `wait_minutes` (Vorgabe 120), `volume` (leer oder 10–100, nur Ansage), `created_at`.
  - `house_pending`: die Warteschlange für „warten bis zur Heimkehr": `id`, `channel_id` (löscht mit), `kind`, `message` (JSON), `card_id`, `nudge_id`, `expires_at`, `created_at`.
  - Der Sprachdienst steht in der vorhandenen Tabelle `settings` (`house_tts_entity`).
- Ein Kanal gehört einer Person, eine Person kann mehrere haben. Die Kanäle gehören zu den Daten der Person (sie werden mit ihr exportiert und gesichert).

### 4.2 Ablauf und Regeln

Der Haus-Weg prüft für jeden eingeschalteten Kanal der Person der Reihe nach:

1. **Art:** Steht `kind` der Nachricht in den `kinds` des Kanals? Sonst still.
2. **Ruhezeit:** Nur für `due` und `watcher`: in der Ruhezeit der Person verwerfen. `nudge` ist schon zurückgehalten.
3. **Anwesenheit** über `presence.ts`:
   - zu Hause: weiter zu 4;
   - nicht zu Hause und `skip`: verwerfen, Vermerk im Protokoll;
   - nicht zu Hause und `wait`: in `house_pending` ablegen (Frist `wait_minutes`).
   - **Gibt es keine passende HA-Person, gilt sie als zu Hause** (sonst liefe der Kanal nie). Die Oberfläche weist darauf hin.
4. **Zustellen** (Abschnitt 4.3).

**Warteschlange:** Wechselt eine Person nach „home" (Abonnement wie bei den Wächtern, Schlüssel `house:arrival`) oder beim Nachprüfen alle 30 Sekunden, werden ihre fälligen Einträge ausgeliefert. Vorher prüft der Server, ob die Karte noch offen und der Stups noch nicht beantwortet ist, sonst wird verworfen. Abgelaufene Einträge werden gelöscht.

**Ergebnis:** `send` meldet „zugestellt", wenn mindestens ein Kanal ausgeliefert oder in die Warteschlange gelegt hat. Sonst „nicht zugestellt", und der Absender sieht es wie bisher. `canReach` ist wahr, sobald die Person mindestens einen eingeschalteten Haus-Kanal hat. `clear` ist hier ohne Wirkung (eine Ansage lässt sich nicht zurücknehmen).

**Beta:** Der Beta-Schalter für Push gilt auch hier. Solange er aus ist, bleibt es im Haus still.

**Fehler:** Fehlt die Entität oder ist Home Assistant nicht erreichbar, ist es „nicht zugestellt", der Fehler steht im Protokoll, und der Kanal zeigt in der Push-Übersicht sein letztes Ergebnis.

### 4.3 Ansage und Lampe

**Ansage** (`speak`)

- Sätze in der Sprache der Person, kurz, ohne Sonderzeichen, Titel auf 80 Zeichen gekürzt:
  - Stups: „Ben, Anna stupst dich: Müll rausbringen. Denkst du dran?" (Vorlagentext oder eigener Text hängt an)
  - Fälligkeit: „Ben, Müll rausbringen ist fällig."
  - Wächter-Karte: „Ben, neue Aufgabe: Müll rausbringen."
- Aufruf: `tts.speak` mit `entity_id` (der gewählte Sprachdienst), `media_player_entity_id` (der Kanal), `message`, `language` und `cache: true`.
- **Lautstärke** (optional): vor der Ansage `media_player.volume_set`, danach Rückstellung auf den vorherigen Wert nach der geschätzten Sprechdauer (Länge des Satzes × 0,08 s + 3 s). Best effort: Startet Stups genau dazwischen neu, bleibt die neue Lautstärke.
- Was bei laufender Musik passiert, bestimmt der Player. Die Anleitung sagt das offen.

**Lampe** (`light`)

- Leuchtet **5 Sekunden in der Akzentfarbe der Person** (der Farbton aus 1.15.0, ohne Wahl Orange) bei voller Helligkeit. Der Server braucht dafür eine kleine Kopie der Farbrechnung (OKLCH zu RGB), ein Test hält sie gleich der im Browser.
- Ablauf: Zustand mit `scene.create` merken (`scene.stups_haus_<kanal>`), `light.turn_on` mit `rgb_color` und `brightness_pct: 100`, nach 5 s `scene.turn_on` der gemerkten Szene. War die Lampe aus, ist sie danach wieder aus. Lampen ohne Farbe leuchten weiß.
- **Sperre je Lampe:** Kommt ein zweiter Stups während des Leuchtens, wird die Dauer verlängert und **kein zweiter Zustand gemerkt** (sonst bliebe die Lampe an).
- Beim Start des Servers werden übrig gebliebene `scene.stups_haus_*` abgespielt und gelöscht (`scene.delete`), falls ein Neustart mitten im Leuchten kam.

**Sicherheit:** Gewählt werden dürfen nur Entitäten aus `media_player`, `light` (Kanal) und `tts` (Sprachdienst); der Server prüft das gegen die Liste aus Home Assistant. Die aufgerufenen Dienste sind fest verdrahtet, es gibt keine freien Aufrufe.

**Test-Knopf** je Kanal: „Das ist ein Test von Stups" bzw. die Lampe leuchtet. Er ignoriert Art, Ruhezeit und Anwesenheit und zeigt „ok" oder den Fehler.

### 4.4 Oberfläche und Schnittstelle

- **Personen & Zugriff:** In der aufgeklappten Person ein Block **„Haus"** unter den Push-Geräten: Liste der Kanäle mit Schalter, „Kanal hinzufügen" (Typ, Entität aus einer Liste), je Kanal drei Häkchen für die Arten, „Wenn nicht zu Hause: verwerfen / warten (Frist in Minuten)", bei Ansagen die Lautstärke, Test-Knopf, Entfernen mit Rückfrage. Ein Hinweis, wenn keine HA-Person zugeordnet werden kann.
- **Sprachdienst:** Eine Gruppe „Haus" oben in Personen & Zugriff (nur Administratoren), Auswahl aus den `tts`-Entitäten.
- Nur Administratoren ändern. Der Block erscheint nur mit Home Assistant und bleibt auch änderbar, wenn die Personenliste in der Add-on-Konfiguration verwaltet wird (diese Liste kennt keine Kanäle).
- **Push-Übersicht** (Einstellungen) zeigt die Kanäle je Person mit dem letzten Ergebnis.
- **Schnittstelle** (alle nur für Administratoren): `GET /api/house/channels`, `POST /api/house/channels`, `PATCH` und `DELETE /api/house/channels/:id`, `POST /api/house/channels/:id/test`, `GET /api/house/entities` (Entitäten zur Auswahl), `PUT /api/house/settings` (Sprachdienst). Dazu eine Fähigkeit `house` in `/api/capabilities`.
- Alle Texte auf Deutsch und Englisch (Katalog `en.ts`, Abdeckungstest).

### 4.5 Tests

- **Server, Einheiten (feste Uhr):** Nachrichtenarten; Ruhezeit nur für `due`/`watcher`; verwerfen und warten mit Frist; Prüfung „Karte noch offen / Stups unbeantwortet"; Erreichbarkeit ohne Push-Gerät; Beta-Schalter; `kind` und `spoken` aus dem Notifier; Sätze auf Deutsch und Englisch; Lautstärke setzen und zurückstellen; Lampe (Szene merken, Farbe, Zurückstellen, Verlängern statt zweiter Szene, Aufräumen nach Neustart); Entitäten-Prüfung nach Domäne; Migration 16 aus einer Datenbank im Stand von 15; die Farbkopie gegen feste Werte aus dem Browser-Modul.
- **Browser:** Der Test-Home-Assistant lernt Ansage, Lautstärke, Lampe, Szenen, Entitäten und Personen-Zustand. Geprüft werden: Kanal anlegen, Test-Knopf, Stups an eine Person ohne Push-Gerät, abwesend mit „verwerfen", abwesend mit „warten" und dann heimkommen, Lampe leuchtet und wird zurückgestellt, Mitglied sieht keine Verwaltung.
- Die bestehenden Tests (Push, Stupse, Wächter) laufen unverändert.

### 4.6 Doku und Release

- Anleitung (`stups/DOCS.md` und `.de.md`): Abschnitt „House channels" mit Einrichtung, Regeln und den ehrlichen Hinweisen (Musik, Lautstärke, Lampen).
- Testliste: Abschnitt für das **echte Haus** (Lautsprecher, Lampe, Heimkehr, Ruhezeit, Beta-Schalter), den nur du abhaken kannst.
- Release **1.16.0**: zuerst `1.16.0-beta.1`, Haus-Kanäle in der Beta erst nach dem Einschalten von Push (Einstellungen › Beta). Freigabe für die normale App erst nach deinem Test.

## 5. Nicht in diesem Teil

- Popup auf Wand-Tablets (Browser Mod), das folgt als eigener Kanal-Typ
- Antwort-Knöpfe auf Haus-Kanälen (erledigt wird in der App)
- Mehrere Sprachdienste, Stimmen je Person
- Haus-Kanäle im Docker-Betrieb ohne Verbindung zu Home Assistant
- Tageszusammenfassung und Sonntags-Zusammenfassung im Haus
- Fairness, Kind-Rolle, Vorlagen, HA-Integration (eigene Teile von Stufe 3)

## 6. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Doppelte Ansagen in Beta und normaler App | Der Beta-Schalter wickelt auch den Haus-Weg ein; Test dafür |
| Lampe bleibt nach Neustart oder bei zwei Stupsen an | Sperre je Lampe mit Verlängern, Aufräumen der Szenen beim Start, Tests |
| Nachts spricht oder leuchtet das Haus | Ruhezeit der Person; Erinnerungen und Wächter-Karten werden dort verworfen, Stupse sind zurückgehalten |
| Ansage reißt Musik ab oder ist zu laut | Lautstärke optional, Rückstellung; Hinweis in der Anleitung, dass der Player das Verhalten bestimmt |
| Person ohne passende HA-Person bekommt nie etwas | Gilt als zu Hause, Hinweis in der Oberfläche |
| Die Warteschlange liefert veraltete Dinge aus | Prüfung „noch offen", Frist, Aufräumen |
| Zeitabhängige Tests | Feste Uhr in allen Zeitregeln (Lehre aus 1.15.0) |
| Zusatzrechte in Home Assistant | Nur drei Domänen, feste Dienste, nur für Administratoren, Auswahl gegen die Liste aus Home Assistant geprüft |

## 7. Erfolgskriterien

- Ein Stups an eine Person ohne Handy, aber mit Haus-Kanal, kommt als Ansage und/oder Lampe an und lässt sich abbilden im Protokoll.
- Ohne Haus-Kanäle ändert sich für niemanden etwas (alle bestehenden Tests unverändert grün).
- Nachts und bei Abwesenheit verhält sich jeder Kanal nach seiner Einstellung.
- Beta und normale App sagen nie doppelt an.
- Die Lampe ist nach jedem Aufleuchten wieder im alten Zustand.
- Alle Texte gibt es auf Deutsch und Englisch, die Abdeckungstests sind grün.
- Browser-Tests laufen stabil (keine Abhängigkeit von der Uhrzeit).

## 8. Was sich bei der Umsetzung gegenüber dem Entwurf geändert hat

- **Erreichbarkeit kennt die Art der Nachricht:** `canReach(userId, kind)`. Eine Person, die nur einen Stups-Kanal hat, gilt für Fälligkeiten und Zusammenfassungen nicht als erreichbar (sonst hätte der Notifier sinnlos wiederholt). Ohne Art erreicht nichts das Haus. Dazu zählt `hasDevice` im Datenteil eingeschaltete Haus-Kanäle für Stupse, sonst wäre eine Person ohne Handy trotz Kanal nicht stupsbar.
- **Bewusst Verworfenes ist kein Fehler:** `send` meldet „zugestellt“, wenn ein Kanal ausgeliefert, in die Warteschlange gelegt oder wegen Ruhezeit/Abwesenheit bewusst verworfen hat. Nur wenn alle passenden Kanäle an einem Fehler scheitern, ist es „nicht zugestellt“. Sonst würde der Notifier nach 1, 5 und 15 Minuten wiederholen.
- **Personen werden weich entfernt** (`is_person = 0`, wie bisher): Ihre Kanäle bleiben in der Datenbank, zählen aber nur, solange die Person eine Person ist. Kommt sie zurück, gelten sie wieder.
- **Die Warteschlange hat einfache Spalten** (`kind`, `spoken`, `card_id`, `nudge_id`) statt eines JSON-Felds.
- **Anwesenheit beim Senden wird frisch erfragt** (einmal je Nachricht); nur der Takt der Warteschlange nutzt den Zwischenspeicher. Sonst gälte jemand, der gerade weggegangen ist, noch bis zu 15 Sekunden als zu Hause.
- **Das Beta-Tor gilt auch für die Warteschlange**, denn sie liefert selbst aus und läuft nicht über `send`: `betaGate.pushAllowed`.
- **Der Sprachdienst-Wert wird sofort gelesen:** `run` führt Änderungen erst später aus, dann ist `event.currentTarget` leer. Der Browser-Test mit `selectOption` hat das gezeigt.
- Der Abdeckungstest der Oberfläche liest die Quelltexte vom Dateisystem (`import.meta.glob` merkte sich die Dateiliste, neue Dateien fehlten).
