# Stups

Kanban-Board für den Haushalt, direkt in Home Assistant (Ingress, kein eigener Login). Mehrere Boards, wiederkehrende Aufgaben, Push-Erinnerungen mit „Erledigt"-Button und Live-Sync zwischen allen Geräten.

## Einrichtung

1. App starten und in der Seitenleiste **Stups** öffnen.
2. **Board-Wechsler › Einstellungen › Personen & Zugriff** öffnen:
   - **Personen hinzufügen:** Die Personen aus Home Assistant (Einstellungen › Personen) stehen zur Auswahl. Wer hinzugefügt ist, kann zugewiesen werden und bekommt Push-Nachrichten.
   - **Push-Geräte wählen:** Pro Person die Geräte ankreuzen, auf denen die Nachrichten ankommen sollen. Es erscheinen die Geräte, auf denen die Home-Assistant-Companion-App angemeldet ist. Jede Person wählt ihre Geräte selbst, ein Administrator kann es auch für andere tun.
   - **Zugriff festlegen:** *Alle in Home Assistant* (jeder Home-Assistant-Benutzer darf die App öffnen) oder *Nur diese Personen* (nur die Liste und Administratoren; wer sonst öffnet, sieht „Kein Zugriff" und steht für Administratoren unter „Wartet auf Freigabe").
3. Unter **Einstellungen › Zurück zum Dashboard** das Dashboard für den Zurück-Button wählen.

### Rollen

- **Administrator** ist, wer es in Home Assistant ist. Administratoren ändern Personen, Zugriff und Dashboard und kommen immer hinein.
- **Mitglieder** benutzen die App und wählen ihre eigenen Push-Geräte.
- Wer aus der Liste entfernt wird, verliert Zuweisungen und Nachrichten, die Karten bleiben unverändert. Kommt die Person zurück, gilt alles wieder.

### Optionen des Add-ons (Konfiguration in Home Assistant)

Alles lässt sich auch in Home Assistant einstellen, unter **Einstellungen › Apps › Stups › Konfiguration**:

```yaml
users:                       # Wer Stups nutzt und wohin die Push-Nachrichten gehen
  - name: Anna               # Name wie in Home Assistant (Einstellungen › Personen)
    notify:                  # Notify-Dienste der Companion App, ohne "notify."
      - mobile_app_annas_iphone
  - name: Ben
    notify:
      - mobile_app_bens_iphone
      - mobile_app_bens_ipad
access_mode: selected        # selected = nur diese Personen und Administratoren, everyone = alle Home-Assistant-Benutzer
dashboard_path: /            # Vorgabe für den Zurück-Button, später in der App änderbar
daily_summary_time: "08:00"  # Tageszusammenfassung
overdue_nag_time: "18:00"    # Nachhaken bei Überfälligkeit
```

Die Namen der Geräte findest du in Home Assistant unter Entwicklerwerkzeuge › Aktionen (Dienste `notify.mobile_app_…`); in der App zeigt Einstellungen › Personen & Zugriff, welche Geräte Home Assistant kennt.

**Zwei Wege, ein Ergebnis:** Ist unter `users` mindestens eine Person eingetragen, **gilt diese Liste** (bei jedem Start der App): Die genannten Personen werden angelegt und bekommen ihre Geräte, wer nicht in der Liste steht, ist keine Person mehr (seine Karten behalten die Zuweisung), der Zugriff folgt `access_mode`. In der App sind Personen, Geräte und Zugriff dann gesperrt und nur zu sehen; Anzeigename und Ruhezeit lassen sich weiter ändern. Nach einer Änderung der Konfiguration die App neu starten. Bleibt `users` leer, pflegst du alles in der App unter Einstellungen › Personen & Zugriff, und ohne Auswahl gilt „Alle in Home Assistant".

## Benutzung

