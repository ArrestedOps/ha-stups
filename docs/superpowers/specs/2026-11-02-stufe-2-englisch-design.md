# Stufe 2: Englisch, Demo und Ankündigung (Nachtrag zur Spec)

Stand 02.11.2026, Ausgangslage Stups 1.13.0. Grundlage ist das Briefing „Stups ausbauen" (Stufe 2). Dieses Dokument hält fest, **wie** wir es umsetzen, was beim Lesen des Codes anders war als im Briefing angenommen, und was in der Klärung entschieden wurde. Stufe 3 bekommt einen eigenen Nachtrag.

## 1. Ziel

Stups ist für Menschen nutzbar und auffindbar, die kein Deutsch sprechen (Home-Assistant-Community), ohne dass sich für die bestehenden deutschen Nutzer etwas ändert: Ein deutsches Gerät zeigt weiter Deutsch. Dazu gehören eine englische Oberfläche samt englischen Push-Nachrichten, eine englische Anleitung, ein kurzes Demo-GIF im README und fertige Ankündigungstexte (die ich nicht selbst veröffentliche).

## 2. Entscheidungen aus der Klärung

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Standardsprache | **Englisch ist der Standard**, Deutsch nach Gerät: Meldet das Gerät (Browser, iPhone, Home Assistant) Deutsch, zeigt Stups Deutsch, in jedem anderen Fall Englisch |
| 2 | Umfang | **Alles:** Oberfläche, Push-Nachrichten und Fehlermeldungen, README und Anleitung, Add-on-Texte in Home Assistant |
| 3 | Demo | **GIF im README**, automatisch aufgenommen (Browser-Test, erfundene Daten, ohne Ton), bei jeder Version neu erzeugbar |
| 4 | Ankündigung | Entwürfe für das **Home-Assistant-Community-Forum (EN), Reddit r/homeassistant (EN), GitHub-Release (EN) und deutsche Foren (DE)**. Ich entwerfe nur, du veröffentlichst |

## 3. Was beim Lesen des Codes anders war als im Briefing

