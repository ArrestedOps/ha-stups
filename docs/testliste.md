# Testliste für Stups

Rechenregeln, Datenbank, Schnittstellen und Oberfläche sind automatisch getestet und im Browser in Handygröße bedient. **Nicht prüfbar ohne echtes Handy** ist alles, was die Companion App, Push und Home Assistant brauchen. Das ist diese Liste, nach Bereichen geordnet. Wenn etwas nicht stimmt: kurz notieren, was du getan, erwartet und gesehen hast.

Für die Beispiele: Anna und Ben sind zwei Personen in Stups, jede mit dem eigenen Handy.

## 0 · Update

- [ ] Erst aktualisieren, wenn unter github.com/ArrestedOps/ha-stups/actions der letzte Lauf **grün** ist (das Image braucht nach dem Hochladen einige Minuten, sonst „manifest unknown 404")
- [ ] App-Store → ⋮ → Nach Updates suchen → Seite neu laden → Stups → **Aktualisieren**. Nie deinstallieren: Das löscht alle Aufgaben
- [ ] Companion App komplett schließen und neu öffnen

## 1 · Aufbau und Bedienung

- [ ] **Kopfzeile von HA** (Titel und Menü) ist über der App weg. Falls nicht: Einstellungen → „HA-Kopfzeile ausblenden" prüfen
- [ ] **Home-Knopf** (Haus-Symbol links neben der Glocke) führt zu deinem Dashboard (Einstellungen → Home Assistant → Dashboard)
- [ ] Dunkel und hell folgen dem iPhone: Dunkel mit warmem Schwarz und orangem Schimmer, hell mit Creme und weichen Schatten. Alle Texte gut lesbar
- [ ] Die Seite lässt sich nicht seitlich verschieben (nur die Filter-Chips wischen), die Tastatur verdeckt keine Felder
- [ ] **Leiste unten** mit Aufgaben, Boards, Wächter (Kind und Container ohne Home Assistant: zwei Reiter); die letzte Karte einer Liste ist nicht abgeschnitten, das „+" verdeckt nichts

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

## 6 · Liste (frühere Agenda) und Kalender (seit 1.20.0 in Aufgaben)

- [ ] **Liste** (Aufgaben › Liste): Gruppen Überfällig (rot), Heute, Diese Woche, Später, aus allen Boards mit Boardname; „Alle“ zeigt auch Karten ohne Zuständige
- [ ] **Filter Personen:** Chip „Anna" zeigt nur ihre Karten, „Niemand" nimmt die nicht zugewiesenen dazu, „Meine“ und „Alle“ funktionieren
- [ ] **Filter Boards** (Knopf „Filter“ in der Chip-Zeile): nur die gewählten Boards. „Erledigte" blendet Erledigtes der letzten Woche ein, „Zurücksetzen" räumt auf
- [ ] Der Kreis links erledigt eine Karte, ein Tipp öffnet sie (auch aus einem anderen Board)
- [ ] **Zahlen antippbar** (Aufgaben, oben): „Heute fällig“, „Überfällig“ und „Erledigt heute“ sind Knöpfe (Fokusring, Vorlese-Name „Heute fällig, 3“); jede öffnet ein Blatt von unten, „Schließen“ schließt. Beschriftungen sind nicht abgeschnitten (auch auf einem schmalen Telefon)
- [ ] **Blatt „Heute fällig“:** Zusammenfassung („3 Aufgaben für heute. 1 davon schon erledigt, 2 offen.“), „Bis heute Abend“ nach Uhrzeit, „Schon erledigt“ mit „um 07:42“. Kreis hakt ab, Tipp öffnet die Karte, „In der Liste filtern“ schließt das Blatt und zeigt in der Liste nur Heute, Meine (Filter-Knopf zählt 1)
- [ ] **Blatt „Überfällig“:** rot, „seit gestern“ / „seit 2 Tagen“; „Morgen“ verschiebt nur diese Karte (Uhrzeit bleibt, Karte erscheint in „Geplant“) und der Hinweis „Rückgängig“ holt sie zurück; „Alle auf heute“ (nicht mehr überfällig), „Alle auf morgen“, „Wochenende“ (nächster Samstag) mit Hinweis und Rückgängig; eine wiederkehrende Karte bleibt wiederkehrend; um die Zeitumstellung stimmt die Uhrzeit; leer: „Nichts überfällig 🎉“
- [ ] **Blatt „Heute erledigt“:** Ring „4 von 7 geschafft 👏“ (7 = heute noch fällig + heute erledigt), Liste mit Uhrzeit; „Rückgängig“ öffnet die Karte wieder (Ring und Zahl oben ändern sich); „Archiv öffnen“ und dort „Zurück“; leer: „Heute noch nichts erledigt“
- [ ] **Kind:** die Zahlen und Blätter zeigen nur die eigenen Karten, keine Knöpfe „Morgen“, „Alle auf …“, „Wochenende“; Abhaken wie bisher (mit Bestätigung)
- [ ] **Kalender Woche:** Karten stehen zur Uhrzeit mit Boardfarbe, die aktuelle Uhrzeit ist markiert; Pfeile blättern, „Heute" springt zurück
- [ ] **Tag und Monat:** Tag zeigt Titel und Boardname; im Monat zeigen Punkte die Karten, ein Tipp auf einen Tag öffnet ihn
- [ ] **Filter** (Chips und Knopf „Filter“) wirkt in Tag, Woche und Monat wie in der Liste
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

## 9 · Personen & Zugriff

- [ ] Einstellungen › Personen & Zugriff: Personen mit ihren Push-Geräten, Zugriff „Alle in Home Assistant" oder „Nur diese Personen"
- [ ] **Push-Geräte:** Geräte ankreuzen und abwählen, dann die Test-Nachricht senden: Sie kommt nur auf den angekreuzten Geräten an
- [ ] **Rolle:** Normale Home-Assistant-Benutzer sind Mitglieder: Zugriffsmodus und Personenverwaltung sind gesperrt, die Dashboard-Wahl gilt nur für die eigene Person, die eigenen Push-Geräte lassen sich wählen. Boards, Spalten, Kategorien und Karten kann jeder anlegen und ändern. Administratoren von Home Assistant können alles
- [ ] **Sperre (optional):** Zugriff auf „Nur diese Personen" stellen und mit einem Benutzer öffnen, der keine Person ist: „Kein Zugriff". Als Administrator unter „Wartet auf Freigabe" freigeben

- [ ] **Konfiguration in Home Assistant:** Unter Apps › Stups › Konfiguration bei `users` zwei Personen mit ihren `mobile_app_…`-Diensten und `access_mode` eintragen, App neu starten. In Stups steht unter Personen & Zugriff der Hinweis „… in der Konfiguration verwaltet", Personen und Geräte stimmen, Zugriff ist gesperrt (nicht änderbar), Anzeigename und Ruhezeit lassen sich ändern. `users` wieder leeren und neu starten: Alles ist in der App wieder änderbar

## 9b · Wächter (echtes System nötig)

Zuerst Einstellungen › Diagnose-Seite › „Wächter-Test": Alle Zustände lesen und beide Auslöser müssen „geht" zeigen.

- [ ] **Reiter:** In der Leiste unten gibt es „Wächter" (nicht für Kinder). Er zeigt die Wächter nach Zustand (wartet, läuft, bald dran, ruhig); die Verwaltung (Liste, Bearbeiten, letzte Aktivität) steht unter Einstellungen › Haushalt › Wächter. Ein Mitglied (kein Administrator) sieht den Reiter ebenfalls (ohne Wächter mit einem Hinweis), kann aber nichts ändern: kein „+", keine Schalter
- [ ] **Waschmaschine:** Einstellungen › Haushalt › Wächter › „Wächter aus Vorlagen" › Treffer „Waschmaschine" › „Einrichten", den Leistungs-Sensor wählen, Board und Titel prüfen, Speichern. Ein echter Waschgang: Nach dem Ende (Leistung 3 Minuten unter dem Schwellwert) entsteht die Karte, bei einer **anwesenden** Person, mit Push „Neue Karte für dich"
- [ ] **Anwesenheit:** Eine Person ist unterwegs. Der Wächter gibt die Karte nur an Personen, die in Home Assistant `home` sind, und wechselt bei mehreren reihum
- [ ] **Testen:** Im Wächter „Testen: Karte jetzt anlegen": Karte und Push kommen bei der richtigen Person an; im Verlauf der Karte steht der Wächter
- [ ] **Zähler und Heimkehr (Saugroboter):** Vorlage „Saugroboter: Behälter leeren". An einem Tag, an dem alle weg sind: Nach der dritten Reinigung erscheint die Karte **ohne Zuständige** mit dem Hinweis „Wartet auf die erste Person, die heimkommt". Wer zuerst nach Hause kommt, bekommt sie samt Nachricht. Wird die Karte erledigt, beginnt der Zähler bei 0
- [ ] **Vergleich:** Eure bestehende Automation mit dem Zähler-Helfer zum Saugroboter läuft parallel mit; beide liefern dasselbe. Ob sie danach abgeschaltet wird, besprechen wir gemeinsam (Stups ändert nichts daran)
- [ ] **Keine Doppelkarten:** Solange die Karte offen ist, entsteht keine zweite; im Verlauf der Karte steht „Erneut ausgelöst"
- [ ] **Erledigt sich selbst:** Mit „Erledigt sich selbst, wenn …" (z. B. Tür der Waschmaschine) wird die Karte erledigt
- [ ] **Neustart:** App neu starten, während eine Bedingung erfüllt ist: keine zweite Karte. Wächter beim Anlegen mit schon erfüllter Bedingung (Zustand, Leistung): Rückfrage „Karte jetzt erstellen?“, bei „Nein“ keine Karte, erst beim nächsten Mal, bei „Ja“ sofort; Batterie unter der Grenze: ohne Rückfrage sofort die Karte
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
- [ ] Zwei Reiter (Aufgaben, Boards), kein Home-Knopf in der Kopfzeile, in den Einstellungen nichts von Home Assistant oder Wächtern (Benachrichtigungen nur, wenn ntfy eingerichtet ist, siehe 14)
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

- [ ] `docker logs stups` zeigt „Verbindung zu Home Assistant: …" und keine Meldung zu abgelehnter Anmeldung. Die Oberfläche hat drei Reiter, darunter **Wächter**
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
- [ ] In der **normalen** App Einstellungen › Umzug › Export, **danach** Stups (Beta) installieren und starten: Die Daten sind da (Boards, Karten, Personen). In der Seitenleiste steht „Stups Beta" neben „Stups"
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
## 19 · Schnell-Eingabe und Agenda (seit 1.11.0)

Am iPhone, in der Beta zuerst, dunkel und hell.

- [ ] „Neue Karte": Das Titelfeld hat den Cursor, die Tastatur kommt von selbst. Tippe `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!`. Erkannte Wörter sind **farbig hinterlegt** (genau hinter dem Text, auch wenn die Zeile umbricht), darunter stehen Chips: Tag, 19:00, @Ben, Haushalt, „jeden Dienstag" (oder dein Wochentag), Priorität hoch
- [ ] Die Eigenschaften darunter (Zuständig, Fälligkeit, Wiederholung, Priorität, Kategorie) zeigen dieselben Werte. „Anlegen": Die Karte hat den Titel **„Müll raus"** und genau diese Werte
- [ ] Ein Tipp auf einen Chip nimmt ihn zurück; die Farbe verschwindet, das Wort bleibt im Titel
- [ ] Eine Eigenschaft von Hand ändern (zum Beispiel Priorität „Mittel"), dann in der Zeile weitertippen: Die Handänderung bleibt
- [ ] `@Niemand`: roter Chip „unbekannt", Meldung, **Anlegen ist gesperrt**; den Chip antippen, dann geht es
- [ ] `#Reisen` (gibt es nicht): Chip „neu: Reisen"; beim Anlegen kommt die Rückfrage, danach gibt es die Kategorie im Board
- [ ] Datum ohne Uhrzeit (`übermorgen`): Der Chip nennt die Standard-Uhrzeit. Einstellungen › Vorgaben › „Standard-Uhrzeit für Termine" ändern (nur Administratoren) und prüfen
- [ ] `Montag`, `1. Dezember`, `in 3 Tagen`, `alle 2 Wochen`, `jeden Freitag 18:30`: Die Chips zeigen das richtige Datum bzw. die richtige Wiederholung
- [ ] Ein ganz normaler Titel („Kauf 2 Kisten Wasser") bleibt ohne Chips und unverändert
- [ ] **Agenda:** Eine Karte, die mehr als 60 Tage entfernt ist, steht in der Agenda (die Agenda schaut gleich ein Jahr voraus, wenn sonst nichts anliegt) oder ist über „Weitere 60 Tage laden" erreichbar, auch bei einer leeren Liste (Board-Filter auf ein Board mit nur fernen Karten)

## 20 · Live-Sync mit Änderungen (seit 1.13.0)

Zwei Geräte (zum Beispiel iPhone und Mac), beide in der Beta.

- [ ] Am einen Gerät den Titel einer Karte ändern: Am anderen erscheint er sofort, die Ansicht springt nicht (Scrollposition und offene Spalte bleiben)
- [ ] Eine Karte am einen Gerät in eine andere Spalte schieben, erledigen, löschen: Am anderen ist es sofort zu sehen
- [ ] Ein Board anlegen, eine Spalte oder Kategorie umbenennen, eine Person umbenennen: Am anderen Gerät stimmt danach alles (hier lädt die App wie früher alles neu)
- [ ] Eine Wiederholung erledigen: Am anderen Gerät ist die alte Karte erledigt und die nächste da
- [ ] Am anderen Gerät eine Karte ziehen, während am ersten etwas geändert wird: Die Karte springt nicht weg; nach dem Loslassen stimmt der Stand
- [ ] App im Hintergrund, am anderen Gerät mehrere Karten ändern, wieder öffnen: aktueller Stand
- [ ] Flugmodus kurz an und wieder aus, am anderen Gerät währenddessen etwas ändern: Nach dem Verbinden stimmt der Stand

## 21 · Einstellungen oben rechts (seit 1.13.1, Avatar seit 1.18.0)

- [ ] Oben rechts in der Kopfzeile jedes Reiters (Aufgaben, Boards, Wächter) steht dein Avatar. Ein Tipp öffnet die Einstellungen
- [ ] Der Avatar verdeckt nichts: links die Wortmarke „stups.", rechts Home, Glocke, Zahnrad und Avatar. Auch mit „Offline"-Hinweis und langem Board-Namen passt alles in die Zeile
- [ ] Der Weg über den Board-Namen › „Einstellungen" geht weiter

## 22 · Englisch (seit 1.14.0)

Am iPhone, in der Beta zuerst. Zum Ausprobieren: iPhone-Sprache auf Englisch stellen (oder in Stups unter Einstellungen › Sprache „English“ wählen).

- [ ] **Deutsches iPhone, nichts eingestellt:** Stups ist wie bisher deutsch. Nichts ist plötzlich englisch (Boards, Karten, Agenda, Kalender, Einstellungen)
- [ ] **Englisches Gerät:** Oberfläche durchgehend englisch: Board, Karten-Fenster, „New card“, Agenda, Calendar, Watchers, Settings, Hinweise („Done“, „Undo“). Kein deutsches Wort dazwischen (Spaltennamen alter Boards und eigene Texte sind deutsch, das ist richtig)
- [ ] **Layout:** Die kompakten Karten, Chips, Spalten-Tabs und der Kopf passen auf iPhone-Breite, nichts läuft über den Rand, kein waagerechtes Wischen der ganzen Seite
- [ ] **Zeiten:** „today 19:00“, „tomorrow 09:00“, „Mon 18:30“, „5 Dec“; Kalender: Wochenbeginn Montag, Kopfzeile „2–8 Nov 2026“
- [ ] **Schnell-Eingabe auf Englisch:** `Take out trash tomorrow 7pm @Ben #Home every week !!` ergibt die richtigen Chips; auch `in 3 days`, `next Monday`, `Dec 1`, `at 18:30`, `every 2 weeks`, `important`
- [ ] **Sprache wechseln:** Einstellungen › Sprache › Deutsch: sofort deutsch, ohne Neuladen. Wieder auf „Automatisch“: folgt dem Gerät. Die Wahl gilt auch am zweiten Gerät derselben Person
- [ ] **Wiederholungen und Wächter-Texte** (Beschreibung, Vorlagen, „When washing machine power is below 5 W …“) sind englisch und verständlich
- [ ] **Push auf Englisch** (Push in der Beta einschalten, Einstellungen › Beta): Eine fällige Karte kommt mit „Due: today 19:00 · Board“ und dem Knopf „Done“; die Tageszusammenfassung („Due today: 1 · Overdue: 0“), „Nudged“-Nachrichten („… nudges you“, Knöpfe „Done“, „On it“, „Later“) und die Antwort „… is on it 👍“
- [ ] **Deutsches Gerät in der Familie:** Wer nie Englisch hatte, bekommt weiter deutsche Push-Nachrichten. Ein Stups mit Vorlage kommt beim Empfänger in seiner Sprache an, auch wenn der Absender eine andere hat
- [ ] **Fehlermeldungen vom Server** (zum Beispiel eine zu lange Stups-Nachricht, ein leerer Titel über die Schnell-Eingabe) erscheinen in der Sprache der Oberfläche
- [ ] **Neues Board** auf einem englischen Gerät: Spalten „Open“, „Planned“, „In progress“, „Done“. Auf einem deutschen Gerät wie bisher „Offen“ … „Erledigt“
- [ ] Home Assistant: Einstellungen › Apps › Stups (Beta) › Konfiguration zeigt die Optionen auf Englisch, wenn Home Assistant auf Englisch steht
- [ ] Bleibt deutsch (bekannt): Namen der Sensoren, Protokollzeilen im Add-on-Log, die Zeile „Wartet auf die erste Person …“ in der Beschreibung einer Wächter-Karte

## 23 · Eigene Farbe und Plus-Knopf (seit 1.15.0)

Am iPhone, in der Beta zuerst.

- [ ] **Farbkreis:** Einstellungen › Sprache und Farbe zeigt einen Farbkreis mit dem Plus-Knopf als Vorschau in der Mitte. Antippen und Ziehen auf dem Ring ändert die Farbe sofort (Knöpfe, aktiver Reiter, Plus-Knopf, Schrift in Farbe), gespeichert wird beim Loslassen
- [ ] **Hell und Dunkel:** Gerät auf Hell und auf Dunkel stellen: die Farbe bleibt, wird aber passend hell oder dunkel. Bei hellem Grün oder Türkis ist die Schrift auf dem Knopf dunkel und gut lesbar, bei Rot, Orange, Blau und Violett weiß
- [ ] **Bleibt:** App schließen und neu öffnen, am zweiten Gerät derselben Person öffnen: die Farbe ist dieselbe, schon auf der Anmeldeseite (Standalone) ohne Aufblitzen in Orange
- [ ] **Je Person:** Eine zweite Person wählt eine andere Farbe; beide sehen ihre eigene
- [ ] **Zurück:** „Orange (Standard)“ stellt das bisherige Aussehen her, der Knopf ist ausgegraut, solange nichts gewählt ist
- [ ] **Dringlichkeit bleibt:** Die Balken links an den Karten (rot, orange, gelb) ändern ihre Farbe nicht mit
- [ ] **Plus-Knopf:** In „Erledigt“ oder „In Arbeit“ tippen: die neue Karte landet trotzdem in „Offen“. Mit einem Termin nach heute landet sie in „Geplant“, mit Termin heute oder ohne in „Offen“
- [ ] **Desktop:** Am Computer gibt es nur den einen Plus-Knopf unten rechts, keinen je Spalte

## 24 · Stups ins Haus (seit 1.16.0)

Nur am echten Haus: Home Assistant mit einem Lautsprecher (`media_player`), einem Sprachdienst (`tts`) und einer Lampe (`light`). Zuerst in der Beta (dort Push einschalten, Einstellungen › Beta), sonst bleibt es still.

- [ ] **Einrichten:** Einstellungen › Personen & Zugriff: Gruppe „Haus", Sprachdienst wählen. Bei einer Person „Kanal hinzufügen": Ansage mit deinem Lautsprecher, Lampe mit einer Lampe. Die Listen zeigen die Namen aus Home Assistant
- [ ] **Testen:** „Testen" an der Ansage: Der Lautsprecher sagt „Das ist ein Test von Stups." (englisch bei englischem Gerät). „Testen" an der Lampe: sie leuchtet fünf Sekunden und ist danach wieder so wie vorher (probiere es einmal mit eingeschalteter, einmal mit ausgeschalteter Lampe)
- [ ] **Stups ins Haus:** Eine Person ohne Handy (nur Haus-Kanal) lässt sich stupsen. Der Lautsprecher sagt „Ben, Anna stupst dich: …", die Lampe leuchtet in der Akzentfarbe der Person (Einstellungen › Farbe)
- [ ] **Lautstärke:** Mit eingestellter Lautstärke spricht der Lautsprecher in dieser Lautstärke und stellt danach die vorherige wieder her
- [ ] **Läuft Musik?** Notiere, was dein Lautsprecher macht (leiser, Pause, nichts). Das bestimmt der Player, Stups kann es nicht ändern
- [ ] **Ruhezeit:** In der Ruhezeit der Person sagt das Haus nichts an. Ein Stups kommt danach, eine Fälligkeits-Erinnerung entfällt
- [ ] **Nicht zu Hause, „verwerfen":** Die Person ist unterwegs: nichts wird angesagt, im Protokoll (Einstellungen › Benachrichtigungen) steht „Verworfen, nicht zu Hause"
- [ ] **Nicht zu Hause, „warten":** Der Stups wartet; kommt die Person heim (Zustand „home" in Home Assistant), wird er angesagt. Nach Ablauf der Frist nicht mehr
- [ ] **Erledigt in der Zwischenzeit:** Eine wartende Nachricht entfällt, wenn die Karte inzwischen erledigt ist
- [ ] **Nur Stupse, Fälligkeit nur wenn gewählt:** Ein neuer Kanal sagt nur Stupse an. Schaltest du „Fälligkeiten" ein, kommt auch die Erinnerung zur Fälligkeit
- [ ] **Beta und normale App:** Es wird nie doppelt angesagt. Die Beta bleibt still, solange Push dort aus ist
- [ ] **Neustart mitten im Leuchten:** Starte die App neu, während die Lampe leuchtet: sie ist danach wieder im alten Zustand, und es liegt keine Szene `scene.stups_haus_…` in Home Assistant herum
- [ ] **Mitglieder:** Wer kein Administrator ist, sieht den Haus-Block nicht

## 25 · Dokumentation und Auftritt (seit 1.15.0)

- [ ] **README auf GitHub** (englisch): Das Demo-GIF läuft, die Bilder sind englisch, die Knöpfe „Zu Home Assistant hinzufügen“ und die Beta-Adresse stimmen. Oben der Link zur deutschen Fassung; `README.de.md` zeigt deutsche Bilder
- [ ] **Home Assistant › Stups › Dokumentation** (englisch, mit Link zur deutschen Fassung) liest sich verständlich; die Menüwege in der Anleitung („Settings › People & Access“) gibt es genau so in der englischen Oberfläche
- [ ] **Ankündigungsentwürfe** in `docs/announcements/` gegenlesen (HA-Forum, Reddit, GitHub-Release, deutsches Forum): stimmen Versionsnummer und Links, ist die Aussage zur Lizenz so gewollt? Nichts wird von selbst veröffentlicht

## 26 · Fairness und Sonntags-Zusammenfassung (seit 1.17.0)

Am iPhone, in der Beta zuerst. Mindestens zwei Personen, ein paar erledigte Karten diese Woche.

- [ ] **Aufwand:** In einer Karte Chip „Aufwand“: Klein, Mittel, Groß, oder wieder „Nicht angegeben“. Wird sofort gespeichert
- [ ] **Diese Woche:** Aufgaben › „Fairness diese Woche“ (und „Bei den anderen“) öffnet die Fairness-Seite (Woche oder Monat)
- [ ] **Zahlen:** Diese Woche / Dieser Monat: Satz oben („… habt ihr N Aufgaben erledigt“), je Person „N erledigt“ und ein Balken. Eine große Karte erledigen: der Balken der Person wächst um 3, eine kleine um 1, ohne Angabe um 2
- [ ] **Keine Rangliste:** Keine Plätze, Medaillen, Pfeile; die Reihenfolge ist die der Personenliste, nicht nach Zahl; alle Balken gleiche Farbe. Bei null Karten steht „Das kommt noch.“
- [ ] **Sonntag:** Bei einer Person „Wöchentliche Zusammenfassung am Sonntag“ einschalten. Sonntagabend ab 18:00 kommt genau eine Nachricht, nicht in der Ruhezeit, nicht bei null erledigten Karten, nicht ins Haus. Ausgeschaltet kommt nichts

## 27 · Rolle Kind und Bestätigung (seit 1.17.0)

Am iPhone, in der Beta zuerst. Ein Kind braucht einen eigenen Home-Assistant-Benutzer (oder ein Konto im eigenen Container); dazu zwei Erwachsene, einer davon Administrator.

- [ ] **Einrichten:** Personen & Zugriff › Person › „Rolle Kind“: „Ist ein Kind“ einschalten, „Sieht“ wählen, „Erledigt braucht eine Bestätigung“, „Wer bestätigt“. Bei einem Administrator ist der Schalter aus und erklärt, warum
- [ ] **Reduzierte App:** Das Kind sieht keinen Plus-Knopf, kein Menü an der Karte, kein Wischen, kein Ziehen, keinen Reiter „Wächter“, keine Fairness, in den Einstellungen nur Sprache und Farbe (und „Abmelden“ im eigenen Container)
- [ ] **Sichtbarkeit:** „Nur Boards mit eigenen Karten“: im Board-Wechsler nur diese Boards, auch Agenda und Kalender zeigen nur deren Karten. Wird dem Kind eine Karte in einem neuen Board zugewiesen, erscheint das Board sofort
- [ ] **Eigene Karte:** Abhaken, Checklistenpunkt abhaken, kommentieren, Foto und Link anhängen funktionieren. In einer fremden Karte (bei „Alle Boards“) ist alles nur zum Ansehen
- [ ] **Bestätigung:** Das Kind hakt ab: Hinweis „Gemeldet: wartet auf Bestätigung“, die Karte bleibt offen mit dem Zeichen „Wartet auf Bestätigung“. Die gewählten Erwachsenen bekommen eine Push-Nachricht mit „Bestätigen“ und „Nochmal“
- [ ] **Bestätigen:** Tipp auf „Bestätigen“ (in der Nachricht oder in der Karte): erledigt, steht beim Kind in der Fairness-Ansicht der Erwachsenen, das Kind bekommt „Bestätigt von … ✓“. Bei einer Wiederholung entsteht die nächste Karte ohne Anfrage
- [ ] **Nochmal:** Das Kind bekommt „… : Nochmal, bitte“, und mit Haus-Kanal (Stufe 24) die Ansage, außer in der Ruhezeit. Die Karte ist wieder offen
- [ ] **Zwei Erwachsene:** Beide bekommen die Frage; wer zuerst antwortet, entscheidet, bei dem anderen verschwindet die Nachricht
- [ ] **Erinnerung:** Wird nicht geantwortet, kommt nach zwei Stunden eine Erinnerung, danach höchstens eine am Tag
- [ ] **Pro Karte:** Chip „Bestätigung“ (nur bei einem Kind unter den Zuständigen): „Immer bestätigen“ gilt auch ohne Vorgabe der Person, „Nie bestätigen“ lässt das Kind sofort erledigen
- [ ] **Der Server hält dicht:** Mit dem Kind-Benutzer in den Entwicklerwerkzeugen `/api/fairness` oder einen Löschaufruf versuchen: 403

## 28 · Board-Vorlagen (seit 1.17.0)

- [ ] **Aus Vorlage:** Board-Wechsler › Vorlage „Haushalt“: Vorschau mit Spalten, Kategorien, Karten; anlegen. Termine liegen ab heute, Karten mit Termin nach heute in „Geplant“. Auf englischem Gerät kommt alles englisch
- [ ] **Jede Vorlage:** Haushalt, Umzug, Renovierung, Urlaub packen, Baby kommt, Ideen und Unternehmungen anlegen und ansehen: sinnvoll und vollständig
- [ ] **Eigene Vorlage:** Board-Einstellungen › Vorlagen: Name eingeben, speichern. Daraus ein neues Board: gleiche Spalten, Kategorien und offene Karten, ohne Zuweisungen, Anhänge, Kommentare. Löschen mit Rückfrage

## 29 · Heute, Zuhause, Wächter aus Vorlagen, Einstellungen (seit 1.18.0)

**Kopfzeile und Leiste**

- [ ] Auf allen Reitern steht rechts der Home-Knopf (nur im Add-on, links von der Glocke) und führt zu deinem Dashboard; rechts Offline-Hinweis (Flugmodus) und dein Avatar mit Bild oder Initiale. Nichts ragt seitlich heraus, auch nicht mit langem Board-Namen
- [ ] Die App startet auf **Aufgaben**. Ein Kind und der Container ohne Home Assistant haben nur zwei Reiter
- [ ] Türkis erscheint nur bei dem, was vom Haus kommt (Wächter-Karten, Zuhause); der Farbkreis hat kein Grün und Türkis. Überschriften der Reiter in der eigenen Schrift

**Heute**

- [ ] „Für dich": deine offenen Karten bis morgen (überfällig und heute zuerst); die Uhrzeit ist rot, wenn überfällig. „Bei den anderen" führt zu „Diese Woche"
- [ ] „Vom Haus": eine echte Wächter-Karte erscheint mit „Waschmaschine fertig · vor … Min.", dem Grund („reihum unter allen, die zu Hause sind") und den Knöpfen **Erledigt** und **Weitergeben**. Weitergeben schickt die Karte an die nächste anwesende Person (mit Push), sie zählt nicht als erledigt. Ist niemand sonst zu Hause: „Gerade ist niemand sonst dran"
- [ ] Kind: sieht nur eigene Karten, kein „Bei den anderen", kein „Weitergeben"

**Zuhause**

- [ ] Während die Waschmaschine läuft, steht sie unter „Läuft gerade" (mit Dauer), danach „Wartet auf jemanden" (Person, Alter, **Stupsen**), nach dem Erledigen unter „Ruhig". Zähler-Wächter (Saugroboter) stehen mit „2 von 3" unter „Bald dran"
- [ ] Home Assistant ausschalten oder trennen: „Keine Verbindung zu Home Assistant seit …", Boards und Heute gehen weiter
- [ ] Administratoren sehen „Stups hat N weitere Geräte gefunden"

**Gefunden und Wächter (der Satz ist seit 1.22.0 die Zusammenfassung, siehe Abschnitt 33)**

- [ ] Einstellungen › Haushalt › Wächter › „Wächter aus Vorlagen": Treffer zu deinen echten Geräten mit Begründung; schon beobachtete fehlen. „Auch ohne Gerät" legt eine wiederkehrende Karte an. „Alle Vorlagen ansehen"
- [ ] **Ausblenden:** bei einem Treffer, den du nicht brauchst, „Ausblenden" tippen: er verschwindet und kommt auch nach dem Neuladen und nach einem Neustart der App nicht wieder; die anderen Treffer bleiben, der nächste ähnliche rückt nach. Unter „Ausgeblendet (n)" steht er mit „Wieder anzeigen"; danach ist er wieder in der Liste
- [ ] „Einrichten" öffnet den Assistenten mit der Entität aus dem Treffer und den Werten der Vorlage (Wenn, Dann, Wer, Feinschliff; der Satz steht in Schritt 4 als Zusammenfassung). Alles bleibt änderbar: Board, Spalte, Fälligkeit, Zähler, Sperrzeit, Erledigt-Bedingung. Bei Vorlagen mit Leistungssensor ist „Erledigt sich selbst" aus, mit Begründung
- [ ] **Probelauf** (im Assistenten der Knopf „Testen“ in Schritt 4, im Ablauf der Abschnitt „Probelauf“) mit einem echten Gerät: Diagramm und Satz („3 Auslösungen erkannt, kein Fehlalarm"); bei einem wackelnden Sensor der Hinweis „Mindestdauer erhöhen?"; bei einer neuen Entität ein Hinweis statt Diagramm
- [ ] Bei Vorlagen mit Leistungssensor ist „Automatisch erledigen" aus, mit Begründung
- [ ] **Erst vorschlagen:** Alle Anwesenden bekommen „Wer übernimmt?" mit Knopf; wer zuerst tippt, bekommt die Karte, der Zweite erfährt, wer schneller war. Nach 30 Minuten ohne Antwort greift der Rückfall
- [ ] **Tonnen rausstellen** (Abfallkalender, Vorlauf 12 Stunden) legt am Vorabend eine Karte an, genau eine je Termin; **Wäsche rein, es regnet** reagiert auf Regen in der Vorhersage (Abfrage alle 30 Minuten)

**Zuhause bearbeiten und lesen (seit 1.18.1)**

- [ ] Die App öffnet immer auf **Aufgaben**, auch wenn du zuletzt auf Wächter warst. Nur Boards wird gemerkt
- [ ] Als Administrator: Tipp auf einen Wächter unter Zuhause öffnet das Bearbeiten als Ablauf (vier Karten, Feinschliff, Speichern, Testen, Pausieren, Löschen) mit dem Status seiner Läufe; unten auf Zuhause steht die letzte Aktivität
- [ ] Als Mitglied (kein Administrator): derselbe Tipp zeigt den Wächter lesend (Hinweis oben, kein „Ändern“, kein Speichern, Testen, Löschen), der Verlauf der Entität und der Status sind lesbar

**Einstellungen**

- [ ] Gruppen und Seiten: Administrator sieht „Für mich", „Haushalt", „Home Assistant", „Hilfe und Daten"; ein Mitglied nur „Für mich" und „Hilfe und Daten"; ein Kind nur „Sprache und Farbe". Die Wahl „HA-Kopfzeile ausblenden" gibt es für Mitglieder unter „Sprache und Farbe", für Administratoren unter „Dashboard und Kopfzeile"
- [ ] Nichts fehlt gegenüber früher: Sprache, Farbe, Standard-Uhrzeit, Dashboard samt eigenem Pfad, Bubble-Card-YAML kopieren, Test-Nachricht, Ruhezeit, Sonntagsrückblick, Stand der Zustellung, Papierkorb, Archiv, Umzug, Board-Vorlagen, Beta, Diagnose-Seite, im Container Passwort, Passkeys und Abmelden
- [ ] **Bild:** „Bild ändern" lädt ein eigenes Bild hoch, es erscheint im Avatar und bei den Karten; „Bild entfernen" geht zurück zum Bild aus Home Assistant (oder zur Initiale). Ein Administrator ändert Bilder auch für andere und für Kinder
- [ ] **Wenig Zeit:** Datum eintragen; die Rotationen der Wächter überspringen die Person, auf „Diese Woche" steht der Hinweis. „Wieder normal" nimmt es zurück

## 30 · Neues Design, Phase 2: drei Reiter (seit 1.20.0)

> Anordnung, Kopf, Umschalter und Menüs sind seit 1.20.1 nach den Entwürfen nachgebessert: **gilt jetzt Abschnitt 31**; hier bleibt, was unverändert gilt (Reiter, Gruppen, Kind, Fairness).

**Reiter und Aufgaben**

- [ ] Leiste unten: **Aufgaben, Boards, Wächter**. Ein Kind und der Container ohne Home Assistant sehen nur Aufgaben und Boards. Ein früher gemerkter Reiter (Heute, Kalender, Zuhause) öffnet ohne Fehler Aufgaben
- [ ] Aufgaben, Kopf: „stups.“ und Avatar, darunter der Umschalter **Liste · Tag · Woche · Monat** (Standard Liste; eine früher gewählte Kalenderansicht bleibt)
- [ ] Liste von oben: „Vom Haus“ (türkis, mit Wort und Auge; nur Erwachsene), Zahlenleiste (heute fällig, überfällig, heute erledigt; nur deine eigenen), Wochenleiste mit Punkten (Tipp auf einen Tag öffnet die Tagesansicht, das Kalender-Symbol die Woche), Banner „Conny stupst dich! 👋“ (nur bei einem offenen Stups an dich), Chips **Meine · Alle · Personen · Niemand · Filter**
- [ ] Gruppen **Überfällig, Heute, Diese Woche, Später** (einklappbar, mit Zahl); zu den Karten gehören Erledigt-Kreis, Kachel, Titel einzeilig, Termin, Board und Personen. Eine Karte erledigen oder öffnen geht auch aus einem fremden Board
- [ ] Am Ende „Fairness diese Woche“ (öffnet die Fairness-Seite, keine Rangliste) und „Bei den anderen“
- [ ] Kind: keine Chips, kein „Vom Haus“, nur eigene Karten, kein „Bei den anderen“, keine Fairness

**Boards, Wächter, Karte**

- [ ] Boards: Leiste mit Board-Name (öffnet die Boards), Lupe, Chips (Alle, Nur meine, Gestupst, Kategorien), Spalten als Umschalter; die Karten sind 68 px hohe Zeilen. Wischen (Finger) und Ziehen (Maus, ab 1024 px) gehen wie vorher
- [ ] Wächter (vormals Zuhause): Wartet auf jemanden (mit **Stupsen**), Läuft gerade, Kommt bald (mit Zähler), Ruhig, Letzte Aktivität; kleiner Roboter oben; ohne Wächter ein Leerzustand mit Roboter. Administratoren: Banner „weitere Geräte gefunden“, Knopf „+“ (neuer Wächter) und „Alle Wächter verwalten“
- [ ] Karte: Kachel und Titel oben, Eigenschaften als Chips, Banner „Conny stupsen“, Beschreibung, Checkliste, Links, Anhänge, Kommentare, Verlauf. Kind: nur ansehen, abhaken, kommentieren
- [ ] Karten-Menü (… an der Karte): Verschieben nach als Chips, Erledigt, Stupsen, Duplizieren, Details öffnen, Löschen („30 Tage im Papierkorb“)
- [ ] Stupsen: An wen (mit Hinweisen wie „wieder ab 14:30“), Nachricht, eigener Text, **Vorschau der Push-Nachricht**, Hinweis zur Ruhezeit, großer Knopf „Stups senden“
- [ ] Englisch: Tasks, Boards, Watchers; Umschalter List, Day, Week, Month; nichts läuft über den Rand
- [ ] Hell und Dunkel: Kacheln, Chips, Banner und Zeilen gut lesbar

## 31 · Neues Design, Phase 2 (Nachbesserung nach den Entwürfen, seit 1.20.1)

**Kopf auf allen drei Reitern**

- [ ] Aufgaben, Boards, Wächter: oben Logo, „stups.“, **Glocke**, **Zahnrad**, Profilbild; darunter Titel und Untertitel („Deine Aufgaben, Termine und To-dos an einem Ort.“, „Organisiere deine Aufgaben in Kanban-Boards.“, „Automatische Aufgaben aus Home Assistant.“). Kein „‹ Dashboard“ mehr
- [ ] Zahnrad und Profilbild öffnen die Einstellungen (oben das Profil), die Glocke die Mitteilungen
- [ ] Glocke: **ohne Ungelesenes kein Punkt** und im Blatt ein ruhiger Satz; mit einem neuen Stups an dich (auch von einem zweiten Gerät aus, ohne Neuladen) erscheint der Punkt auf jedem Reiter, das Blatt zeigt „… stupst dich! 👋“ mit der Karte, ein Tipp öffnet sie. Weitere Einträge: Bestätigungen (nur, wenn du sie geben darfst) und Karten von Wächtern. Kind: nur Stupse an das Kind
- [ ] Einstellungen › Home Assistant (im Add-on für jede Rolle, auch Kind): **„Dashboard“** (Ziel des Home-Knopfs, jede Person für sich), **„HA-Kopfzeile ausblenden“** schaltet die Kopfzeile von Home Assistant aus und ein. Im Container ohne Home Assistant gibt es beides nicht

**Aufgaben (von oben nach unten wie im Entwurf)**

- [ ] Kopf, Zahlenleiste (Symbole und Zahlen farbig, Bezeichnungen einzeilig), „Diese Woche“ mit „Monatsansicht“ und „Jan 2025 ⌄“, Wochenleiste mit sieben Tagen und Kalender-Knopf, Stups-Banner (nur bei offenem Stups an dich; bei mehreren der neueste, ein Tipp öffnet die Mitteilungen), Chips Meine · Alle · Person · Filter, Gruppen Überfällig, Heute, Diese Woche, Später
- [ ] Zeile: Erledigt-Kreis, Kachel, Titel einzeilig, „Datum • Person • Checkliste • Link“, Bild der Person, **Mehr-Knopf „…“** (öffnet das Karten-Menü auch für Karten aus einem anderen Board). „Vom Haus“ vor Überfällig (nur mit Karten), Fairness und „Bei den anderen“ am Ende
- [ ] Kein Umschalter Liste/Tag/Woche/Monat. „Monatsansicht“, der Monat und der Kalender-Knopf öffnen den **Kalender** (Seite mit „‹ Aufgaben“, Tag · Woche · Monat, freie Zeit antippen legt eine Karte an); „‹ Aufgaben“ führt zurück; der Filter-Knopf steht auch dort
- [ ] Filter-Knopf: Blatt mit Wer (Ich, Personen, Niemand), Boards, „Erledigte anzeigen“, „Zurücksetzen“, großer Knopf mit der Trefferzahl; die Wahl bleibt auf dem Gerät
- [ ] Kind: keine Chips, keine Glocke-Einträge außer Stupsen an das Kind, nur eigene Karten

**Boards, Wächter, Karte, Menü, Stupsen**

- [ ] Boards: Board-Leiste, Chips Meine · Alle · Person · Filter, Kategorien-Chips (Alle mit Umriss), Spalten gleich breit, Zeilen mit „Hoch • Person • Checkliste • Link“; Filter-Knopf: Suche, „Nur mit offenem Stups“, Kosten im Board. Die ganze Seite scrollt, unter dem Plus-Knopf lässt sich die letzte Karte erreichen
- [ ] Wächter: Karte „Deine Wächter“ mit Roboter, Banner „weitere Geräte gefunden“ (Administratoren), Wartet auf jemanden (Stupsen, „offen seit 12 Min.“), Läuft gerade, Kommt bald (Zähler mit drei Balken), alle übrigen Wächter nach Kategorie darunter (kein Zuklapper „ohne offene Aktion“ mehr)
- [ ] Wächter-Ansicht (Beta 1.35): Jeder Wächter steht genau einmal da, mit **Schalter aktiv/aus** (ausgeschaltet: blasser, „Aus“, löst nichts aus; ohne Recht „Wächter“ sichtbar, aber gesperrt). **Kategorien** lassen sich zu- und aufklappen (der Zustand bleibt auf dem Gerät), „Ohne Kategorie“ steht unten, „Kategorien vorschlagen“ fragt nach und meldet eine Zahl. Beim Anlegen ist die Kategorie vorbelegt, „Neue Kategorie …“ legt eine eigene an, im Editor steht der Chip „Kategorie: …“. Desktop: Tabelle mit Spaltenkopf (bei schmalem Fenster weniger Spalten), die ganze Zeile öffnet den Wächter, die Suche klappt Treffer-Gruppen auf
- [ ] Neuer Wächter am Desktop (Beta 1.36, ab 1024 px): Leiste über der Liste mit „Gefunden“ und „+ Neuer Wächter“; der Knopf klappt ein Formular über der Liste auf (Wenn, Dann, Wer, Vorschau rechts, bei schmalem Fenster darunter), derselbe Knopf, X und Escape klappen zu (mit Eingaben erst die Frage „Entwurf verwerfen?“). Vorschläge als Chips und „+N“, Kategorie vorgeschlagen, Rückfrage „Karte jetzt erstellen?“ nach dem Speichern, danach steht die Zeile hervorgehoben in ihrer Kategorie. Das Handy zeigt weiter den Assistenten
- [ ] Karte: Erledigt links, „Gespeichert“ in der Mitte, Fertig rechts; Kachel 52 px und Titel 24 px; Chips (Status, Person mit Bild, Termin, Priorität, Kategorie, Kosten, gestrichelt Wiederholen und Erinnerung); Beschreibung als Feld; Checkliste mit eigenen Kästchen und „Punkt hinzufügen“; Links und Anhänge (Kacheln 96 px, „Hinzufügen“); Kommentare mit rundem Senden-Knopf; Verlauf mit Punkten
- [ ] Karten-Menü: Aktionsblatt von unten, Karte oben, „Verschieben nach“ in 2 × 2 Feldern (aktuelle Spalte mit Haken und orangem Rand, „Erledigt“ erledigt die Karte), Öffnen, Stupsen, Duplizieren, Löschen
- [ ] Stupsen: Karte, An wen? (Chips mit Bild, nicht wählbare ausgegraut mit Hinweis darunter), Nachricht als Liste mit Auswahlkreis, eigener Text, So kommt es an (App-Symbol), Ruhezeit-Hinweis, großer Knopf unten fest
- [ ] Sheets: Radius 26, Griff, Kopf links · Mitte · rechts, so hoch wie der Bildschirm minus 54 px (Karten-Menü nur so hoch wie der Inhalt)
- [ ] Hell, Dunkel und Englisch: nichts läuft über den Rand, die Texte stehen übersetzt da

## 32 · Neues Design, Phase 3 (Symbol pro Karte, Neue Aufgabe, Termin-Sheet, seit 1.21.0)

**Start**

- [ ] Die App startet **immer auf „Aufgaben“**, auch nach dem Neuladen und wenn du vorher auf Boards oder Wächter warst. Ein Link auf eine Karte öffnet sie wie bisher

**Neue Aufgabe** (das „+“ auf Boards)

- [ ] Oben links „Abbrechen“, Titel „Neue Aufgabe“, unten der große Knopf „Aufgabe anlegen“ (grau, solange kein Titel dasteht)
- [ ] Feld „Was steht an?“: „Müll rausbringen morgen 19 Uhr @Ben #Haushalt jede Woche“ ergibt Chips für Datum, Uhrzeit, Person, Kategorie, Wiederholung; ein Tipp auf einen Chip nimmt ihn zurück (der Text bleibt). Darüber die **Kachel mit dem erkannten Symbol und dem Funken-Abzeichen**, daneben der Chip „Symbol: Mülleimer“ mit ✕ (entfernt das Symbol, die Karte bekommt dann das Standardsymbol „Aufgabe“)
- [ ] Zeilen unter „Wann und wo“: Board • Spalte (Auswahl), **Termin** (öffnet das Termin-Fenster), Wiederholung (nur mit Termin), „Erinnern 30 Min. vorher“ mit Schalter (nur mit Termin; an: Erinnerung 30 Minuten vorher und Nachhaken, wenn überfällig). Ein Termin nach heute schickt die Karte von selbst nach „Geplant“, „Kein Termin“ oder heute zurück nach „Offen“
- [ ] „Wer kümmert sich?“: Chips mit Bild, mehrere wählbar; „Ich“ ist vorgewählt. „Wer zuerst heimkommt“ gibt es hier nicht (nur bei Wächtern). Priorität: Niedrig · Mittel · Hoch, ein zweiter Tipp nimmt sie zurück
- [ ] Kategorie: Chips mit Punkt; „Neue Kategorie“ klappt Name, Farbpunkte und „Anlegen“ auf; ein vorhandener Name wird wiederverwendet; die neue Kategorie ist gleich gewählt
- [ ] „Notiz“ ist ein eigenes Feld (wird die Beschreibung der Karte). Unter „Mehr“: **Checkliste** und **Foto / Link** (klappen die Felder auf). Kosten und Aufwand gibt es erst an der Karte

**Symbol wählen** (Tipp auf die Kachel)

- [ ] Vorschau mit Namen und „Automatisch erkannt aus …“ bzw. „Von dir gewählt“; Suche („Wäsche“ findet die Waschmaschine, auch ohne Umlaute und mit einem Tippfehler); „Nichts gefunden“ mit Hinweis; Farbe „Auto“ oder fest (sieben Farben)
- [ ] „Passt zu …“ (Vorschläge zum Titel), „Zuletzt benutzt“ (merkt sich dieses Gerät), sechs Bereiche mit Zähler; Pfeiltasten wandern durchs Raster; „Symbol übernehmen“ übernimmt, „Zurück“ lässt alles, wie es war
- [ ] An einer bestehenden Karte: Tipp auf die Kachel im Karten-Fenster öffnet dasselbe Fenster; ein **erkanntes** Symbol (Funken) folgt dem Titel, wenn er sich ändert, ein **gewähltes** nie
- [ ] Karten in Aufgaben, Boards, Karten-Menü und Stupsen zeigen ihr Symbol und ihre Farbe; ohne Symbol steht der orange Haken. Kind: sieht die Symbole, ändern kann es sie nicht

**Termin-Fenster**

- [ ] Oben der gewählte Termin („Morgen, 19:00“, darunter das ganze Datum); Monatskalender mit Pfeilen für den Monat, heute mit Rand, der gewählte Tag orange; Pfeiltasten wechseln den Tag, Bild auf/ab den Monat
- [ ] Uhrzeit: zwei Listen (Stunde, Minute in Fünferschritten), mit Ziehen, Mausrad, Pfeiltasten und Ziffern bedienbar; „Übernehmen“, „Kein Termin“ (unten); „Abbrechen“ lässt alles, wie es war
- [ ] Rund um Mitternacht: um 23:59 ist „morgen“ der nächste Tag, eine Minute später „heute“ (Zeitzone des Geräts)

**Einstellungen › Symbole** (nur Administratoren)

- [ ] „Symbole aus Titeln erkennen“: Rückfrage („N Karten haben noch kein Symbol …“), danach das Ergebnis als Zahl („N Karten haben jetzt ein Symbol. Zu M Karten passte keins.“); Karten mit Symbol bleiben, nichts läuft von allein, ein zweiter Lauf sagt „Alle Karten haben schon ein Symbol“, soweit etwas passt. Mitglieder und Kinder sehen die Seite nicht
- [ ] Datenbank: Migration 22 (vorher legt die App eine Sicherung unter `/data/backups` an); vorhandene Karten bleiben ohne Symbol
- [ ] Englisch, Hell, Dunkel: nichts läuft über den Rand, Namen der Symbole stehen auf Englisch da

## 33 · Neues Design, Phase 4 (Wächter-Editor, seit 1.22.0)

**Neuer Wächter** (Reiter Wächter › „+“, oder Einstellungen › Wächter, oder „Einrichten“ bei Gefunden)

- [ ] Oben „Schließen“ und „Neuer Wächter“, darunter vier Balken „1 · Wenn“ bis „4 · Feinschliff“ (der aktuelle halb gefüllt, frühere orange und antippbar), unten „Zurück“ und der große Knopf „Weiter: …“
- [ ] **Schritt 1:** Mit einer Vorlage oder „Entität wählen“ (Suche) erscheint die Karte mit **Verlauf der letzten 3 Stunden**: orange Linie, grün gestrichelte **Schwelle**, grüner Punkt **dort, wo der Wächter ausgelöst hätte**, darunter „heute 10:58 ausgelöst“ (Uhrzeit deiner Zeitzone). „unter / über / Zustand“, Regler **und** Zahlenfeld für die Schwelle (die grüne Linie wandert mit), Dauer als Chips; der Satz darunter nennt, wie oft er in den 3 Stunden ausgelöst hätte
- [ ] Ohne Verlauf (neue Entität, Recorder aus, keine Verbindung) steht an der Stelle des Diagramms ein Hinweis; der Assistent lässt sich trotzdem weiterbedienen. Ohne Schwellwert meldet „Weiter“, was fehlt, und bleibt im Schritt
- [ ] **Schritt 2:** Titel der Karte mit Symbol (Funken: automatisch; Tipp wählt ein eigenes), Board und Spalte, Fälligkeit als Chips (sofort, in 30 Min., in 1 Std., heute Abend, ohne Termin, „Anders …“), Priorität, Kategorien, Beschreibung, darunter „So erscheint sie“
- [ ] **Schritt 3:** sieben Arten, **vorausgewählt „Abwechselnd, egal wer da ist“ (reihum)** (bei einer Vorlage deren Art), Hinweis „Fair heißt hier reihum, nicht nach Aufwand gewichtet“. „Reihenfolge“ zeigt Fotos oder Initialen, wer als **Nächstes dran** ist (oranger Ring), wer **unterwegs** ist (blass, „… unterwegs“) und „gerade zu Hause: N“; die Rotation rückt dabei nicht weiter. Rückfall („Ist niemand zu Hause …“) je nach Art
- [ ] **Schritt 4:** Extras (erledigt sich selbst, stupsen, erst beim N-ten Mal, Sperrzeit, keine zweite Karte, Name), Zusammenfassung als Satz; „Testen“ rechnet den Probelauf über 7 Tage, „Wächter anlegen“ speichert. Ein Wächter, in dem nichts geändert wurde, steht danach mit „reihum“ in der Liste

**Nachtrag 1.23.0 (Wächter-Editor)**

- [ ] Schritt „Wenn“ nach der Entitätswahl: die Entität steht als Zeile mit „Ändern“ rechts (kein Text „Andere Entität wählen“); „Ändern“ öffnet die Suche wieder. Im Ablauf steht dieselbe Zeile oben in der Karte WENN
- [ ] Bedingungen überall „unter, über, Zustand“ (Wenn und Erledigt sich selbst); lange Texte brechen um, nichts endet mit „…“

**Bearbeiten als Ablauf** (Tipp auf einen Wächter)

- [ ] Oben der Satz als Zusammenfassung, darunter die Karten **WENN → DANN KARTE → AN WEN → ERLEDIGT SICH SELBST**, verbunden mit Pfeilen; WENN mit „jetzt 412 W“ und kleinem Verlauf samt Schwelle und Auslösepunkt, AN WEN mit der Reihenfolge
- [ ] „Ändern“ klappt die Einstellungen der Karte auf (dieselben wie im Assistenten), „Fertig“ klappt sie zu; „Speichern“ oben und unten, „Testen“ legt eine Testkarte an
- [ ] **Feinschliff** als Chips (Name, Sperrzeit, keine zweite Karte, Stupsen nach …, erst beim N-ten Mal) öffnen ein kleines Feld; darunter Probelauf, Status (Zähler zurücksetzen, Verbindung, Läufe), Pausieren, Wächter löschen
- [ ] **Mitglied:** dieselbe Seite, aber ohne „Ändern“, Speichern und Testen; Verlauf der Entität und Status sind lesbar. **Kind:** kein Reiter Wächter
- [ ] Hell, Dunkel, Englisch: nichts läuft über den Rand; die Titel der Schritte und Schilder (WHEN, THEN, TO WHOM, COMPLETES ITSELF) stehen auf Englisch da
- [ ] Datenbank: keine Änderung

## 34 · Neues Design, Phase 5 (restliche Screens, seit 1.23.0)

**Kalender** (Aufgaben › Kalender-Knopf)

- [ ] Woche und Tag: Termine als farbige Kacheln im Raster (44 px je Stunde), die orange Jetzt-Linie über allen Tagen, der gewählte Tag oben mit Verlauf. Auf eine freie Stelle tippen: Fenster „Neue Karte“ mit genau dieser Zeit, die Stelle ist gestrichelt markiert. Karte antippen öffnet sie
- [ ] Monat: Punkte unter den Tagen, heute mit Verlauf, der gewählte Tag mit orangem Rand; ein Tipp zeigt unten „Freitag, 31. Januar“ mit den Karten (abhaken, Menü). „Tagesansicht öffnen“ wechselt zur Tagesansicht. Das gilt auch für ein Kind (nur eigene Karten, kein Anlegen)

**Boards verwalten**

- [ ] Board wechseln: Kacheln mit Symbol und Farbe, das offene mit orangem Rand und Haken; „Bearbeiten“ oben rechts, „Neues Board“ mit Vorlagen als Kacheln (Leer, Haushalt, Umzug …, eigene Vorlagen) und dem Namensfeld, großer Knopf „Board anlegen“. Ein Kind sieht nur seine Boards und „Einstellungen“
- [ ] Board-Einstellungen: Name, „Erledigte archivieren nach … Tagen“, Spalten (Pfeile, „⋯“ mit Erledigt-Spalte, Geplant, Löschen), Kategorien als Chips (antippen: Name, Farbe, Löschen; „Neu“), Archiv und Papierkorb mit Zahl, „Board löschen“ mit Rückfrage
- [ ] Archiv: Suche, Gruppen „Diese Woche“ und je Monat, „Zurück“ holt die Karte in die erste offene Spalte. Papierkorb: 30 Tage Bedenkzeit, „noch n Tage“ (rot ab 3), Wiederherstellen

**Einstellungen**

- [ ] Zeilen mit Kachel, Titel, Erklärung und Pfeil in Gruppen; **keine Zeile „Wächter“** (die Verwaltung steht im Reiter Wächter unter „Alle Wächter verwalten“, „Zurück“ führt dorthin zurück)
- [ ] Zeile **Tageszusammenfassung** (Administrator mit Push) zeigt die Uhrzeit, die Seite ändert sie und „Zurücksetzen“ stellt die Option der App wieder her. Die Zusammenfassung kommt zur neuen Uhrzeit
- [ ] Home Assistant: „Dashboard“, „HA-Kopfzeile ausblenden“ als Schalter, „Dashboard-Button“ mit Vorschau („n heute fällig • m überfällig“), YAML (Beta: `sensor.stups_beta_heute_faellig`) und „YAML kopieren“
- [ ] Daten: Papierkorb, Archiv, Umzug („Export“ nach /share/stups-umzug)
- [ ] **Personen & Zugriff:** Zugriff als Umschalter, Personen mit Foto, Admin-Abzeichen, Geräten, Ruhezeit; Antippen klappt Name, Geräte (Schalter), Ruhezeit, Zusammenfassung, Haus, Rolle Kind (Schalter) auf. „Wartet auf Freigabe“ (gestrichelt) mit „Freigeben“, „Person hinzufügen“
- [ ] **Warum kommt nichts an?** öffnet gleich mit dem Stand: Verbindung, pro Person „x / y“ (grün, orange „Ruhe“, rot bei 0), Banner mit der Lösung bei einer Person ohne erreichbares Gerät, „Zuletzt gesendet“ mit Zeit und Ergebnis, darunter die Einzelheiten. Kind: Seite nicht erreichbar
- [ ] Alle früheren Auswahlfelder sind Schalter (Wächter aktiv, Beta-Wächter, Täglich nachhaken, Geräte, Ruhezeit, Zusammenfassung, Haus-Kanäle, Kind, Bestätigung, Administrator); nur die Übernahme-Liste der Wiederholung bleibt ein Kontrollkästchen

**Docker, Dialoge, Foto**

- [ ] Anmelden: Logo, „stups.“, Passkey-Knopf, „oder mit Passwort“, Felder, Hinweis; Einrichtung mit Code. Konto: Passkeys als Zeilen („Passkey hinzufügen“ gestrichelt), Passwort ändern über „Ändern“, „Auf diesem Gerät abmelden“
- [ ] Kein Zugriff: Schloss, „Noch kein Zugriff“, „Hallo Name! …“, „Erneut prüfen“, im Add-on „Zurück zum Dashboard“
- [ ] Bestätigen-Dialog (rote Kachel, Abbrechen und Löschen) und Hinweise unten über der Leiste (mit „Öffnen“ bei Karte angelegt). Foto-Ansicht: runder Schließen-Knopf, „1 von 2“, Name und Größe, Punkte, „Sichern“, „Original“, „Entfernen“ (mit Rückfrage, nicht für Kinder)
- [ ] Fairness „Diese Woche“: Umschalter Woche und Monat, Zeilen mit Foto und Balken, keine Rangliste
- [ ] Hell, Dunkel, Englisch: nichts läuft über den Rand; Datenbank: keine Änderung

## 35 · Neues Design, Phase 6a (Filter, seit 1.24.0)

- [ ] Aufgaben: der Knopf „Filter“ neben den Chips öffnet das Blatt (Wer, Wann, Boards, Priorität, Außerdem, Sortieren nach; unten „N Aufgaben anzeigen“, bei einer Aufgabe „1 Aufgabe“); bei gesetztem Filter hat der Knopf einen orangen Umriss und einen Zähler
- [ ] Jede Person-Chip zeigt ihr eigenes Bild (Foto oder farbige Initiale), nur „Alle“ das Personen-Symbol: in Aufgaben, im Filterblatt und in Boards
- [ ] Wann: Überfällig, Heute, Diese Woche, Später, Ohne Termin, auch mehrere zusammen; die Zahlen an den Chips ändern sich mit der übrigen Auswahl, Nullen stehen nicht da; „Ohne Termin“ zeigt Karten ohne Termin in einer eigenen Gruppe
- [ ] Priorität Hoch, Mittel, Niedrig, Alle; „Nur mit offenem Stups“ (an dich), „Nur von Wächtern“, „Erledigte anzeigen“; Sortieren nach Fälligkeit, Priorität (hoch zuerst), Neueste – innerhalb der Gruppen
- [ ] Die Trefferzahl im großen Knopf stimmt mit den Karten in der Liste überein; „Zurücksetzen“ stellt alles auf Anfang
- [ ] Dasselbe Filtermodell im Kalender (Tag, Woche, Monat): der Filter-Knopf dort zeigt denselben Zähler
- [ ] Nach dem Schließen der App und erneutem Öffnen steht die Auswahl noch so (pro Gerät); ein anderes Gerät hat seine eigene
- [ ] Kind: der Filter hat kein „Wer“, kein „Nur von Wächtern“, keinen Stups-Schalter; „Ohne Termin“ zeigt nur die eigenen Karten
- [ ] Boards: Chips Meine, Alle, Personen, Kategorien und die Suche im Filterblatt des Boards funktionieren wie bisher
- [ ] Hell, Dunkel, Englisch: nichts läuft über den Rand; Datenbank: keine Änderung

## 36 · Neues Design, Phase 6b (Mitteilungen, Home-Knopf, Dashboard, seit 1.25.0)

- [ ] **Home-Knopf** (Haus) steht links neben der Glocke auf Aufgaben, Boards und Wächter und führt dich zu **deinem** Dashboard in Home Assistant; im Docker-Betrieb ohne Home Assistant fehlt er
- [ ] Einstellungen › Home Assistant › **Dashboard**: ohne eigene Wahl ist dein Standard-Dashboard aus Home Assistant vorausgewählt („Standard (Home Assistant: …)“); die Liste zeigt Standard, Übersicht und deine Dashboards; „Eigener Pfad …“ nimmt nur Pfade mit „/“ am Anfang. Die Wahl bleibt nach dem Neuladen und gilt auf deinem anderen Gerät; eine andere Person hat ihre eigene Wahl. Kind: keine Auswahl, der Knopf führt zum Standard
- [ ] **Mitteilungen:** Stups von Anna an Ben: bei Ben Punkt an der Glocke und „Anna stupst dich 👋“ unter Heute mit orangem Rand; Ben antwortet „Mach ich“: bei Anna „Ben: Mach ich 👍“
- [ ] Wächter-Karte für dich, Erledigung und Kommentar einer anderen Person auf deiner Karte, Überfälliges (Push „überfällig“ bekommen) erscheinen; Tipp öffnet die Karte
- [ ] Chips Stupse, Wächter, Erledigt, Kommentare filtern; „**Alle gelesen**“ löscht den Punkt (auch auf dem anderen Gerät, nach dem Neuladen noch gelesen)
- [ ] Gestern und Älter sind eigene Gruppen mit Uhrzeit bzw. Datum; Einträge älter als 14 Tage fehlen
- [ ] Kind: sieht nur Stupse an sich und Einträge zu seinen Karten, nichts von fremden Boards
- [ ] Update: nach dem Aktualisieren ist die Glocke ohne Punkt (alles Frühere gilt als gelesen); Datenbank wurde gesichert (Migration 23)

## 37 · Feedback (seit 1.28.0)

- [ ] **Einstieg:** Einstellungen ganz oben „Feedback & Ideen“ und am Ende von Aufgaben der leise Textknopf „Fehler oder Idee? Sag es uns“; ein Kind sieht beides nicht
- [ ] Fenster „Feedback“: erst die Art wählen (Fehler melden, Verbesserung oder Wunsch, Lob, Kritik, Sonstiges), dann Text mit Zähler „123 / 1000“ (gelb ab 900, rot bei 1000, mehr lässt sich nicht tippen) und ein Platzhalter passend zur Art; Senden bleibt grau, bis Text da ist
- [ ] **Bild** anhängen (Foto aufnehmen oder auswählen), Vorschau, mit dem Kreuz wieder entfernen; nach „Senden“ erscheint „Danke!“, das Fenster schließt und du bist wieder in den Einstellungen bzw. in der Liste
- [ ] Text bleibt erhalten, wenn du das Fenster schließt, bis er gesendet ist; „Zurück“ führt zur Auswahl der Art, „Schließen“ schließt
- [ ] **Administrator:** Einstellungen › Hilfe und Daten › „Feedback der Nutzer“ (mit „n neu“): Liste mit Art, Absender, Zeit, Text, Bild (Tipp öffnet die Bildansicht), Filter Alle/Neu/Gelesen/Erledigt, Stand umschalten, „Als Text kopieren“ (zum Weitergeben, zum Beispiel als Issue), Löschen mit Rückfrage; ein Mitglied sieht die Liste nicht
- [ ] Mehr als 10 Rückmeldungen in einer Stunde je Person werden mit freundlichem Text abgelehnt; sehr lange Texte und Wörter ohne Leerzeichen laufen nicht über den Rand
- [ ] Hell, Dunkel, Englisch; Update: Datenbank gesichert (Migration 24)

## 38 · Berechtigungen je Person (seit 1.30.0)

- [ ] Einstellungen › Personen & Zugriff › Person aufklappen: als Administrator der Bereich **Berechtigungen** mit sechs Schaltern (Wächter, Ansage und Lampe, App-Einstellungen, Personen, Bestätigen für Kinder, Feedback der Nutzer), jeder mit kurzer Erklärung; bei einem Administrator nur „Administratoren dürfen alles.“, bei einem Kind gar nichts
- [ ] Als Mitglied (ohne Rechte): kein Bereich Berechtigungen, keine Seiten Wächter, Vorlagen, Symbole, Termine, Tageszusammenfassung, Ansage und Lampe, Personen & Zugriff (wie bisher)
- [ ] „App-Einstellungen“ geben: das Mitglied sieht **ohne Neuladen** die Seiten Termine, Symbole, Vorlagen (und mit Push die Tageszusammenfassung) und kann die Standard-Uhrzeit ändern; **Dashboard-Button** und Panel-Pfad bleiben verborgen; wieder entziehen: Seiten weg, Eingaben gesperrt
- [ ] „Wächter“ geben: das Mitglied legt einen Wächter an und bearbeitet ihn (Reiter Wächter und Einstellungen › Wächter), ohne Recht nur ansehen
- [ ] „Ansage und Lampe“ geben: Seite Ansage und Lampe und bei jeder Person die Kanäle (Lautsprecher, Lampe) einrichtbar
- [ ] „Personen“ geben: Wartende freigeben, Personen hinzufügen, Anzeigenamen ändern; **nicht** sichtbar: Berechtigungen, Rolle Kind, Anmeldungen, Entfernen, Zugriff umstellen
- [ ] „Bestätigen für Kinder“ geben: das Mitglied bestätigt oder gibt zurück, was ein Kind erledigt gemeldet hat, auch wenn es nicht als Bestätiger gewählt ist; „wartet auf dich“ und Mitteilungen zeigen es
- [ ] „Feedback der Nutzer“ geben: das Mitglied sieht die Seite (mit Zahl der neuen Rückmeldungen), liest, markiert und löscht; ohne Recht keine Seite
- [ ] Ein Mitglied kann sich oder andere nicht befördern (kein Schalter, Server antwortet 403); eine Person, die zum Kind gemacht wird, verliert ihre Berechtigungen
- [ ] Datenbank: Migration 25 (Tabelle `user_permissions`, vorher Sicherung); nach dem Update hat niemand Berechtigungen
- [ ] Englisch, Hell, Dunkel: nichts läuft über den Rand

## Bekannte Lücken

- Dass die Kopfzeile ausgeblendet wird, ließ sich ohne Companion App nicht sehen (zwei Wege eingebaut, siehe 1).
- Ob Tippen auf die Push-Nachricht **direkt** in die Karte springt, hängt von der Companion App ab.
- ESLint und die Browser-Tests (WebKit, iPhone-Ansicht) laufen bei jedem Build. Sie bilden das Wischen mit Zeiger-Ereignissen nach, echtes Touch ersetzt das nicht.
- Nicht umgesetzt: Spalten per Ziehen sortieren (stattdessen Pfeile in den Board-Einstellungen).