- **Boards** wechseln über den Titel oben. Jedes Board hat eigene Spalten und Kategorien. Kategorien legst du am einfachsten direkt an der Karte an (Feld „Kategorie" › „Neue Kategorie"); Umbenennen, Umfärben und Löschen geht unter Board-Wechsler › Board-Einstellungen.
- **Karten** haben Titel, Spalte, Zuständige, Fälligkeit (immer mit Uhrzeit), Wiederholung, Erinnerung, Priorität, Kategorien, Kosten, Beschreibung, Checkliste, Links, Anhänge und Kommentare.
- **Erledigen**: Kreis links an der Karte, „Erledigt" oben im Karten-Fenster oder aus der Push-Nachricht. Einen Moment lang gibt es „Rückgängig".
- **Wischen**: Finger nach links schiebt die Karte in den nächsten Status, nach rechts in den vorigen. Hinter der Karte steht, wohin sie springt. „Geplant" wird übersprungen.
- **Verschieben und mehr**: über „⋯" an der Karte (Verschieben nach …, Erledigt, Duplizieren, Details, Löschen). Auf großen Bildschirmen lassen sich Karten mit der Maus ziehen.
- **Geplant**: Karten mit Termin nach heute stehen in „Geplant" und rücken am Tag der Fälligkeit nach „Offen". So bleibt „Offen" übersichtlich. Pro Board lässt sich einstellen, welche Spalte „Geplant" und welche „Erledigt" ist.

### Aussehen

Dunkel und hell folgen dem iPhone (oder dem Gerät). Ein farbiger **Balken links** an jeder Karte zeigt die Dringlichkeit: rot überfällig, orange heute, gelb in den nächsten zwei Tagen, grau später. Kategorien stehen als Chip mit farbigem Punkt an der Karte, und „Angelegt …" nennt, wann die Karte entstanden ist (im Karten-Fenster mit Uhrzeit und Person).

### Agenda

Die Leiste unten wechselt zwischen **Boards** und **Agenda**. Die Agenda zeigt alle Karten mit Termin aus allen Boards, nach Tagen sortiert: zuerst **Überfällig**, dann Heute, Morgen und jeder weitere Tag, an dem etwas ansteht. Mit dem Kreis links erledigst du eine Karte, ein Tipp öffnet sie.

Oben filterst du, was du sehen willst:

- **Personen:** „Alle", du selbst („Ich"), jede weitere Person und „Niemand" (Karten ohne Zuständige). Du kannst mehrere wählen; eine Karte erscheint, sobald eine der gewählten Personen zuständig ist. Die Zahl am Chip sagt, wie viele Karten dazugehören.
- **Boards:** ein Chip je Board (mit Boardfarbe). Auch hier mehrere möglich.
- **Erledigte** blendet die in den letzten sieben Tagen erledigten Karten ein. „Zurücksetzen" löscht alle Filter. Der Filter wird auf dem Gerät gemerkt.

### Kalender

Der dritte Reiter unten zeigt die Karten mit Termin im Kalender, wahlweise als **Tag**, **Woche** oder **Monat**. Mit den Pfeilen blätterst du, „Heute" springt zurück.

- **Tag und Woche** zeigen ein Zeitraster. Eine Karte steht zur Uhrzeit ihres Termins in der Farbe ihres Boards; Karten zur selben Zeit stehen nebeneinander. Ein Tipp öffnet die Karte, ein Tipp auf die Tageszahl in der Wochenansicht öffnet den Tag.
- **Monat:** Punkte (am großen Bildschirm die Titel) zeigen, wo etwas ansteht. Ein Tipp auf einen Tag öffnet die Tagesansicht.
- **Karte anlegen:** Auf einen freien Zeitpunkt im Raster tippen. Es öffnet sich ein kurzes Formular mit dem Termin: Titel, Board und Zuständige wählen, „Anlegen". Ist im Filter genau ein Board oder eine Person gewählt, sind sie vorbelegt. „Alle Felder …" öffnet das volle Formular.
- **Filter:** Der Knopf „Filter" oben rechts zeigt dieselben Personen- und Board-Filter wie die Agenda.

### Wiederkehrende Aufgaben