1. **Der Umfang ist größer als „Oberfläche übersetzen".** Rund 520 Zeilen im Browser-Code und rund 530 Zeilen im Server enthalten Umlaute, dazu viele deutsche Texte ohne Umlaut (zusammen weit über 1.000 Texte). Sie stehen nicht nur in den 41 Komponenten, sondern auch in `store.svelte.ts` (Hinweise), `lib/watchers.ts`, `lib/quickadd/`, und serverseitig in `watchers.ts`, `notifications.ts`, `store/*.ts` (Fehlermeldungen), `ha.ts`, `push.ts`, `ntfy.ts`.
2. **Push-Nachrichten haben keinen Browser.** Der Server schickt sie an eine Person. Die Sprache muss daher **pro Person** gespeichert werden, nicht nur pro Gerät. Das braucht eine Datenbank-Spalte (Migration 14).
3. **Stups-Texte sind heute fertig gespeichert.** Die Vorlagen („Denkst du dran?") landen als Text in `nudges.text`. Wer sie in der Sprache des Absenders speichert, schickt dem Empfänger womöglich die falsche Sprache. Die Spalte `nudges.template` gibt es schon: gerendert wird künftig **beim Zustellen in der Sprache des Empfängers**. Eigene Texte bleiben unverändert.
4. **Die Tests hängen am deutschen Text.** Rund 750 Server-Tests und alle Browser-Tests prüfen deutsche Meldungen und Beschriftungen. Der Plan achtet darauf, dass sie ohne Umschreiben weiterlaufen (siehe 4.4).
5. **Die Schnell-Eingabe ist vorbereitet.** Die Wörter stehen in `lib/quickadd/dictionary.ts` pro Sprache; Englisch ist ein zweites Wörterbuch, die Regeln bleiben.
6. **Home Assistant zeigt nur eine Anleitung.** `DOCS.md` und `CHANGELOG.md` kennen keine Übersetzung. Die Add-on-Optionen dagegen schon (`translations/en.yaml` neben `de.yaml`).

## 4. Design

### 4.1 Mechanismus: „Deutscher Text ist der Schlüssel"

Zwei Wege standen zur Wahl:

- **A: Schlüssel** (`t('card.delete.title')`, ein Katalog je Sprache). Sauber, aber jede der über 1.000 Stellen und alle Tests, die Texte prüfen, müssten umgeschrieben werden. Hohes Risiko für Rückschritte.
- **B: Deutscher Text als Schlüssel** (`t('Karte löschen?')`, ein englischer Katalog `de → en`). Der Code bleibt lesbar, Tests mit deutschem Text laufen weiter, wenn die Sprache „de" ist. **Gewählt.** Eine Stelle wird mit `t()` umhüllt, der englische Katalog bekommt den Eintrag dazu.

Regeln:

- Platzhalter in geschweiften Klammern: `t('„{title}“ → {column}', { title, column })`. Zahlen mit Mehrzahl über `tn('{n} Karte', '{n} Karten', n)` mit Eintrag in beiden Sprachen (Englisch: `one`/`other`).
- Fehlt ein englischer Eintrag, erscheint der deutsche Text (nichts bricht), ein **Abdeckungstest** meldet es aber als Fehler: Er sammelt per Quelltext-Analyse alle `t('…')`/`tn('…')`-Texte und prüft, dass (a) jeder einen englischen Eintrag hat, (b) kein englischer Eintrag verwaist ist, (c) die Platzhalter in beiden Sprachen übereinstimmen.
- Katalog: `packages/web/src/lib/i18n/en.ts` und `packages/server/src/i18n/en.ts`. Kein gemeinsames Paket (aus demselben Grund wie bei der Schnell-Eingabe: Aufwand für Workspace, Build, Dockerfile, CI); wo beide Seiten denselben Text brauchen, steht er in beiden Katalogen, der Abdeckungstest erzwingt Vollständigkeit.
- Nicht übersetzt wird, was Menschen eingeben (Titel, Namen, Kommentare, eigene Stups-Texte) und die Namen aus Home Assistant.

### 4.2 Sprache bestimmen und speichern

Reihenfolge im Browser: **Wahl in den Einstellungen** (Deutsch / English / „Automatisch") → **Sprache des Geräts** (`navigator.languages`, beginnt sie mit „de": Deutsch) → **Englisch**.

- Neue Einstellung **Sprache** (Einstellungen › Allgemein), je Person, nicht je Gerät: gilt auf allen Geräten, auch für Push.
- Neue Spalte `users.language` (`null` = Automatisch). Der Browser meldet beim Start seine aufgelöste Sprache (`PUT /api/me/language`), wenn die Person auf „Automatisch" steht; so kennt der Server die Sprache für Push, ohne dass jemand etwas einstellt. Eine feste Wahl überschreibt das.
- Fehlermeldungen der API: Sprache pro Anfrage aus der Kopfzeile `X-Stups-Language` (sendet die App), sonst `Accept-Language`, sonst Englisch. Der Server liest sie in einem `AsyncLocalStorage` ab; `t()` im Store braucht so keine zusätzlichen Parameter.
- **Migration 14** (`users.language`), vorher wie immer automatische Sicherung. Es gibt keine neue Tabelle. Bestehende Personen haben `null` und erhalten Push in der Sprache, die ihr Gerät beim nächsten Öffnen meldet; bis dahin gilt für sie **Deutsch** (damit niemand nach dem Update plötzlich englische Push-Nachrichten bekommt).
- Zeiten und Daten nutzen `Intl` mit der Sprache (`de-DE` / `en-GB`: 24-Stunden-Zeit und Wochenbeginn Montag in beiden, damit sich nichts verschiebt). Die Währung bleibt €.

### 4.3 Reihenfolge der Arbeit (drei Versionen, jede zuerst in die Beta)

| Version | Inhalt |
|---|---|
| **1.14.0** | Mechanismus (`t`, `tn`, Katalog, Abdeckungstest), Sprachauswahl, Migration 14, **gesamte Oberfläche** inkl. Schnell-Eingabe (englisches Wörterbuch), Wächter-Texte im Browser, Daten- und Zeitformate |
| **1.15.0** | **Server:** Fehlermeldungen, Push-Nachrichten (Titel, Texte, Knöpfe), Tageszusammenfassung, Stups-Vorlagen beim Zustellen, Diagnose-Seite, Protokolltexte bleiben Deutsch (Entwickler-Log), `translations/en.yaml` für beide Apps |
| **1.16.0** | **Doku und Reichweite:** README, `DOCS.md`, `docs/docker.md` und `docs/entwicklung.md` auf Englisch (Deutsch bleibt als `*.de.md`), Changelog künftig zweisprachig, Demo-GIF, Ankündigungsentwürfe, Hinweis zur Lizenz im Forum-Text |

Jede Version geht zuerst in die Beta (`X.Y.Z-beta.N`); nach deiner Freigabe nach `main`, wie bisher.

### 4.4 Tests

- **Server:** Eine Setup-Datei setzt die Standardsprache der Tests auf Deutsch, damit die bestehenden 750 Tests unverändert laufen. Neue Tests: Sprache pro Anfrage (`X-Stups-Language`, `Accept-Language`, Standard), Sprache pro Person für Push, Stups-Vorlage in der Sprache des Empfängers, Migration 14, Abdeckungstest.
- **Browser (WebKit):** Alle bestehenden Projekte laufen mit `locale: 'de-DE'` (sonst wäre die Oberfläche englisch). Neues Projekt **`english`** prüft die wichtigsten Abläufe auf Englisch (Karte anlegen mit Schnell-Eingabe auf Englisch, Erledigen, Agenda, Einstellungen, Sprache wechseln).
- **Web-Einheiten:** englisches Wörterbuch der Schnell-Eingabe (`tomorrow 7pm @Ben #Home every week !!`), Zeit- und Datumsformate, Mehrzahlen, Sprachwahl.
- **Abdeckungstest** (4.1) läuft in `pnpm test` und damit in der CI.

### 4.5 Doku

- `README.md` und `stups/DOCS.md` werden Englisch, die deutschen Fassungen bleiben als `README.de.md` und `stups/DOCS.de.md` (verlinkt im Kopf). `docs/docker.md` und `docs/entwicklung.md` genauso. Die Testliste bleibt Deutsch (nur für dich).
- Änderungsprotokoll: neue Einträge zweisprachig (Englisch zuerst); alte Einträge bleiben Deutsch.
- Screenshots in README (Englisch): eine eigene Serie mit englischen Beispieldaten; die deutschen bleiben in `README.de.md`.

### 4.6 Demo-GIF

- `e2e/demo.mjs` fährt im iPhone-Format durch eine feste Abfolge mit erfundenen Daten: Schnell-Eingabe tippen, Chips erscheinen, Karte anlegen, Karte per Wischen erledigen, Agenda, Wächter-Karte erscheint live. Einzelbilder per Screenshot, zusammengesetzt mit **`gifenc`** (reines JavaScript, Entwicklungsabhängigkeit; `ffmpeg` ist nicht nötig).
- Ziel: unter 3 MB, höchstens 20 Sekunden, Datei `docs/images/demo.gif`. Gleiche Abfolge auf Englisch und Deutsch (`demo.en.gif`, `demo.de.gif`).

### 4.7 Ankündigungen

Entwürfe in `docs/announcements/` (Markdown, nicht im Add-on-Ordner): `ha-community.en.md`, `reddit.en.md`, `github-release.en.md`, `forum-de.md`. Gemeinsame Aussagen: was Stups ist, das GIF, Installation in zwei Klicks (Knopf „Zu Home Assistant hinzufügen"), was es von einer Aufgabenliste in Home Assistant unterscheidet (Wächter, Stupsen, Push mit „Erledigt"), die Beta-Adresse, **ehrlich zur Lizenz** (Quelltext einsehbar, aber nicht Open Source: PolyForm Strict) und dass Rückmeldung willkommen ist.

## 5. Nicht in dieser Stufe

- Weitere Sprachen (der Mechanismus trägt sie, jede Sprache ist ein Katalog plus ein Wörterbuch für die Schnell-Eingabe).
- Anpassung von Währung und Wochenbeginn.
- Übersetzung der Protokollzeilen im Add-on-Log (bleiben Deutsch, sind für Entwickler).
- Veröffentlichung der Ankündigungen (du postest).

## 6. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Übersehene deutsche Texte in der englischen Oberfläche | Abdeckungstest; zusätzlich ein Test, der im englischen Browser-Projekt prüft, dass keine deutschen Wörter in den Kernabläufen erscheinen |
| Bestehende Nutzer bekommen plötzlich Englisch | Deutsche Geräte bleiben deutsch; Personen ohne gemeldete Sprache bekommen Push weiter auf Deutsch (4.2) |
| Englisch ist länger und sprengt Layouts (kompakte Karten, Chips, Tabs) | Browser-Test mit englischem Projekt plus Screenshots; Prüfung am iPhone in der Beta |
| Falsche Mehrzahl oder holprige Übersetzung | Katalog ist Klartext und lässt sich von dir gegenlesen; Beta zuerst |
| Doku in zwei Sprachen läuft auseinander | Deutsche Fassung ist nach 1.16.0 eingefroren-gepflegt; Hinweis im Kopf beider Dateien, welche maßgeblich ist (Englisch) |

## 7. Erfolgskriterien

- Ein Gerät mit englischer Einstellung zeigt Stups durchgehend auf Englisch (Oberfläche, Fehlermeldungen, Push), ein deutsches Gerät unverändert auf Deutsch; die Sprache lässt sich in den Einstellungen umstellen.
- Alle bisherigen Tests laufen unverändert weiter (mit deutscher Standardsprache), dazu die neuen.
- Die Datenbank-Migration 14 läuft auf einer Kopie der echten Daten ohne Verlust.
- README (Englisch) mit GIF, vier Ankündigungsentwürfe liegen vor.
