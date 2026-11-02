# Testliste für Stups

Rechenregeln, Datenbank, Schnittstellen und Oberfläche sind automatisch getestet und im Browser in Handygröße bedient. **Nicht prüfbar ohne echtes Handy** ist alles, was die Companion App, Push und Home Assistant brauchen. Das ist diese Liste, nach Bereichen geordnet. Wenn etwas nicht stimmt: kurz notieren, was du getan, erwartet und gesehen hast.

Für die Beispiele: Anna und Ben sind zwei Personen in Stups, jede mit dem eigenen Handy.

## 0 · Update

- [ ] Erst aktualisieren, wenn unter github.com/ArrestedOps/ha-stups/actions der letzte Lauf **grün** ist (das Image braucht nach dem Hochladen einige Minuten, sonst „manifest unknown 404")
- [ ] App-Store → ⋮ → Nach Updates suchen → Seite neu laden → Stups → **Aktualisieren**. Nie deinstallieren: Das löscht alle Aufgaben
- [ ] Companion App komplett schließen und neu öffnen

## 1 · Aufbau und Bedienung

- [ ] **Kopfzeile von HA** (Titel und Menü) ist über der App weg. Falls nicht: Einstellungen → „HA-Kopfzeile ausblenden" prüfen
- [ ] **„‹ Dashboard"** oben links führt zum gewählten Dashboard (Einstellungen → Dashboard wählen)
- [ ] Dunkel und hell folgen dem iPhone: Dunkel mit warmem Schwarz und orangem Schimmer, hell mit Creme und weichen Schatten. Alle Texte gut lesbar
- [ ] Die Seite lässt sich nicht seitlich verschieben (nur die Filter-Chips wischen), die Tastatur verdeckt keine Felder
- [ ] **Leiste unten** mit Boards, Agenda, Kalender; die letzte Karte einer Liste ist nicht abgeschnitten, das „+" verdeckt nichts

## 2 · Karten wischen und sortieren

- [ ] **Finger nach links** auf einer Karte: Hinter der Karte erscheint der **nächste** Status, loslassen verschiebt. Finger **nach rechts**: vorheriger Status
- [ ] „**Geplant**" wird beim Wischen übersprungen (Offen → In Arbeit)
- [ ] Wischen bis „Erledigt" erledigt die Karte, eine wiederkehrende bekommt eine neue Karte mit neuem Termin. „Rückgängig" im Hinweis stellt sie wieder her
- [ ] Senkrechtes Scrollen der Liste stört das Wischen nicht, und umgekehrt
- [ ] **„⋯" an der Karte**: Verschieben nach …, Erledigt, **Duplizieren**, Details, Löschen (mit Rückfrage)
- [ ] Der Kreis links an der Karte erledigt sie
- [ ] **Farbbalken** links: rot überfällig, orange heute, gelb bald, grau später; erledigte Karten und Karten ohne Termin haben keinen
- [ ] Kategorien erscheinen als Chip mit farbigem Punkt, „Angelegt …" steht unten in jeder Karte

## 3 · Spalte „Geplant"

- [ ] Karte mit **Termin morgen oder später** landet von selbst in „Geplant", mit Termin **heute** oder ohne Termin in „Offen"
- [ ] „Geplant" ist nach Termin sortiert, nur Karten mit Termin nach heute kommen hinein (sonst Hinweis)
- [ ] **Am Tag der Fälligkeit** (kurz nach Mitternacht) rückt die Karte von selbst nach „Offen"
- [ ] Board-Einstellungen: pro Spalte „Geplant?" und „Erledigt?" umschaltbar

## 4 · Karten-Fenster

- [ ] Oben „**✓ Erledigt**" links und „**Speichern**" rechts. Nach Änderungen kurz „✓ Gespeichert"
- [ ] Die **Chips** (Status, Zuständig, Fälligkeit, Wiederholung, Erinnerung, Priorität, Kategorie, Kosten) öffnen je ein Feld darunter
- [ ] Fälligkeit: „Heute 18:00", „Morgen 09:00", eigenes Datum mit der iPhone-Uhrzeitwahl, „Entfernen"
- [ ] **Kategorie direkt anlegen:** Im Feld „Kategorie" unter den Chips „Neue Kategorie" tippen, Namen eingeben, „Erstellen": Sie ist angelegt und gewählt. Gleicher Name noch einmal: keine zweite, die vorhandene wird gewählt
- [ ] Checkliste, Link einfügen (Seitentitel, Maps-Link öffnet die Karten-App), Kommentar, Beschreibung
- [ ] **Foto/PDF**: Hinzufügen (Kamera, Mediathek), Vorschau, Antippen öffnet es in der App, Entfernen
- [ ] **Verlauf** ganz unten: angelegt, verschoben, erledigt, wieder geöffnet, Termin geändert

## 5 · Wiederkehrende Aufgaben

- [ ] Eine wiederkehrende Karte erledigen (z. B. „Müll rausbringen", alle 2 Tage): Sie steht danach in „Erledigt" mit „Erledigt heute …", eine neue Karte mit dem nächsten Termin liegt in „Geplant" (oder oben in „Offen", wenn der Termin heute ist)
- [ ] **Rückgängig** direkt danach: Die Karte ist wieder offen, die neue ist weg
- [ ] **Per Push erledigen:** In der Nachricht „Erledigt" tippen. Sie wird durch „Erledigt · nächste Karte …" ersetzt
- [ ] **Übernahme:** Im Feld „Wiederholen" stehen unter „Für die nächste Karte übernehmen" sechs Schalter. Fotos und Kommentare sind aus, die anderen vier an
- [ ] Im Verlauf der neuen Karte steht „Aus Wiederholung angelegt"

## 6 · Agenda und Kalender

- [ ] **Agenda:** Überfälliges oben in Rot, dann Heute, Morgen und die weiteren Tage mit Karten, aus allen Boards mit Boardname und Farbpunkt
- [ ] **Filter Personen:** Chip „Anna" zeigt nur ihre Karten, „Niemand" nimmt die nicht zugewiesenen dazu, die Zahlen stimmen
- [ ] **Filter Boards:** nur die gewählten Boards. „Erledigte" blendet Erledigtes der letzten Woche ein, „Zurücksetzen" räumt auf
- [ ] Der Kreis links erledigt eine Karte, ein Tipp öffnet sie (auch aus einem anderen Board)
- [ ] **Kalender Woche:** Karten stehen zur Uhrzeit mit Boardfarbe, die aktuelle Uhrzeit ist markiert; Pfeile blättern, „Heute" springt zurück
- [ ] **Tag und Monat:** Tag zeigt Titel und Boardname; im Monat zeigen Punkte die Karten, ein Tipp auf einen Tag öffnet ihn
- [ ] **Filter** (Knopf oben rechts im Kalender) wirkt wie in der Agenda
- [ ] **Karte anlegen:** Auf einen freien Zeitpunkt tippen: Uhrzeit stimmt, Board wählbar, „Anlegen" legt sie an. „Alle Felder …" öffnet das volle Formular mit dem Termin

## 7 · Push-Benachrichtigungen

Karte mit **Zuständigen und Fälligkeit in 2–3 Minuten** anlegen.

- [ ] Nachricht kommt zur Fälligkeit **nur bei den Zuständigen**. Ohne Zuweisung keine Nachricht
- [ ] Tippen auf die Nachricht öffnet die App, **direkt die Karte?** (Sonst bitte notieren)
- [ ] Aufgeklappt (nach links wischen → „Ansicht", herunterziehen oder lange drücken): **„Erledigt"** erledigt die Karte inkl. Wiederholung, die Nachricht verschwindet auch am anderen Gerät
- [ ] Vorab-Erinnerung (Chip „Erinnerung") kommt einmal. „Nachhaken" kommt ab dem Tag nach der Fälligkeit zur eingestellten Uhrzeit
- [ ] Tageszusammenfassung am Morgen: nur eigene Aufgaben, nichts bei leerem Tag
- [ ] Add-on neu starten: keine doppelten Nachrichten, Verpasstes „(verspätet)"
- [ ] Einstellungen → „Test-Nachricht an mich senden" funktioniert, „Stand anzeigen" erklärt, warum eine Nachricht kommt oder nicht

## 8 · Stupsen

Zwei Personen, jede mit dem eigenen Handy.

- [ ] **Stupsen:** In einer Karte, die der anderen Person gehört, „Stupsen" tippen. Die Person ist vorausgewählt, „Heute noch?" wählen, „Stups senden". Die Karte hüpft, „Gestupst!" erscheint. Bei eigenen oder nicht zugewiesenen Karten fehlt der Knopf
- [ ] **Push mit drei Knöpfen:** Auf dem anderen Handy kommt „Anna stupst dich" (Karte · Nachricht). Aufklappen: **Erledigt**, **Mach ich**, **Später**
- [ ] **Mach ich:** Die Absenderin bekommt leise „Ben macht's 👍", die Nachricht beim Empfänger verschwindet
- [ ] **Später:** Die Nachricht verschwindet und kommt nach einer Stunde noch einmal, höchstens dreimal
- [ ] **Erledigt:** Die Karte ist erledigt, die Absenderin bekommt „… hat erledigt ✓". Erledigt Ben die Karte in der App, passiert dasselbe
- [ ] **Sperrzeit:** Gleich noch einmal stupsen: Die Person ist ausgegraut mit „wieder ab hh:mm", nach 30 Minuten geht es wieder
- [ ] **Ruhezeit:** Einstellungen › Personen & Zugriff › Person antippen: „Ruhezeit für Stupse". Beginn auf kurz vor jetzt stellen und stupsen: Das Fenster sagt „wird um … zugestellt", die Nachricht kommt erst dann
- [ ] **Abzeichen und Filter:** Die gestupste Person sieht an der Karte „Anna stupst dich", die Absenderin „Du hast Ben gestupst". Der Filter „Gestupst" zeigt nur gestupste Karten. Alles ohne Neuladen

## 9 · Personen und Zugriff

- [ ] Einstellungen › Personen & Zugriff: Personen mit ihren Push-Geräten, Zugriff „Alle in Home Assistant" oder „Nur diese Personen"
- [ ] **Push-Geräte:** Geräte ankreuzen und abwählen, dann die Test-Nachricht senden: Sie kommt nur auf den angekreuzten Geräten an
- [ ] **Rolle:** Normale Home-Assistant-Benutzer sind Mitglieder: Dashboard-Auswahl, Zugriffsmodus und Personenverwaltung sind gesperrt, die eigenen Push-Geräte lassen sich wählen. Boards, Spalten, Kategorien und Karten kann jeder anlegen und ändern. Administratoren von Home Assistant können alles
- [ ] **Sperre (optional):** Zugriff auf „Nur diese Personen" stellen und mit einem Benutzer öffnen, der keine Person ist: „Kein Zugriff". Als Administrator unter „Wartet auf Freigabe" freigeben

- [ ] **Konfiguration in Home Assistant:** Unter Apps › Stups › Konfiguration bei `users` zwei Personen mit ihren `mobile_app_…`-Diensten und `access_mode` eintragen, App neu starten. In Stups steht unter Personen & Zugriff der Hinweis „… in der Konfiguration verwaltet", Personen und Geräte stimmen, Zugriff ist gesperrt (nicht änderbar), Anzeigename und Ruhezeit lassen sich ändern. `users` wieder leeren und neu starten: Alles ist in der App wieder änderbar

## 9b · Wächter (echtes System nötig)

Zuerst Einstellungen › Diagnose-Seite › „Wächter-Test": Alle Zustände lesen und beide Auslöser müssen „geht" zeigen.

- [ ] **Reiter:** In der Leiste unten gibt es „Wächter" (als Administrator immer). Er zeigt je Wächter Bedingung, aktuellen Zustand, offene Karte und die letzte Aktivität. Ein Mitglied (kein Administrator) sieht den Reiter ebenfalls (ohne Wächter mit einem Hinweis), kann aber nichts ändern: kein „+", keine Schalter
- [ ] **Waschmaschine:** Reiter „Wächter" › „+" › Vorlage „Waschmaschine fertig", den Leistungs-Sensor wählen, Board und Titel prüfen, Speichern. Ein echter Waschgang: Nach dem Ende (Leistung 3 Minuten unter dem Schwellwert) entsteht die Karte, bei einer **anwesenden** Person, mit Push „Neue Karte für dich"
- [ ] **Anwesenheit:** Eine Person ist unterwegs. Der Wächter gibt die Karte nur an Personen, die in Home Assistant `home` sind, und wechselt bei mehreren reihum
- [ ] **Testen:** Im Wächter „Testen: Karte jetzt anlegen": Karte und Push kommen bei der richtigen Person an; im Verlauf der Karte steht der Wächter
- [ ] **Zähler und Heimkehr (Saugroboter):** Vorlage „Saugroboter: Behälter leeren". An einem Tag, an dem alle weg sind: Nach der dritten Reinigung erscheint die Karte **ohne Zuständige** mit dem Hinweis „Wartet auf die erste Person, die heimkommt". Wer zuerst nach Hause kommt, bekommt sie samt Nachricht. Wird die Karte erledigt, beginnt der Zähler bei 0
- [ ] **Vergleich:** Eure bestehende Automation mit dem Zähler-Helfer zum Saugroboter läuft parallel mit; beide liefern dasselbe. Ob sie danach abgeschaltet wird, besprechen wir gemeinsam (Stups ändert nichts daran)
- [ ] **Keine Doppelkarten:** Solange die Karte offen ist, entsteht keine zweite; im Verlauf der Karte steht „Erneut ausgelöst"
- [ ] **Erledigt sich selbst:** Mit „Erledigt sich selbst, wenn …" (z. B. Tür der Waschmaschine) wird die Karte erledigt
- [ ] **Neustart:** App neu starten, während eine Bedingung erfüllt ist: keine zweite Karte. Wächter beim Anlegen mit schon erfüllter Bedingung: keine Karte, erst beim nächsten Mal
- [ ] **Eigene Automation:** Das Beispiel aus der Anleitung (`stups_create_card`) in einer Automation auslösen: Karte erscheint, ein zweites Auslösen mit demselben `dedupe_key` nicht; die Diagnose-Seite zeigt beide Ereignisse
- [ ] **Sensor:** `sensor.stups_waechter_offen` zählt die offenen Wächter-Karten

## 10 · Zwei Geräte

- [ ] Änderungen am einen Gerät erscheinen am anderen sofort und umgekehrt
- [ ] App im Hintergrund, am anderen Gerät ändern, wieder öffnen: aktueller Stand
- [ ] Beide Personen sind in Home Assistant mit ihrem eigenen Benutzer angemeldet: Namen, „Nur meine" und Push stimmen

## 11 · Home Assistant

- [ ] `sensor.stups_ueberfaellig` und `…_heute_faellig` (gesamt und je Person) stimmen mit der App überein; `sensor.stups_stupse_offen` und `sensor.stups_gestupst_<name>` zählen mit
- [ ] Der Dashboard-Button öffnet die App (YAML unter Einstellungen)
- [ ] Sensoren sind nach einem HA-Neustart nach wenigen Minuten wieder da

## 12 · Rand- und Fehlerfälle

- [ ] Flugmodus: „Offline" erscheint, beim Wiederverbinden lädt alles neu
- [ ] Karte löschen → Papierkorb → wiederherstellen. Spalte mit Karten löschen: Die App fragt nach der Zielspalte
- [ ] Archiv: Frist des Boards auf 1 Tag stellen, am nächsten Tag liegen erledigte Karten dort
- [ ] Kosten: Bei einer Karte „Kosten" eintragen. Oben im Board steht „Kosten: … offen", nach dem Erledigen „… erledigt"
- [ ] iPad oder Laptop ab 1024 px: alle Spalten nebeneinander, Karten per Maus ziehbar

## 13 · Eigener Container ohne Home Assistant (nur wenn du ihn nutzt)

Nach `docs/docker.md` aufgebaut, zum Beispiel auf der NAS.

- [ ] Erster Start: `docker logs stups` zeigt „Einrichtung: … Code". Im Browser erscheint die Einrichtung, ein falscher Code wird abgelehnt, mit dem richtigen entsteht der Administrator und man ist gleich drin. Danach lässt sich die Einrichtung nicht mehr öffnen
- [ ] Drei Reiter (Boards, Agenda, Kalender), kein „Dashboard"-Button, in den Einstellungen nichts von Home Assistant oder Wächtern (Benachrichtigungen nur, wenn ntfy eingerichtet ist, siehe 14)
- [ ] Personen & Zugriff › Benutzer anlegen: Ben bekommt ein Konto, meldet sich auf seinem Handy an und sieht die gemeinsamen Boards. Er sieht keine Benutzerverwaltung
- [ ] Neu laden bzw. App schließen und wieder öffnen: man bleibt angemeldet. Einstellungen › Abmelden führt zur Anmeldung
- [ ] Passwort ändern: danach melden sich die anderen Geräte der Person ab
- [ ] Hinter dem Reverse Proxy mit https: Anmeldung, Live-Sync zwischen zwei Geräten (WebSocket) und Fotos hochladen funktionieren
- [ ] Container neu starten (oder `docker compose pull && up -d`): Daten und Anmeldungen sind noch da, unter `data/backups` liegt nach einem Versionswechsel eine Sicherung

## 14 · Push über ntfy im Container (nur wenn du ntfy nutzt)

Nach dem Abschnitt „Push-Nachrichten über ntfy" in `docs/docker.md`: `STUPS_NTFY_URL` und `STUPS_PUBLIC_URL` gesetzt, ntfy-App auf dem Handy.

- [ ] Personen & Zugriff › deine Person › „Push über ntfy": „Zufälliges Thema" erzeugen, speichern, in der ntfy-App denselben Server und dasselbe Thema abonnieren. Unter der Person steht „Push über ntfy"
- [ ] Einstellungen › Benachrichtigungen › „An mich senden": Die Nachricht „Stups: Test" kommt auf dem Handy an (nicht nur im Protokoll)
- [ ] Auf den Knopf „Rückweg prüfen" tippen, dann „Stand anzeigen": Dort steht „Rückweg der Knöpfe zuletzt geprüft: …". Steht dort stattdessen ein Hinweis zu `STUPS_PUBLIC_URL`, fehlt die Adresse oder das Handy erreicht sie nicht
- [ ] Karte mit Termin in ein paar Minuten, dir zugewiesen: zur Fälligkeit kommt die Nachricht mit „Erledigt". Tippen auf den Knopf erledigt die Karte, die Nachricht verschwindet (neuere ntfy-Server) oder bleibt stehen (ältere)
- [ ] Tippen auf die Nachricht selbst öffnet die Karte in Stups (Anmeldung nötig, falls abgemeldet)
- [ ] Zweites Handy/zweite Person: Stups an die Person schicken. Sie sieht drei Knöpfe („Erledigt", „Mach ich", „Später"); „Mach ich" meldet dem Absender „… macht's 👍" zurück
- [ ] Person ohne Thema: Beim Stupsen heißt es „kein Push-Gerät", unter „Stand anzeigen" steht „kein Thema eingetragen"
- [ ] Tageszusammenfassung zur eingestellten Uhrzeit kommt an (Variable `STUPS_DAILY_SUMMARY_TIME`)

## 15 · Container mit Home Assistant (nur wenn du `HA_URL` und `HA_TOKEN` setzt)

Nach dem Abschnitt „Mit Home Assistant verbinden" in `docs/docker.md`.

- [ ] `docker logs stups` zeigt „Verbindung zu Home Assistant: …" und keine Meldung zu abgelehnter Anmeldung. Die Oberfläche hat vier Reiter, darunter **Wächter**
- [ ] Personen & Zugriff › „Aus Home Assistant": Die Personen aus Home Assistant stehen dort (ohne die, die es in Stups schon gibt). **Hinzufügen** macht sie zur Person
- [ ] Wächter anlegen (Vorlage „Waschmaschine fertig" o. ä.), Ereignis auslösen: Die Karte erscheint, mit „wer ist zu Hause" bekommt sie nur, wer in Home Assistant gerade zu Hause ist (Namen gleich)
- [ ] In Home Assistant erscheinen die Sensoren `sensor.stups_…` und aktualisieren sich
- [ ] Bei einer Person ein Handy der Companion App ankreuzen, Einstellungen › Benachrichtigungen › „An mich senden": Die Nachricht kommt an, Tippen darauf öffnet Stups (nicht Home Assistant) und, bei einer Karte, die Karte
- [ ] „Erledigt" in der Nachricht der Companion App erledigt die Karte, auch wenn das Handy Stups nicht erreicht (Weg über Home Assistant)
- [ ] Home Assistant neu starten: Stups verbindet sich von selbst wieder (Wächter lösen danach wieder aus), Sensoren erscheinen spätestens nach 5 Minuten

## 16 · Passkeys im Container (nur wenn `STUPS_PUBLIC_URL` eine https-Adresse mit Namen ist)

Nach dem Abschnitt „Anmelden mit Passkey" in `docs/docker.md`. Dieser Ablauf lässt sich nur am echten Gerät prüfen: die Browser-Tests haben keinen virtuellen Authenticator.

- [ ] Mit einer IP-Adresse (`http://<NAS>:8099`) fehlen in den Einstellungen der Abschnitt „Passkeys" und auf der Anmeldeseite der Knopf. Im Protokoll steht, warum
- [ ] Über die https-Adresse: Einstellungen › Passkeys › „Passkey hinzufügen", Name „iPhone", das Gerät fragt nach Gesicht bzw. Fingerabdruck, danach steht der Passkey in der Liste („noch nicht benutzt")
- [ ] Abmelden: Auf der Anmeldeseite erscheint „Mit Passkey anmelden". Tippen, Gerät bestätigen, ohne Benutzername und Passwort bist du drin. In der Liste steht „zuletzt benutzt" mit heutigem Datum
- [ ] Beim Anmelden das Gerät abbrechen: Meldung „Abgebrochen oder vom Gerät abgelehnt", kein Absturz, Passwort geht weiter
- [ ] Zweites Gerät (anderes Handy oder Laptop): eigenen Passkey anlegen, beide stehen in der Liste, jeder lässt sich einzeln entfernen
- [ ] Passkey entfernen, abmelden: Die Anmeldung mit diesem Passkey klappt nicht mehr (das Gerät bietet ihn eventuell noch an), das Passwort geht
- [ ] Passwort ändern: Passkeys bleiben, die anderen Geräte melden sich ab und kommen mit ihrem Passkey wieder hinein
- [ ] Zweite Person (Ben): sieht und entfernt nur ihre eigenen Passkeys

## 17 · Beta-App „Stups (Beta)" (seit 1.9.0)

Nach `stups-beta/DOCS.md`. Die normale App bleibt in diesem Abschnitt unberührt: nichts davon darf ihre Daten, Nachrichten oder Sensoren verändern.

- [ ] In Home Assistant die Adresse `https://github.com/ArrestedOps/ha-stups#beta` unter Repositories hinzufügen: **Stups (Beta)** mit „BETA"-Symbol erscheint. Daneben ein zweites „Stups" aus dieser Adresse: **nicht** installieren
- [ ] In der **normalen** App Einstellungen › Umzug › Exportieren, **danach** Stups (Beta) installieren und starten: Die Daten sind da (Boards, Karten, Personen). In der Seitenleiste steht „Stups Beta" neben „Stups"
- [ ] Beta › Einstellungen: oben das Band „Beta" mit „Push-Nachrichten: Aus" und „Wächter" aus
- [ ] Mit Push **Aus** und einer Karte, die gleich fällig wird: **keine** Nachricht, auch nicht „Beta ·". Die normale App meldet sich wie gewohnt
- [ ] Push auf **Nur für mich**: Eine fällige Karte, die dir zugewiesen ist, schickt „Beta · …" nur an dich, nicht an die anderen Personen. Der Knopf „Erledigt" erledigt die Karte in der Beta, **nicht** in der normalen App (dort bleibt sie offen)
- [ ] In der normalen App auf „Erledigt" einer normalen Nachricht tippen: Die Karte in der Beta bleibt offen (eigene Daten, eigene Knöpfe)
- [ ] Wächter in der Beta einschalten: Sie legen danach Karten an (nur in der Beta), vorher nicht. Sensoren heißen `sensor.stups_beta_…`, die der normalen App bleiben unverändert
- [ ] Nach einer neuen Beta-Version in Home Assistant: „Nach Updates suchen" zeigt sie in der Beta-Adresse, **ohne** dass die normale App ein Update bekommt

## 18 · Kompakte Karten und Feinschliff (seit 1.10.0)

Am iPhone, in der Beta zuerst (Abschnitt 17), dunkel und hell.

- [ ] Board „Offen": **mindestens vier Karten** stehen vollständig über der Leiste (ohne zu scrollen). Titel und Meta-Zeile sind gut lesbar, nichts ist zu klein zum Tippen (Kreis links, Karte, Menü „…")
- [ ] Karte mit langem Titel: höchstens **zwei Zeilen**, danach „…"
- [ ] Meta-Zeile: Termin (rot und „heute 15:01", wenn überfällig), Wiederholungs-Symbol, Flagge (orange = mittel, rot = hoch), „1/2" bei einer Checkliste, Zahlen bei Kommentaren, Links und Anhängen, Kosten. Kategorien sind kleine Punkte rechts. Wächter-Karten haben das Auge
- [ ] „Angelegt vor …" steht **nicht** mehr in der Liste, aber im Karten-Fenster
- [ ] Wischen nach links/rechts und das Menü „…" gehen wie vorher; der Farbbalken links zeigt die Dringlichkeit
- [ ] Agenda und Kalender: Zeilen und Ansichten sehen unverändert gut aus
- [ ] Unten in der Liste die **letzte Karte** nach oben schieben: Sie lässt sich über den „+"-Knopf hinaus scrollen, der Kostenbetrag o. ä. ist nicht verdeckt
- [ ] Spalten-Tabs („Offen · 3", „Erledigt · 1" …) und Filter-Chips: Am Rand ist ein **Verlauf**, wenn es weitergeht. Wählt man eine halb sichtbare Spalte, rückt sie ins Bild
- [ ] Karten-Fenster: oben rechts steht **„Fertig"** (nicht „Speichern"). Eine Änderung zeigt in der Mitte kurz „✓ Gespeichert", „Fertig" schließt
- [ ] Auswahlfelder (Wächter › Bedingung/Board/Spalte/Fälligkeit/Rückfall, Karte › Wiederholung, Erinnerung, Einstellungen › Dashboard, Board-Einstellungen › Spalte löschen): Wert und Pfeil, Antippen öffnet den Picker des Handys, die Wahl ändert die Anzeige
## Bekannte Lücken

- Dass die Kopfzeile ausgeblendet wird, ließ sich ohne Companion App nicht sehen (zwei Wege eingebaut, siehe 1).
- Ob Tippen auf die Push-Nachricht **direkt** in die Karte springt, hängt von der Companion App ab.
- ESLint und die Browser-Tests (WebKit, iPhone-Ansicht) laufen bei jedem Build. Sie bilden das Wischen mit Zeiger-Ereignissen nach, echtes Touch ersetzt das nicht.
- Nicht umgesetzt: Spalten per Ziehen sortieren (stattdessen Pfeile in den Board-Einstellungen).