- **Fester Rhythmus** (z. B. jeden Samstag): Der nächste Termin richtet sich nach dem Plan, nicht nach dem Erledigen. Wer am Montag erledigt, was am Samstag fällig war, bekommt den nächsten Samstag.
- **Nach Erledigung** (z. B. Filter alle 3 Monate): Der nächste Termin ist das Erledigungsdatum plus Intervall.
- **Beim Erledigen** (in der App, per Wischen, durch Ziehen nach „Erledigt" oder aus der Push-Nachricht) bleibt die Karte **in „Erledigt"** und wiederholt sich nicht mehr. Dort steht, wann sie erledigt wurde, und sie behält alles: Kommentare, Fotos, Checkliste und Verlauf. Gleichzeitig entsteht eine **neue Karte** mit dem nächsten Termin, oben in „Offen" oder, bei einem Termin nach heute, in „Geplant". Im Verlauf der neuen Karte steht „Aus Wiederholung angelegt".
- **Was die neue Karte übernimmt:** Titel, Zuständige, Kategorien, Priorität, Wiederholung und Erinnerungen immer. Beschreibung, Checkliste (alle Einträge wieder offen), Links, Kosten, Fotos und PDFs sowie Kommentare lassen sich pro Karte im Feld **Wiederholen** unter „Für die nächste Karte übernehmen" ein- oder ausschalten. Ohne eigene Wahl werden Beschreibung, Checkliste, Links und Kosten mitgenommen, Fotos und Kommentare nicht. Übernommene Fotos teilen sich die Datei mit der erledigten Karte.
- **„Rückgängig"** (kurz nach dem Erledigen) macht beides wieder gut: Die Karte ist wieder offen, die neue verschwindet. Das geht nicht mehr, sobald die neue Karte selbst erledigt wurde.
- Ein Hinweis zur Wiederholung: Nach dem Erledigen liegt der nächste Termin auf der **neuen** Karte. Wer den Termin ändern will, tut das dort, nicht an der erledigten Karte.

### Benachrichtigungen

Empfänger sind immer die **zugewiesenen** Personen. Karten ohne Zuweisung oder ohne Fälligkeit melden sich nicht. Beim Anlegen einer neuen Karte ist deshalb die anlegende Person vorausgewählt, und wer bei einer Karte ohne Zuständige einen Termin setzt, bekommt einen Hinweis mit „Mir zuweisen". Ob für eine Karte eine Nachricht kommt, zeigt Einstellungen › Benachrichtigungen › „Stand anzeigen".

- zur Fälligkeit, optional vorab (15 Min. bis 2 Tage vorher) und täglich nachhaken, solange überfällig
- jeden Morgen eine Zusammenfassung mit den eigenen Aufgaben
- Auf dem iPhone erscheint der Button **„Erledigt"**, wenn man die Nachricht aufklappt (nach links wischen und „Ansicht", herunterziehen oder lange drücken)
- Nach einem Neustart werden verpasste Erinnerungen bis 12 Stunden zurück nachgeholt, ohne Doppelungen

### Stupsen

Mit **Stupsen** gibst du einer anderen Person zu einer Karte einen freundlichen Stups („Denkst du dran?"). Der Knopf steht im Karten-Fenster und im Menü „⋯" jeder Karte. Das gilt für alle Personen, die unter Einstellungen › Personen & Zugriff stehen.

1. **An wen:** Zuständige der Karte (außer dir) sind vorausgewählt. Gibt es keine, wählst du selbst. Wer kein Push-Gerät hat, steht ausgegraut mit Hinweis.
2. **Nachricht:** eine der vier Vorlagen oder ein eigener Text mit bis zu 120 Zeichen (er ersetzt die Vorlage).
3. **Stups senden.** Die Karte hüpft kurz, ein Hinweis bestätigt es.

Die Person bekommt eine Push-Nachricht mit drei Knöpfen (auf dem iPhone die Nachricht aufklappen):

- **Erledigt** erledigt die Karte wie der bekannte „Erledigt"-Knopf, bei einer Wiederholung entsteht die neue Karte.
- **Mach ich** schickt dem Absender „macht's 👍".
- **Später** stellt den Stups in einer Stunde noch einmal zu, höchstens dreimal. Danach fehlt der Knopf. Der Absender erfährt davon nichts, im Verlauf der Karte steht es.

Erledigt jemand die Karte (egal wo), bekommt jeder Absender eines offenen Stupses „… hat erledigt ✓", außer er hat sie selbst erledigt. Rückmeldungen kommen leise.

**Damit es nie nervt:**

- Pro Karte, Absender und Empfänger geht höchstens **ein Stups alle 30 Minuten**. Das Sheet zeigt „wieder ab 14:32".
- **Ruhezeit** (Vorgabe 22:00 bis 07:00): Stupse an eine Person in ihrer Ruhezeit werden zum Ende zugestellt. Der Absender sieht „wird um 07:00 zugestellt". Jede Person stellt ihre Ruhezeit selbst ein (Einstellungen › Personen & Zugriff, auf die Person tippen) oder schaltet sie aus. Die Ruhezeit gilt nur für Stupse, nicht für Erinnerungen zur Fälligkeit.
- Wird die Karte erledigt oder gelöscht, bevor ein wartender Stups zugestellt ist, entfällt er.
- Man kann sich nicht selbst stupsen. Dafür gibt es Fälligkeit und Vorab-Erinnerung.

An der Karte zeigt ein orangefarbenes Abzeichen „Conny stupst dich", wenn dich jemand gestupst hat, und ein dezenter Hinweis „Du hast Conny gestupst" bei deinen eigenen. Der Filter **Gestupst** über der Liste zeigt die Karten mit einem offenen Stups an dich. „Stand anzeigen" in den Einstellungen listet die Stupse mit ihrem Stand.

### Sensoren

Für Dashboard und Automationen (die Namen der Sensoren beginnen aus Kompatibilitätsgründen weiter mit `stups`): `sensor.stups_ueberfaellig`, `sensor.stups_heute_faellig` sowie je Person `sensor.stups_ueberfaellig_<name>` und `sensor.stups_heute_faellig_<name>`. Die Attribute `tasks` enthalten Titel, Termin und Board. Dazu `sensor.stups_stupse_offen` (alle offenen Stupse) und je Person `sensor.stups_gestupst_<name>` (offene Stupse an diese Person, mit Karte, Absender und Zeitpunkt als Attribut).

### Archiv und Papierkorb

- Erledigte Karten werden nach der Archivfrist des Boards (Standard 7 Tage) archiviert, auch die erledigten Durchgänge einer wiederkehrenden Karte. Die offene, wiederkehrende Karte wird nie archiviert.
- Gelöschtes liegt 30 Tage im Papierkorb.

### Anhänge

Fotos werden vor dem Hochladen auf höchstens 2048 Pixel verkleinert, als JPEG gespeichert und von Standortdaten befreit. PDFs bis 20 MB gehen unverändert hoch.

## Dashboard-Button (Bubble Card)

Den Pfad zeigt die App unter Einstellungen. Beispiel:

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

## Daten umziehen

Zieht Stups in Home Assistant auf eine andere Adresse um (anderes Repository = andere App), bleiben die Daten nicht automatisch erhalten. Sie wandern über einen Export:

1. In der bisherigen App: **Einstellungen › Umzug › Daten exportieren** (nur für Administratoren). Datenbank und Anhänge liegen danach in `/share/stups-umzug`.
2. Die neue Stups-App installieren und **zum ersten Mal starten**. Sie übernimmt den Export von selbst, im Log steht „Daten aus dem Umzug übernommen". Eine App, die schon eigene Daten hat, übernimmt nichts.
3. Prüfen, ob Boards, Karten, Personen und Fotos da sind. Der Dashboard-Button der neuen App hat einen eigenen Panel-Pfad (`/<Kennung>_stups`).
4. Erst danach die bisherige App deaktivieren. Bis dahin bleibt sie als Rückfallebene bestehen.

## Datensicherung

Datenbank und Anhänge liegen im Add-on-Verzeichnis `/data` und sind Teil des normalen Home-Assistant-Backups. Vor jeder Datenbank-Aktualisierung legt die App eine Kopie unter `/data/backups` an (die letzten 5 bleiben).

## Aktualisieren

Neue Versionen erscheinen im App-Store, sobald sie auf GitHub liegen. Das Docker-Image wird danach noch einige Minuten gebaut. Erst aktualisieren, wenn der letzte Lauf unter „Actions" des Repositorys grün ist, sonst meldet Home Assistant „manifest unknown 404". Aktualisieren, **nicht** deinstallieren: Beim Deinstallieren werden alle Daten der App gelöscht.

## Fehlersuche

- **Diagnose-Seite:** `…/diagnose.html` im Panel (Einstellungen › Diagnose-Seite) zeigt erkannten Nutzer, Verbindung zu Home Assistant und Test-Push.
- **Push kommt nicht an:** Ist unter Einstellungen › Personen & Zugriff bei der Person ein Gerät angekreuzt? „Stand anzeigen" in den Einstellungen zeigt, wer für welche Karte eine Nachricht bekommt. Die Diagnose-Seite markiert Dienste, die es nicht mehr gibt.
- **„Kein Zugriff" beim Öffnen:** Der Zugriff steht auf „Nur diese Personen", und du bist nicht dabei. Ein Administrator gibt dich unter Einstellungen › Personen & Zugriff frei.
- **Panel öffnet auf dem Handy nichts:** Dann ist das Panel nur für Administratoren sichtbar. Stups gibt das Panel für alle Benutzer frei; fehlt es trotzdem, in Home Assistant bei der App „In der Seitenleiste anzeigen" prüfen.
