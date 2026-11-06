# Änderungen (Beta)

Die Beta bekommt jede neue Version vor der normalen App. Was sich ändert, steht im Changelog der normalen App: [stups/CHANGELOG.md](https://github.com/ArrestedOps/ha-stups/blob/main/stups/CHANGELOG.md). Hier nur, was die Beta selbst betrifft.

## 1.31.0-beta.1

**Wächter: das Gerät steht im Namen, und der Assistent hat überall ein „Zurück“.**

- **Zurück im Assistenten für neue Wächter:** oben links in jedem Schritt (auch im letzten, wo es fehlte) steht „‹ Zurück“. Es geht einen Schritt zurück, alle Eingaben bleiben. Ist die Entitätssuche offen, schließt es zuerst sie. Am ersten Schritt führt es zurück zu „Gefunden“ (bzw. schließt, wenn der Assistent von anderswo kam). „Schließen“ und Escape schließen weiterhin alles. Der untere Knopf ist jetzt nur noch „Weiter“
- **Neue Wächter aus Vorlagen nennen das Gerät:** „Batterie schwach“ wird zu „Batterie schwach: iPhone Rene“, die Karte zu „Batterie wechseln: iPhone Rene“. Der Gerätename kommt aus dem Friendly Name der Entität, ohne Endungen wie „Battery Level“, „Batterie“ oder „Leistung“, höchstens 28 Zeichen (gekürzt an einer Wortgrenze), ohne Friendly Name aus der Kennung. Steht das Gerät schon im Namen, bleibt er („Waschmaschine fertig“), steht nur ein Teil darin, kommt der Rest dazu („Waschmaschine fertig: Keller“). Das gilt für alle Vorlagen, auch wenn die Entität von Hand gewählt wird (ein von Hand geänderter Name bleibt unangetastet)
- **Bestehende Wächter:** In der Wächter-Übersicht (und in Einstellungen › Wächter) steht unter bzw. neben dem Namen der Friendly Name der überwachten Entität, eine Zeile, abgeschnitten, solange der Name das Gerät nicht nennt. Gleiche Namen stehen nach Gerätename sortiert. Auch in „Letzte Aktivität“ und bei wartenden Karten
- **Namen mit Gerät ergänzen, nur mit deiner Zustimmung:** Im Editor eines Wächters schlägt ein Knopf den neuen Namen vor (gespeichert wird erst mit „Speichern“). Dazu ein einmaliger Sammelknopf in der Übersicht und in Einstellungen › Wächter: fragt vorher nach, ändert nur Wächter, deren Name genau dem einer Vorlage entspricht (Name und, solange er der der Vorlage ist, der Kartentitel), nennt das Ergebnis als Zahl. Eigene Namen werden nie überschrieben, ebenso wenig Wächter, deren Entität Home Assistant gerade nicht kennt
- **Fehlerbehebung:** Batterie-Wächter erschienen fälschlich unter „Läuft gerade“, obwohl die Batterie über der Schwelle lag und nichts ausgelöst hatte. „Läuft gerade“ gibt es nur noch für Wächter, die einen Vorgang beobachten (Leistung, Strom, Energie, Einheiten W, kW, A …); Batterie, Temperatur, Füllstand und alles Unbekannte sind „Ruhig“ und zeigen den aktuellen Wert („jetzt 26 %“)
- **„seit …“ nur noch, wenn es stimmt:** Die Dauer bei „Läuft gerade“ erscheint nur, wenn Stups den Beginn selbst beobachtet hat (nicht mehr die Zeit des Neustarts)
- Mitteilungen und Herkunft von Karten (alte Karten heißen weiter „Batterie wechseln“): nicht geändert, die neuen Kartentitel nennen das Gerät selbst
- Keine Änderung an der Datenbank

## 1.30.0-beta.1

**Berechtigungen: Ein Administrator kann einzelnen Personen gezielt Rechte geben**, ohne sie zu Administratoren zu machen. Einstellungen › Personen & Zugriff › Person aufklappen › **Berechtigungen** (nur für Administratoren sichtbar; für Administratoren steht dort „Administratoren dürfen alles“, Kinder bekommen keine).

- **Wächter:** erstellen, bearbeiten, löschen und ausprobieren (auch Vorschläge, Probelauf, Suche in Home Assistant)
- **Ansage und Lampe:** die Haus-Kanäle jeder Person und der Sprachdienst
- **App-Einstellungen:** Standard-Uhrzeit für Termine, Tageszusammenfassung, Symbole erkennen, Vorlagen anderer löschen. **Nicht** dabei: Dashboard und Panel-Pfad (bleiben bei Administratoren)
- **Personen:** Wartende freigeben, Personen hinzufügen, Anzeigenamen ändern. **Nicht** dabei: Rollen, Anmeldungen, Entfernen, Berechtigungen
- **Bestätigen für Kinder:** Erledigt-Meldungen aller Kinder bestätigen oder zurückgeben
- **Feedback der Nutzer:** die Rückmeldungen lesen, als gelesen oder erledigt markieren und löschen
- Die Seiten und Knöpfe erscheinen für die Person sofort (ohne Neuladen), und der Server prüft jede Anfrage selbst: Wer Berechtigungen hat, kann sie nicht an sich oder andere weitergeben, keine Administratorrechte vergeben und niemanden zum Kind machen. Fehlt ein Recht, steht „Dafür fehlt dir die Berechtigung“
- Boards, Spalten, Kategorien und Vorlagen anlegen dürfen wie bisher alle Mitglieder (dafür ist keine Berechtigung nötig)
- Datenbank: Migration 25 (neue Tabelle für die Berechtigungen, vorher legt die App eine Sicherung an); nach dem Update hat niemand Berechtigungen

## 1.29.0-beta.1

**Desktop-Ansicht ab 1024 px Breite.** Auf dem Handy und in der Companion App ändert sich nichts; Tablets (ab 640 px) zeigen die Handy-Ansicht zentriert, Fenster (Karten, Einstellungen) höchstens 640 px breit.

- **Seitenleiste** (256 px, fest) statt der Leiste unten: Aufgaben (mit Zähler für heute fällig und überfällig), Boards, Wächter, darunter alle Boards mit Farbpunkt und offenen Karten (ein Klick wechselt das Board) und „Neues Board“, ganz unten die Person mit Rolle und dem Zahnrad für die Einstellungen
- **Kopfzeile** mit Titel und Untertitel, **Suche** (Strg/Cmd + K), „Neue Aufgabe“ statt des „+“-Knopfs, Home Assistant und Glocke. Die Suche filtert die schon geladenen Karten im Gerät: in Aufgaben nach Titel, Beschreibung, Board und Kategorie, in Boards nach Titel und Beschreibung (dasselbe Feld wie im Blatt „Filter“), in Wächtern nach dem Namen
- **Aufgaben:** Ein Klick auf eine Zeile öffnet die Karte in einer **Detailspalte** rechts (380 px) neben der Liste: Eigenschaften, Checkliste, Kommentare, Stupsen und Erledigt; die gewählte Zeile ist markiert, Escape oder das Kreuz schließt, Pfeil auf und ab springt in der Liste. Ab 1280 px steht die Spalte fest daneben, schmaler legt sie sich über die Liste
- **Boards:** Kanban über die volle Breite mit gleich breiten Spalten (Name, Zähler, „+“ legt in dieser Spalte an). Die Karten brechen die Zeile mit Termin, Kategorie und Zählern um, statt sie abzuschneiden. Karten lassen sich mit der Maus zwischen den Spalten ziehen
- **Wächter:** Raster mit zwei oder drei gleich hohen Karten je Reihe; „Neuer Wächter“ als Knopf neben dem Kopf
- **Fenster** (Neue Aufgabe, Einstellungen, Filter, Mitteilungen, Wächter, Zahlen …) öffnen am Desktop als **Dialog in der Mitte** (600 px) statt am Rand; Escape schließt, der Fokus kehrt zurück
- Tasten: **N** legt eine Aufgabe an (nicht in Eingabefeldern), **Strg/Cmd + K** springt in die Suche, **Escape** schließt die Detailspalte; sichtbarer Fokusring und Hover-Zustände; bei sehr breiten Fenstern bleibt der Inhalt höchstens 1560 px breit
- Langer Titel einer Karte wird gleich ganz angezeigt (das Feld misst nach dem Laden der Schrift noch einmal)
- Keine Änderung an der Datenbank

## 1.28.0-beta.1

**Neu: Feedback.** Fehler melden, Verbesserungen vorschlagen, loben oder kritisieren, direkt in Stups.

- **Einstieg:** Einstellungen ganz oben „Feedback & Ideen“ und ein leiser Textknopf am Ende von Aufgaben („Fehler oder Idee? Sag es uns“). Kinder sehen ihn nicht
- **Ablauf:** erst die Art wählen (Fehler melden, Verbesserung oder Wunsch, Lob, Kritik, Sonstiges), dann ein Text mit Zähler („123 / 1000“, höchstens 1000 Zeichen) und auf Wunsch ein Bild (Foto aufnehmen oder auswählen, wird vor dem Senden verkleinert), dann „Senden“ und „Danke!“. Der Text bleibt erhalten, wenn du das Fenster zwischendurch schließt
- **Mitgesendet** werden Version, Ansicht, Sprache, Hell oder Dunkel, Fenstergröße, ob Stups in Home Assistant läuft, und der gekürzte Browsername; nie Anmeldedaten. Alles bleibt auf deiner Stups-Installation, es geht nichts an Dritte
- **Für Administratoren:** Einstellungen › Hilfe und Daten › „Feedback der Nutzer“ (mit Zahl der neuen): Liste mit Art, Absender, Zeit, Text und Bild, Stand umschalten (neu, gelesen, erledigt), löschen und „Als Text kopieren“ zum Weitergeben, zum Beispiel als Issue
- Höchstens 10 Rückmeldungen je Person und Stunde; Bilder zählen wie Anhänge gegen die Upload-Obergrenzen
- Datenbank: neue Tabelle für Rückmeldungen (Migration 24, vorher wird gesichert)

## 1.26.2-beta.1

- **Fehlerbehebung:** „Warum kommt nichts an?“ (Einstellungen › Benachrichtigungen) blieb bei „Lädt …“ stehen, wenn zwei offene Karten denselben Titel und denselben Termin hatten
- Keine Änderung an der Datenbank

## 1.26.1-beta.1

- **Sicherheit: mehrere Härtungen, Update empfohlen.** Betrifft Anmeldung und Zugriff, Push-Nachrichten, Abrufe von Webseiten, Uploads und den Umzug-Export. Der Umzug-Export enthält keine Geheimnisse mehr, ist nur für den Besitzer lesbar, läuft nach 24 Stunden ab und wird nach dem Import gelöscht (Konten ohne Passwort brauchen danach ein neues). Im Container gibt es `STUPS_TRUST_PROXY` für den Betrieb hinter einem Reverse Proxy (siehe Docker-Anleitung). Der Panel-Pfad lässt sich nur noch als Administrator ändern
- **„Erledigt“ in Push-Nachrichten** gilt nur noch, wenn Stups die tippende Person eindeutig kennt (mit ihrem Home-Assistant-Benutzer verknüpft) und die Karte ihr zugewiesen ist; die Bestätigung für Kinder gilt dort wie in der App
- **Kalender-Wächter:** Eine gelöschte oder erledigte Karte kommt für denselben Termin nicht mehr wieder, und ein geänderter Titel oder Beginn erzeugt keine zweite Karte
- **Wächter bleiben flott:** Abfragen von Kalender und Vorhersage laufen nebenher mit Zeitlimit, ein langsames Home Assistant hält Auswertungen, „Übernehmen“ und „Weitergeben“ nicht mehr auf
- **Push-Wiederholung:** Scheitert die Nachricht an die Companion App, wird sie auch dann wiederholt, wenn eine Ansage im Haus bewusst übersprungen wurde
- **Verbindung zu Home Assistant:** Heartbeat, wachsende Wartezeit beim Neuverbinden, keine Absturzgefahr durch ungültige Nachrichten; die Zeitzone wird regelmäßig erneuert
- Weniger Doppelansagen und Doppelkarten bei gleichzeitigen Ereignissen, Lautstärke wird zuverlässiger zurückgestellt, eigene Sensornamen auch für Namen ohne lateinische Buchstaben
- **Robuster beim Laden:** Anfragen an den Server haben ein Zeitlimit von 30 Sekunden (danach „Zeitüberschreitung“ statt endlosem Laden), langsame ältere Antworten überschreiben keine neueren mehr (Karten-Fenster, Wächter-Liste, Entitätssuche, Probelauf), und Anzeigen mit „in 5 Minuten“ oder „überfällig“ rechnen jede Minute neu
- **Fenster per Tastatur:** Beim Öffnen liegt der Fokus im Fenster, Tab bleibt darin, und beim Schließen kehrt der Fokus zum Knopf zurück
- Datenbank: keine neue Migration; Updates der Datenbank behalten künftig auch bei Tabellenumbauten alle abhängigen Daten (neuer Test mit befüllten alten Datenbanken)
## 1.26.0-beta.1

**Aufgaben: die drei Zahlen sind antippbar.** Jede Zahl öffnet ein Blatt von unten (nach dem freigegebenen Entwurf „Variante 3“). Alle Blätter zeigen **deine eigenen** Karten, wie die Zahlen selbst.

- **Heute fällig:** „3 Aufgaben für heute. 1 davon schon erledigt, 2 offen.“ Darunter „Bis heute Abend“ (nach Uhrzeit) und „Schon erledigt“ (mit „um 07:42“). Der Kreis hakt direkt ab, ein Tipp auf die Karte öffnet sie. „In der Liste filtern“ schließt das Blatt und stellt die Liste auf **Heute** und **Meine**
- **Überfällig:** rot hervorgehoben mit „seit gestern“ oder „seit 2 Tagen“. Je Karte ein Knopf **Morgen** (Termin auf morgen, die Uhrzeit bleibt), darunter **Alle auf heute**, **Alle auf morgen** und **Wochenende** (nächster Samstag, gleiche Uhrzeit). Ein Hinweis zeigt, was verschoben wurde, mit **Rückgängig** (stellt die alten Termine wieder her). Wiederkehrende Karten bleiben wiederkehrend, Karten mit Termin nach heute wandern wie gewohnt nach „Geplant“ und mit Rückgängig wieder zurück. Die Sommerzeit wird beachtet. „In der Liste filtern“ stellt die Liste auf **Überfällig** und **Meine**
- **Heute erledigt** (die Zelle heißt jetzt „Erledigt heute“): ein Ring „4 von 7 geschafft 👏“ (heute noch fällige plus heute erledigte Aufgaben), darunter die heute erledigten Karten mit Uhrzeit und **Rückgängig** (die Karte ist wieder offen). „Archiv öffnen“ führt ins Archiv, „Zurück“ dort wieder hierher
- Freundliche Leerzustände („Nichts überfällig 🎉“, „Heute noch nichts erledigt“)
- **Kinder** sehen nur ihre eigenen Karten und haben weder „Morgen“ noch „Alle verschieben“; Abhaken und Rückgängig gelten wie bisher (mit Bestätigung, wenn eingestellt)
- Die Blätter laden bei jeder Änderung neu (auch wenn jemand anderes etwas ändert)
- Keine Änderung an der Datenbank, keine neue Schnittstelle des Servers

## 1.25.1-beta.1

- **Lange Namen machen die Seite nicht mehr breiter:** Sehr lange Entitätsnamen wie `sensor.flur_schliesszylinder_…` ragten im Wächter-Editor (Zusammenfassung, Karten, Entitätszeile) aus dem Fenster und zerschossen das Layout. Sie brechen jetzt um, in allen Fenstern der App. Ein Browser-Test mit einem 80 Zeichen langen Namen sichert das ab
- **Home-Knopf mit dem Home-Assistant-Logo** statt des Hauses
- Keine Änderung an der Datenbank

## 1.25.0-beta.1

**Neues Design, Phase 6b: Mitteilungen, dazu der Home-Knopf und dein Dashboard.** *Datenbank: Migration 23, vorher wie immer eine Sicherung.*

- **Mitteilungen mit Verlauf:** Die Glocke zeigt jetzt, was für **dich** passiert ist, der Tag nach Tag gruppiert (Heute, Gestern, Älter; die letzten 14 Tage): Stupse an dich und Antworten auf deine Stupse, Karten von Wächtern, Erledigtes und Kommentare anderer auf deinen Karten, Erinnerungen („Überfällig“), Änderungen anderer (verschoben, wieder geöffnet, anderer Termin) und Bitten um Bestätigung. Ein Tipp öffnet die Karte. Oben stehen die Chips Alle, Stupse, Wächter, Erledigt, Kommentare
- **Ungelesen und „Alle gelesen“:** Der **Punkt an der Glocke zeigt nur noch Ungelesenes** (vorher: „irgendetwas ist offen“). Ungelesene Zeilen haben einen orangen Rand und einen Punkt. „Alle gelesen“ gilt für dich auf **allen deinen Geräten**. Beim Update beginnt die Glocke ohne Altlasten, alles bis dahin gilt als gelesen. Offene Stupse, Bestätigungen und Karten von Wächtern stehen weiter in der Liste
- **Kinder** sehen nur Eigenes: Stupse an sie und Einträge zu Karten, die ihnen zugewiesen sind; nie fremde Karten oder Boards, keine Bitten um Bestätigung
- **Home-Knopf neben der Glocke** (nur in Home Assistant): Haus-Symbol in der Kopfzeile aller Reiter, links von der Glocke. Ein Tipp bringt dich zurück zu deinem Dashboard in Home Assistant. Die Zeile „Zurück zum Dashboard“ in den Einstellungen ist darin aufgegangen
- **Dashboard pro Person:** Einstellungen › Home Assistant › **Dashboard**. Jede Person wählt selbst (gilt auf allen Geräten), die Liste kommt aus Home Assistant (Standard, Übersicht, deine Dashboards), „Eigener Pfad …“ geht auch. Hast du nichts gewählt, gilt dein **Standard-Dashboard aus Home Assistant** (Profil › Standard-Dashboard), sonst die Option der App, sonst die Startseite; vorausgewählt steht „Standard (Home Assistant: …)“. Kinder bekommen immer den Standard und haben keine Auswahl. Die frühere gemeinsame Wahl für alle (nur Administratoren) gibt es nicht mehr; ein früher gesetzter Wert gilt weiter als Standard der App, solange niemand etwas anderes wählt
- Umzug und Export nehmen Marker und Dashboard mit, ältere Exporte bleiben lesbar
- Datenbank: **Migration 23**, vorher wie immer eine Sicherung (Spalten `users.inbox_seen_at` und `users.dashboard_path`, dazu Indexe; vorhandene Daten bleiben unverändert)

## 1.24.2-beta.1

- **Kategorie in der Zeile:** Auf der Karte steht jetzt die **Kategorie** (mit Farbpunkt, bei mehreren die erste und „+n“) statt des Personennamens. Wer zuständig ist, zeigen die Bilder rechts. Das gilt in Aufgaben und in den Boards
- **Mehrere Zuständige als Stapel (Variante D):** Bis zu drei Personen stehen überlappend nebeneinander, ab vier zeigt die Karte zwei Bilder und einen Kreis „+n“ mit der Zahl der übrigen. Für Screenreader steht jeder Name im Text
- Keine Änderung an der Datenbank

## 1.24.1-beta.1

- **Wischen andersherum:** Finger nach **rechts** schiebt die Karte in den **nächsten** Status (zum Beispiel von Offen in In Arbeit), Finger nach **links** zurück. Vorher war es umgekehrt. Die Karte fliegt in die Richtung, in die du wischst
- **Priorität in Farbe:** **Hoch** leuchtet rot, **Mittel** ist orange (vorher beide gleich)
- Keine Änderung an der Datenbank

## 1.24.0-beta.1

**Neues Design, Phase 6a: der Filter.** *Keine Änderung an der Datenbank.*

- **Filter-Blatt nach dem Entwurf:** Wer, **Wann** (Überfällig, Heute, Diese Woche, Später, Ohne Termin – auch mehrere zusammen), Boards, **Priorität**, „Nur mit offenem Stups“, **„Nur von Wächtern“**, „Erledigte anzeigen“ und **Sortieren nach** (Fälligkeit, Priorität, Neueste). Der große Knopf unten zeigt die Trefferzahl („3 Aufgaben anzeigen“), die Zahlen an den Chips sind gegen die übrige Auswahl gerechnet.
- **Ein Filter für Aufgaben und Kalender.** Der Knopf „Filter“ neben den Chips (und im Kalender) bekommt bei gesetztem Filter einen orangen Umriss und einen Zähler. Deine Auswahl bleibt pro Gerät erhalten; ein früher gemerkter Filter wird weiter gelesen, Gelöschtes fällt weg.
- **„Ohne Termin“** holt Karten ohne Termin in die Liste (eigene Gruppe). Dafür gibt es am Server den Zusatz `GET /api/schedule?undated=1`, keine neue Route.
- **Kinder:** kein „Wer“, kein „Nur von Wächtern“, kein Stups-Schalter; sie sehen weiter nur ihre eigenen Karten.
- **Personenbilder in den Chips:** Jede Person (Ben, Conny …) zeigt in Aufgaben, im Filter und in Boards ihr eigenes Bild oder die farbige Initiale, nicht mehr das Personen-Symbol; nur „Alle“ behält es.
- Bewusste Abweichungen vom Entwurf: Die Chips der Boards haben keine Zahlen (wie im Entwurf); die Schnellwahl im Board (Meine, Personen, Kategorien, Suche) bleibt eigenständig und ist nicht an den Aufgaben-Filter gebunden; „Vom Haus“ steht weiter immer oben und wird vom Filter nicht ausgeblendet.
- Keine Änderung an der Datenbank

## 1.23.0-beta.1

**Neues Design, Phase 5: die restlichen Bildschirme.** *Keine Änderung an der Datenbank.*

- **Kalender:** Wochen- und Tagesansicht im Raster mit farbigen Terminen, orange Jetzt-Linie und gestrichelt markierter freier Zeit, auf die du tippst, um eine Karte mit genau diesem Termin anzulegen. Der **Monat** zeigt Punkte unter den Tagen; ein Tipp wählt den Tag und zeigt seine Karten darunter, „Tagesansicht öffnen“ wechselt zum Tag.
- **Boards verwalten:** „Board wechseln“ mit Kacheln für jedes Board und **Vorlagen als Kacheln** für neue Boards; die Board-Einstellungen mit Spalten (Erledigt-Spalte, Pfeile, „⋯“), Kategorien als Chips, Archiv und Papierkorb als Zeilen; Archiv nach Erledigungstag gruppiert, Papierkorb mit den Tagen, die noch bleiben.
- **Einstellungen als Zeilen** mit Kachel, Erklärung und Pfeil. Die Zeile „Wächter“ ist weg (die Verwaltung öffnet im Reiter Wächter über „Alle Wächter verwalten“). **Neu: Tageszusammenfassung** – die Uhrzeit stellst du jetzt in der App ein (nur Administratoren); sie hat Vorrang vor der Option des Add-ons, „Zurücksetzen“ gibt der Option den Vorrang zurück. **Neu: Dashboard-Button** mit Vorschau und YAML für die Bubble Card (in der Beta mit dem Sensor `sensor.stups_beta_heute_faellig`).
- **Personen & Zugriff** (vorher „Personen und Kinder“): Personen mit Foto, Admin-Abzeichen, Geräten und Ruhezeit, „Wartet auf Freigabe“ und „Person hinzufügen“. Alle bisherigen Kontrollkästchen sind **Schalter** (nur die Übernahme-Liste der Wiederholung bleibt eine Auswahlliste).
- **„Warum kommt nichts an?“** zeigt den Stand gleich beim Öffnen: Verbindung, pro Person „x / y Geräte erreichbar“, Ruhezeit, bei einem unbekannten oder fehlenden Gerät ein Banner mit der Lösung und das Protokoll der zuletzt gesendeten Nachrichten.
- **Docker, Dialoge, Foto:** Anmelden, Konto mit Passkeys, „Noch kein Zugriff“, Bestätigen-Dialog, Hinweise unten und die Foto-Ansicht (Sichern, Original, Entfernen mit Rückfrage) im neuen Stil; „Diese Woche“ (Fairness) mit Umschalter und Zeilen, weiter ohne Rangliste.
- Bewusste Abweichungen vom Entwurf: im Papierkorb gibt es „Zurückholen“, aber kein „endgültig löschen“ und kein „Papierkorb leeren“ (Phase 5 ändert keine Daten); im Kalender stehen zusätzlich Zurück, Weiter und Heute; die Gruppen der Einstellungen behalten ihre Namen.
- **Wächter-Editor, vier Verbesserungen:** (1) Im Schritt „Wenn“ steht die gewählte Entität als **Zeile mit „Ändern“ rechts** (wie bei „Erledigt sich selbst“ im Feinschliff); der Text „Andere Entität wählen“ unten ist weg. (2) Die Bedingungen stehen überall in **einer Reihenfolge: unter, über, Zustand** (im Entwurf WaechterB; bisher stand sie im Feinschliff anders). (3) Texte in den Karten und Zeilen des Editors (zum Beispiel bei „Erledigt sich selbst“) **brechen um** statt mit „…“ abgeschnitten zu werden. (4) Im Ablauf steht die Entität **oben in der Karte WENN**, direkt unter der Überschrift, mit „Ändern“ rechts; danach erst Art, Schwelle und Dauer.
- Keine Änderung an der Datenbank

## 1.22.1-beta.1

- **Home Assistant 2026.8: oben kein doppelter Abstand, unten bis zum Rand.** In 1.21.1 meldete sich Stups bei Home Assistant an und übernahm die Abstände zu Statusleiste und Home-Balken. Die Funktion „HA-Kopfzeile ausblenden“ meldete sich danach ein zweites Mal an, ohne diese Angabe, und schaltete die Übernahme wieder ab: Home Assistant polsterte das Fenster erneut, und Stups zählte die Abstände zusätzlich. Das ergab viel Schwarz über dem Kopf der App und einen Streifen unter der Leiste. Jetzt tragen alle Anmeldungen die Angabe; die Leiste reicht bis zum unteren Rand, der Kopf der App beginnt direkt unter der Statusleiste
- Keine Änderung an der Datenbank

## 1.22.0-beta.1

**Neues Design, Phase 4: Wächter bearbeiten als Ablauf, neuer Wächter in vier Schritten, Verlauf der Entität.** *Keine Änderung an der Datenbank.*

- **Neuer Wächter als Assistent in vier Schritten:** Wenn, Dann, Wer, Feinschliff, mit Fortschrittsbalken und je einer Frage. Vorlagen und „Gefunden“ führen in Schritt 1. Der **Satz** („Wenn die Waschmaschine unter 5 W liegt, bekommt …“) steht in Schritt 4 als Zusammenfassung
- **Verlauf der Entität:** Schritt 1 zeigt die **letzten 3 Stunden** der beobachteten Entität mit einer grünen **Schwellen-Linie** und einem grünen Punkt **dort, wo der Wächter ausgelöst hätte** („heute 10:58 ausgelöst“). Die Schwelle stellst du mit Regler oder Zahl, die Dauer mit Chips; ein Satz sagt, wie oft der Wächter mit dieser Dauer ausgelöst hätte. Ohne Verlauf (neue Entität, Recorder aus, keine Verbindung) steht ein Hinweis statt des Diagramms
- **„Wer“ mit allen sieben Arten:** immer dieselbe Person, abwechselnd (egal, wer da ist), eine anwesende Person abwechselnd, wer zuerst heimkommt, alle Anwesenden, erst vorschlagen, niemand. **Vorausgewählt ist „abwechselnd“ (reihum)**, mit dem Hinweis, dass „fair“ hier reihum heißt und nicht nach Aufwand gewichtet. Die **Reihenfolge** zeigt Fotos oder Initialen, wer als Nächstes dran ist (oranger Ring) und wer unterwegs ist; die Rotation rückt dadurch nicht weiter
- **Wächter bearbeiten als Ablauf:** vier verbundene Karten WENN, DANN KARTE, AN WEN, ERLEDIGT SICH SELBST. „Ändern“ klappt die Einstellungen der Karte auf. Der **Feinschliff** (Name, Sperrzeit, keine zweite Karte, Stupsen, erst beim N-ten Mal) steht als Chips darunter; Probelauf, Status, Pausieren und Löschen bleiben darunter erreichbar
- Administratoren bearbeiten, **Mitglieder sehen alles lesend**, auch den Verlauf der Entität (nur für Entitäten, die ein Wächter beobachtet). **Kinder** haben weiter keinen Wächter-Reiter, und der Server verweigert ihnen die neuen Abfragen
- Bewusste Abweichungen vom Entwurf: oben im Ablauf steht der Satz als Zusammenfassung; im Schritt 2 kommen eine eigene Zeile für die Spalte, Kategorien und Beschreibung dazu, im Schritt 4 Name und „keine zweite Karte“; die Dauer hat zusätzlich „sofort“; die Schwelle lässt sich auch als Zahl eingeben; eine Vorlage bringt ihre eigene Zuweisung mit (zum Beispiel „wer zuerst heimkommt“), nur ein leerer neuer Wächter beginnt mit „reihum“; das Vorschlags-Banner „passende Automationen“ gehört zu einem späteren Auftrag; sein Platz ist der Hinweis „weitere Geräte gefunden“ oben auf dem Reiter Wächter

## 1.21.1-beta.1

- **Home Assistant 2026.8: kein Leerstreifen mehr unter der Leiste.** Seit dieser Version polstert Home Assistant das Fenster der App selbst mit Statusleiste und Home-Balken; darunter blieb ein Streifen, den die Leiste (Aufgaben, Boards, Wächter) nicht füllen konnte. Stups meldet sich jetzt bei Home Assistant an, übernimmt die Abstände selbst und füllt das Fenster ganz aus: Die Leiste reicht bis zum unteren Rand, die Knöpfe stehen über dem Home-Balken, nichts wird doppelt gezählt. Ältere Home-Assistant-Versionen und der Browser verhalten sich wie bisher
- Keine Änderung an der Datenbank

## 1.21.0-beta.1

**Neues Design, Phase 3: Symbol und Farbe für jede Karte, „Neue Aufgabe“ nach dem Entwurf, Termin-Fenster.** *Datenbank: Migration 22, vorher wie immer eine Sicherung.*

- **Die App startet immer auf „Aufgaben“**, auch nach dem Neuladen. Bisher blieb sie auf Boards, wenn du zuletzt dort warst
- **Jede Karte hat ein Symbol und eine Farbe.** Karten in Aufgaben, Boards, im Karten-Menü und beim Stupsen zeigen sie in der Kachel; ohne Symbol steht wie bisher der orange Haken („Aufgabe“). Karten von Wächtern bekommen das Symbol ihrer Entität (Waschmaschine, Fenster, Batterie …). Duplizieren, Wiederholung und Board-Vorlagen nehmen das Symbol mit
- **Neue Aufgabe:** Beim Tippen erkennt Stups das Symbol aus dem Titel („Müll raus“ → Mülleimer), sichtbar am **Funken** an der Kachel und als Chip „Symbol: …“, den du mit ✕ entfernen kannst. Erkannte Teile (Datum, Uhrzeit, @Person, #Kategorie, Wiederholung) stehen als Chips. Darunter „Wann und wo“ (Board und Spalte, Termin, Wiederholung, Erinnern), „Wer kümmert sich?“, Priorität, Kategorie (**neue Kategorie gleich hier anlegen**), Notiz und „Mehr“ (Checkliste, Foto / Link). Kosten und Aufwand stehen jetzt an der Karte
- **Symbol wählen** (Tipp auf die Kachel, auch an bestehenden Karten): Suche, die auch ähnliche Wörter kennt („Wäsche“ findet die Waschmaschine), Vorschläge zum Titel, „Zuletzt benutzt“, sechs Bereiche mit rund 300 Symbolen und die Farbe („Auto“ oder fest). Ein erkanntes Symbol folgt dem Titel, wenn du ihn änderst; ein gewähltes bleibt
- **Termin wählen:** Monatskalender und Uhrzeit als zwei Listen (Ziehen, Mausrad, Pfeiltasten, Ziffern), „Übernehmen“ und „Kein Termin“. Auch an bestehenden Karten über „Kalender …“
- **Einstellungen › Symbole** (nur Administratoren): „Symbole aus Titeln erkennen“ setzt für alle Karten ohne Symbol das passende, nach einer Rückfrage und nur auf deinen Wunsch; am Ende steht, für wie viele Karten es geklappt hat
- Bewusste Abweichungen vom Entwurf: Kosten und Aufwand fehlen im Fenster „Neue Aufgabe“ (sie gibt es an der Karte); die Suche kennt nur die eingebauten Symbole, nicht alle von Home Assistant; die erkannten Teile stehen als Chips, nicht farbig im Text

## 1.20.2-beta.1

- **Leiste unten in der Home-Assistant-App:** Aufgaben, Boards und Wächter standen zu hoch, mit viel Leerraum darunter. Die Seite ließ unten 30 px für den Home-Balken frei, den Home Assistant dort aber schon selbst freihält. In Home Assistant bleibt jetzt nur ein kleiner Rand; im Browser bleibt der Platz für den Home-Balken. Dasselbe gilt für den großen Knopf am Fuß der Sheets, und der Plus-Knopf rückt mit herunter
- Keine Änderung an der Datenbank

## 1.20.1-beta.1

**Korrektur zu 1.20.0: Aufgaben, Boards, Wächter, Karte, Menü und Stupsen sind jetzt nach den Entwürfen gebaut.** 1.20.0 hatte die Reiter, aber Anordnung und Maße wichen von den Entwürfen ab. Das ist jetzt gemessen und angeglichen (Abstände, Höhen, Schriftgrößen, Symbole, Reihenfolge).

- **Oben auf jedem Reiter:** Logo, „stups.“, **Glocke** (mit orangem Punkt, wenn etwas für dich offen ist), **Zahnrad** (Einstellungen) und dein Bild, darunter Titel und Untertitel des Reiters. Das „‹ Dashboard“ links oben ist weg: **„Zurück zum Dashboard“ und „HA-Kopfzeile ausblenden“ stehen jetzt unter Einstellungen › Home Assistant** (für alle im Add-on, nicht nur für Administratoren)
- **Mitteilungen (Glocke):** zeigt, was gerade auf dich wartet: Stupse an dich, Bestätigungen, die du geben darfst, und Karten von Wächtern. Ist nichts offen, steht dort ein ruhiger Satz und die Glocke hat keinen Punkt. Der Verlauf mit „Alle gelesen“ kommt später
- **Aufgaben:** Titel „Aufgaben“ mit Untertitel, Zahlenleiste, „Diese Woche“ mit **Monatsansicht** und Monat, Wochenleiste, Stups-Banner, Chips **Meine · Alle · Person** mit Filter-Knopf rechts, dann Überfällig, Heute, Diese Woche, Später. Jede Zeile hat jetzt Kachel, „Datum • Person • Checkliste • Link“, das Bild der Person und den **Mehr-Knopf „…“** (öffnet das Karten-Menü). „Vom Haus“ steht (nur mit Karten) vor Überfällig, Fairness und „Bei den anderen“ am Ende
- **Kein Umschalter Liste/Tag/Woche/Monat mehr:** Der Kalender (Tag, Woche, Monat, freie Zeit antippen) ist eine eigene Seite unter Aufgaben. Du kommst mit „Monatsansicht“, dem Monat oder dem Kalender-Knopf der Wochenleiste hin, mit „‹ Aufgaben“ zurück
- **Filter:** Der Filter-Knopf öffnet ein Blatt im neuen Stil (Wer, Boards, Erledigte anzeigen; in Boards: Suche, nur mit offenem Stups, Kosten des Boards). „Niemand“ und die Boards stehen jetzt dort, nicht mehr als Chips
- **Boards:** Kopf mit Titel, Board-Leiste, Chips Meine · Alle · Person (neu: auch eine bestimmte Person), Kategorien, Spalten gleich breit, Zeilen wie in Aufgaben. Die Lupe und die Zeile mit Zahlen und Kosten sind ins Filter-Blatt gewandert
- **Wächter:** Karte „Deine Wächter“ mit Roboter, Abschnitte mit farbigen Symbolen, „Stupsen“ als orange Knopf, „Ruhig“ als eine Zeile („5 Wächter ohne offene Aktion“), die sich aufklappen lässt
- **Karte, Karten-Menü, Stupsen:** wie in den Entwürfen (Chips, Beschreibung als Feld, Checkliste mit eigenen Kästchen, Links und Anhänge, Kommentare mit Senden-Knopf, Verlauf; das Menü als Aktionsblatt mit 2 × 2 „Verschieben nach“; Stupsen mit Personen als Chips und Nachrichten als Liste). Sheets sind jetzt wie im Entwurf hoch, mit Titel in der Mitte
- **Leiste unten und „+“:** 88 px hoch, ohne Trennlinie, der Knopf „+“ 58 px; der dunkle Grund ist ruhig (ohne orangen Schimmer)
- **Bewusste Abweichungen:** Das Orange der Knöpfe bleibt etwas dunkler als im Entwurf, damit weiße Schrift gut lesbar bleibt (3,5 : 1); deine Akzentfarbe gilt weiter. Die Symbole der Karten (Kachel) sind noch das Standardsymbol, die Auswahl folgt mit „Neue Aufgabe“. Keine Änderung an der Datenbank

## 1.20.0-beta.1

**Neues Design, Phase 2: drei Reiter.** Unten gibt es jetzt **Aufgaben, Boards und Wächter**. Wer ein Kind ist oder Stups ohne Home Assistant nutzt, sieht nur Aufgaben und Boards.

- **Aufgaben** (vorher Heute und Kalender): oben „Vom Haus“, dann eine Leiste mit deinen Zahlen (heute fällig, überfällig, heute erledigt), die Woche mit Punkten, ein Banner „Conny stupst dich! 👋“, wenn dich jemand gestupst hat, und die Chips **Meine · Alle · Personen · Niemand**. Die Karten stehen in den Gruppen Überfällig, Heute, Diese Woche und Später. Über der Liste wechselst du zwischen **Liste, Tag, Woche und Monat** (der frühere Kalender, freie Zeit antippen geht weiter). Ganz unten stehen „Fairness diese Woche“ und „Bei den anderen“. Ein früher gemerkter Reiter führt ohne Fehler zu Aufgaben. **Neu für dich:** Aufgaben starten bei „Meine“; „Alle“ zeigt auch Karten ohne Zuständige
- **Boards:** neue Leiste mit dem Namen des Boards, die Karten sind einheitliche Zeilen mit Kachel, Erledigt-Kreis und einer Zeile für Termin und Details. Wischen und Ziehen bleiben
- **Wächter** (vorher Zuhause): derselbe Stand (wartet, läuft, kommt bald, ruhig) in der neuen Optik, mit kleinem Roboter, dem Banner „weitere Geräte gefunden“ und dem Knopf „+“ für einen neuen Wächter
- **Karte, Menü und Stupsen** im neuen Stil: Kachel und Chips in der Karte, „Verschieben nach“ als Auswahl, beim Stupsen eine **Vorschau der Push-Nachricht** und der Hinweis zur Ruhezeit
- **Kinder:** zwei Reiter, nur die eigenen Karten, kein „Vom Haus“, keine Fairness
- Alle Funktionen von 1.19 sind weiter erreichbar. Keine Änderung an der Datenbank. Der Roboter ist ein Platzhalter, bis das Original geliefert ist

## 1.19.0-beta.1

**Neues Design, Phase 1: das Gestaltungssystem.** Alles sieht schon ein Stück wärmer und ruhiger aus, bedient wird es wie bisher. Die neuen Bildschirme (Aufgaben, Boards, Wächter) folgen in den nächsten Versionen.

- **Neue Farben und Schrift:** wärmeres Schwarz, das Orange als Verlauf mit Leuchten, die Schrift **Inter** (lokal in der App, kein Download). Hell und Dunkel bleiben beide. Das Orange ist so gewählt, dass weiße Schrift darauf überall mindestens 3,5 : 1 Kontrast hat; **deine gewählte Akzentfarbe gilt weiter**
- **Neue Bausteine:** eine gemeinsame Zeile, Symbol-Kacheln, Chips, Umschalter, Schalter, Banner, Zahlenleiste und der große Knopf am Fuß eines Sheets. Die Spalten-Reiter im Board, die Leiste unten, die Sheets (runder, größerer Titel), die Gruppen in den Einstellungen und der Schalter „HA-Kopfzeile ausblenden“ nutzen sie schon
- **Kleine Korrekturen:** Der Löschen-Knopf hat im Dunkelmodus jetzt dunkle Schrift auf dem hellen Rot (vorher kaum lesbar). Personenbilder sind rund. Die Lampe leuchtet in der Farbe der neuen Akzentfarbe
- Keine Änderung an der Datenbank

## 1.18.3-beta.1

Fehlerbehebungen aus einer Durchsicht des Codes, keine neuen Funktionen.

- **Sicherheit:** Die Anmeldung im eigenständigen Container-Betrieb (ohne Home Assistant) wird strenger geprüft; die Diagnose-Seite ist für Kinder gesperrt, und Senden und Zurücksetzen dort dürfen nur Administratoren. **Update empfohlen**
- **Rückgängig bei wiederkehrenden Karten** löscht die neue Karte nicht mehr, wenn schon mit ihr gearbeitet wurde (Kommentar, Anhang, Checkliste, geänderter Titel oder Beschreibung). Stattdessen kommt ein Hinweis
- **Bestätigung (Kinder):** Eine offene Anfrage kommt nicht mehr von selbst zurück, wenn die Karte nach „Erledigt“ und wieder heraus gezogen oder aus dem Archiv geholt wird
- **Erledigt-Spalte** löschen oder abwählen öffnet die Karten darin wieder; die Zahl der offenen Karten zählt keine erledigten mehr
- **Eingaben:** Falsche Werte (zum Beispiel ein Objekt als Beschreibung) ergeben eine Meldung statt eines Serverfehlers. Wiederholungen sind auf „alle 999“ begrenzt
- **Live-Sync:** Nach dem Entsperren des iPhones entsteht keine doppelte Verbindung mehr; Änderungen anderer Geräte kommen wieder gezielt an, statt dass jedes Mal alles neu geladen wird
- **Oberfläche:** „Karte gelöscht“ erscheint nur, wenn das Löschen geklappt hat. Wer den Zugriff zurückbekommt, sieht „Kein Zugriff“ nicht mehr bis zum Neuladen. Escape schließt in der Foto-Ansicht nur das Foto. Uploads führen bei abgelaufener Sitzung zur Anmeldung. Einige Texte waren auf Englisch noch deutsch
- Keine Änderung an der Datenbank

## 1.18.2-beta.1

- **Gefunden: Treffer ausblenden.** Bei jedem Treffer (Waschmaschine, Abfallkalender, Batterie …) gibt es **Ausblenden**. Was du nicht hast, schlägt Stups nie wieder vor, auch nicht nach einem Neustart. Unter **Ausgeblendet (n)** steht es mit **Wieder anzeigen**, falls du es doch brauchst. Gilt für alle Administratoren; der nächste Treffer derselben Art rückt nach
- Datenbank: Migration 21 (eine kleine Tabelle für das Ausgeblendete, vorher wie immer eine Sicherung)

## 1.18.1-beta.1

- **Start immer auf „Heute".** Wer zuletzt unter Zuhause war, landete beim nächsten Öffnen wieder dort. Jetzt öffnet die App immer auf Heute; gemerkt werden nur Boards und Kalender
- **Zuhause: Wächter direkt öffnen.** Ein Tipp auf einen Wächter öffnet ihn. **Administratoren bearbeiten ihn dort** (Satz, Mehr Regeln, Testen, Pausieren, Löschen). **Alle anderen sehen ihn lesend:** Einstellungen und Verlauf, ohne Speichern und ohne Änderungen (der Server verweigert sie ohnehin)
- **Verlauf sichtbar.** Unten auf Zuhause steht die **letzte Aktivität** aller Wächter; im Wächter selbst der Verlauf seiner Läufe, älterer auf Wunsch. Die Zeile „Ruhig" ist jetzt eine Liste, jeder Eintrag antippbar
- Keine Änderung an der Datenbank

## 1.18.0-beta.1

- **Neue Startseite „Heute".** Die Leiste unten heißt jetzt **Heute · Boards · Kalender · Zuhause**. Heute zeigt, was für dich dran ist: **Vom Haus** (Karten von Wächtern, mit Auslöser, Zeit und Grund, mit **Erledigt**, **Weitergeben** und bei „Erst vorschlagen" **Übernehmen**), **Für dich** (deine Karten mit Termin bis morgen) und eine Zeile **Bei den anderen**, die zu **Diese Woche** führt (die frühere Fairness-Ansicht, jetzt mit „Wartet auf dich" für Bestätigungen und der Zahl der Karten vom Haus). Die Agenda ist im **Kalender** die vierte Ansicht „Liste"
- **Gemeinsame Kopfzeile.** Auf allen vier Reitern links „‹ Dashboard" (im Add-on), rechts Offline-Hinweis und dein **Avatar**, der die Einstellungen öffnet. Das Zahnrad entfällt. **Personenbilder:** aus Home Assistant (über Stups, nie direkt im Browser) oder selbst hochgeladen; Administratoren ändern sie auch für andere
- **Zuhause** zeigt den Zustand der Wächter: wartet auf jemanden (mit **Stupsen**), läuft gerade, bald dran (Zähler, nächster Termin), ruhig; ohne Verbindung zu Home Assistant steht seit wann
- **Wächter aus Vorlagen.** „Gefunden" erkennt in Home Assistant, wozu ein Wächter passt (Waschmaschine, Trockner, Spülmaschine, Abfallkalender, Regen, Batterien, Saugroboter), mit Begründung. Das Formular ist ein **Satz mit antippbaren Feldern**, dazu ein **Probelauf** auf den letzten 7 Tagen („3 Auslösungen erkannt, kein Fehlalarm"). Neue Auslöser: **Termin im Kalender mit Vorlauf** und **Regen in der Vorhersage** (Abfrage alle 30 Minuten). Vorlagen ohne Gerät legen wiederkehrende Karten an (Entkalken, Rauchmelder testen, Filter wechseln, Bettwäsche)
- **Weitergeben, Erst vorschlagen, Wenig Zeit.** Weitergeben schickt eine Karte vom Haus an die nächste Person der Rotation. „Erst vorschlagen" fragt alle Anwesenden „Wer übernimmt?", wer zuerst tippt, bekommt sie, nach 30 Minuten greift der Rückfall. Wer **wenig Zeit** hat (bis zu 90 Tage), wird von den Rotationen übersprungen
- **Einstellungen** sind eine gegliederte Seite mit Unterseiten: Für mich (Benachrichtigungen, Sprache und Farbe, Konto), Haushalt (Personen und Kinder, Wächter, Vorlagen, Termine), Home Assistant (Dashboard und Kopfzeile, Ansage und Lampe), Hilfe und Daten (Warum kommt nichts an?, Papierkorb, Archiv, Umzug, Beta). Nichts ging verloren; Mitglieder sehen „Haushalt" und „Home Assistant" nicht. Version und Diagnose-Seite stehen am Fuß
- **Farben:** Türkis ist die Farbe für alles, was vom Haus kommt; der Farbkreis lässt Grün und Türkis aus. Überschriften in einer eigenen Schrift (lokal im Add-on, kein Download)
- Datenbank: Migration 20 (vorher wie immer eine Sicherung). Die Desktop-Fassung folgt später. Am echten Haus abzuhaken: Testliste, Abschnitt 29

## 1.17.0-beta.1

- **Fairness.** Agenda › „Termine | Fairness": wer diese Woche oder diesen Monat wie viel erledigt hat, als Balken für den **Aufwand**. Jede Karte hat einen optionalen Aufwand (klein, mittel, groß; ohne Angabe wie mittel). **Keine Rangliste**: keine Plätze, keine Medaillen, die Reihenfolge ist die der Personenliste. Wer mag, schaltet bei sich eine **Zusammenfassung am Sonntagabend** ein (aus, bis du sie einschaltest, nie bei null)
- **Rolle Kind.** Personen & Zugriff › Person › „Rolle Kind" (nur Administratoren). Ein Kind sieht alle Boards oder nur die mit eigenen Karten und kann eigene Karten abhaken, kommentieren, Fotos und Links anhängen, sonst nichts; der **Server** verweigert alles andere. Die App zeigt ihm eine reduzierte Oberfläche
- **Bestätigung.** Je Kind einschaltbar, je Karte überschreibbar: Das Kind hakt ab, die Karte **wartet auf Bestätigung**, die Erwachsenen bekommen **Bestätigen / Nochmal** (in der Nachricht oder in der Karte). Bestätigt zählt sie **für das Kind**; „Nochmal" gibt sie zurück, mit Ansage im Haus, wenn ein Haus-Kanal da ist. Unbeantwortet erinnert Stups nach zwei Stunden, höchstens einmal am Tag
- **Board-Vorlagen.** Beim Anlegen eines Boards leer oder aus einer Vorlage starten (Haushalt, Umzug, Renovierung, Urlaub packen, Baby kommt, Ideen und Unternehmungen) mit Vorschau. Eigene Boards lassen sich als Vorlage speichern
- Datenbank: Migrationen 17 bis 19 (vorher wie immer eine Sicherung). Ohne Kinder, Vorlagen und Sonntagsnachricht ändert sich für niemanden etwas
- Am echten Haus abzuhaken: Testliste, Abschnitte 26 bis 28

## 1.16.0-beta.1

- **Stups ins Haus.** Ein Stups (und wenn du magst eine Fälligkeits-Erinnerung oder eine Wächter-Karte) kann im Haus ankommen: als **Ansage über einen Lautsprecher** („Ben, Anna stupst dich: Müll rausbringen. Denkst du dran?") oder als **Lampe, die fünf Sekunden in der Akzentfarbe der Person leuchtet** und danach wieder so ist wie vorher. Gedacht für Kinder ohne Handy. Nur mit Home Assistant
- **Einrichten (Administratoren):** Einstellungen › Personen & Zugriff. Oben einmal den Sprachdienst wählen (Gruppe „Haus"), dann bei jeder Person unter „Haus" Kanäle hinzufügen (Lautsprecher oder Lampe aus einer Liste aus Home Assistant). Jeder Kanal ist einzeln ein- und ausschaltbar und hat einen „Testen"-Knopf
- **Je Kanal wählbar:** welche Nachrichten ankommen (Stupse, Fälligkeiten, Wächter-Karten; neu ist nur „Stupse" an), eine Lautstärke für die Ansage (danach geht der Lautsprecher auf die vorherige zurück) und **was geschieht, wenn die Person nicht zu Hause ist**: verwerfen oder warten, bis sie heimkommt (mit Frist, ist die Karte inzwischen erledigt oder der Stups beantwortet, entfällt die Nachricht)
- Die **Ruhezeit** der Person gilt: Stupse warten bis zu ihrem Ende, Erinnerungen und Wächter-Karten entfallen. „Zu Hause" kommt von der Person in Home Assistant (über den Benutzer oder den Namen); passt keine, gilt die Person als zu Hause
- Wer nur einen Haus-Kanal hat, lässt sich trotzdem stupsen und bekommt Karten zugewiesen. Die Push-Übersicht (Einstellungen › Benachrichtigungen) zeigt jeden Kanal mit dem letzten Ergebnis
- **In der Beta bleiben die Haus-Kanäle still, bis Push eingeschaltet ist** (Einstellungen › Beta), damit nichts doppelt angesagt wird: Ansage und Lampe laufen sonst in der Beta und der normalen App gleichzeitig
- Die Anleitung beschreibt ehrlich, was nur dein Lautsprecher entscheidet (laufende Musik) und was nicht (Lampen ohne Farbe leuchten weiß). Am echten Haus musst du es selbst abhaken: Testliste, Abschnitt 24
- Datenbank: zwei neue Tabellen für die Kanäle und die Warteschlange (Migration 16, vorher wie immer eine Sicherung)

## 1.15.0-beta.2

- **Personen & Zugriff öffnet sich sofort.** Ohne Verbindung zu Home Assistant (eigener Container) wartete die Schnittstelle bei jedem Öffnen auf einen Home Assistant, den es nicht gibt, und brauchte je nach Rechner 2 bis 3 Sekunden. Jetzt antwortet sie in wenigen Millisekunden. In der App mit Home Assistant ändert sich nichts
- **Fehler behoben: „Für die nächste Karte übernehmen".** Wer zwei Häkchen schnell hintereinander setzte, konnte das erste wieder verlieren, wenn der Server langsam antwortete. Die Häkchen werden jetzt der Reihe nach gespeichert und die Anzeige folgt sofort deinem Tipp
- Unter der Haube: Die Browser-Tests laufen stabil und in 8 statt 12 Minuten (ein Test ließ Browser-Fenster offen, zwei Tests hingen von der Tageszeit ab: kurz vor Mitternacht landete eine Karte „fällig in 30 Min." in „Geplant")

## 1.15.0-beta.1

- **Eigene Farbe.** Einstellungen › Farbe: ein Farbkreis, auf dem du deinen Lieblingsfarbton antippst oder ziehst. Knöpfe, aktiver Reiter, Plus-Knopf und farbige Schrift folgen sofort. Die Farbe gilt für dich auf allen Geräten, jede Person wählt ihre eigene; „Orange (Standard)" stellt das bisherige Aussehen wieder her. Die Farben werden für Hell und Dunkel einzeln berechnet, die Schrift auf den Knöpfen bleibt bei jedem Farbton gut lesbar (bei hellem Grün und Türkis wird sie dunkel). Die Dringlichkeitsbalken an den Karten (rot, orange, gelb) bleiben, wie sie sind
- **Der Plus-Knopf legt immer in „Offen" an**, auch wenn gerade „Erledigt" oder „In Arbeit" geöffnet ist. Wählst du einen Termin nach heute, landet die Karte in „Geplant". Am Desktop gibt es nur noch den einen orangen Plus-Knopf statt eines Knopfes je Spalte, wie auf dem Handy
- Datenbank: eine neue Spalte für den Farbton der Person (Migration 15, vorher wie immer eine Sicherung)

## 1.14.0-beta.1

- **Stups gibt es jetzt auf Englisch.** Meldet dein Gerät (iPhone, Browser) Englisch, zeigt Stups die Oberfläche auf Englisch: Board, Karten, Agenda, Kalender, Wächter, Einstellungen, Hinweise. **Ein deutsches Gerät sieht weiter Deutsch, es ändert sich nichts.** Einstellungen › Sprache: „Automatisch“, „Deutsch“ oder „English“, gilt für dich auf allen Geräten, der Wechsel wirkt sofort
- Die **Schnell-Eingabe** versteht Englisch: `Take out trash tomorrow 7pm @Ben #Home every week !!`, auch `in 3 days`, `next Monday`, `Dec 1`, `1st December`, `at 18:30`, `every 2 weeks`, `important`
- Zeiten, Datum und Wochentage folgen der Sprache (24-Stunden-Zeit und Wochenbeginn Montag bleiben)
- **Push-Nachrichten, Tageszusammenfassung, Stupse und Fehlermeldungen** kommen in der Sprache der Person. Der Server merkt sich die Sprache, die dein Gerät zuletzt gemeldet hat (oder deine Wahl in den Einstellungen). **Wer noch keine Sprache gemeldet hat, bekommt Push weiter auf Deutsch**, bis die App einmal geöffnet wurde. Stups-Vorlagen („Denkst du dran?") erscheinen beim Empfänger in dessen Sprache, eigene Texte bleiben, wie sie geschrieben wurden
- Ein neues Board und das erste Board einer neuen Installation bekommen ihre Spalten („Open", „Planned", „In progress", „Done") in der Sprache der Person; bestehende Boards und Namen, die du vergeben hast, bleiben
- Die Notizen der Wächter-Läufe („erste Person zu Hause", „Sperrzeit 10 Min.") erscheinen in der Sprache der Oberfläche; auch die Optionen der App in Home Assistant gibt es auf Englisch
- Die Namen der Home-Assistant-Sensoren (zum Beispiel „… überfällig") bleiben vorerst deutsch
- Datenbank: zwei neue Spalten für die Sprache der Person (Migration 14, vorher wie immer eine Sicherung)
## 1.13.1-beta.1

- **Zahnrad für die Einstellungen.** Oben rechts in der Kopfzeile jedes Reiters (Boards, Agenda, Kalender, Wächter) sitzt jetzt ein dezentes Zahnrad ohne Rahmen. Ein Tipp öffnet die Einstellungen; der Weg über den Board-Namen bleibt. Die Kopfzeile wird dadurch nicht höher
## 1.13.0-beta.1

- **Live-Sync schlanker.** Ändert jemand eine Karte, meldet der Server jetzt auch, welche, und die anderen Geräte holen nur diese Karte nach statt das ganze Board. Auf einem Board mit 300 Karten sind das für eine Änderung 1,1 KB statt 210 KB. Bei allem anderen (Boards, Spalten, Kategorien, Personen, Stupse, Wächter, Kosten) und nach einem Verbindungsabbruch lädt die App wie bisher alles neu
- Neue Schnittstelle `GET /api/cards?ids=…` (höchstens 50 Karten auf einmal)

## 1.12.0-beta.1

- **Unter der Haube umgebaut, für dich ändert sich nichts.** Der Datenteil (`store.ts`, vorher 2.900 Zeilen) und die Schnittstelle (`api.ts`, vorher 900 Zeilen) sind nach Themen in kleinere Dateien aufgeteilt (Personen, Boards, Karten, Erledigen, Stupse, Wächter, Papierkorb …). Es ist dieselbe Logik, nur woanders abgelegt; ein Test hält fest, dass Store und API genau dieselben Methoden und Routen anbieten wie vorher. Grundlage für die nächsten Schritte (Live-Sync mit Änderungen)
## 1.11.0-beta.1

- **Schnell-Eingabe.** Im Fenster „Neue Karte" wird aus einer Zeile eine fertige Karte: `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!` ergibt Titel „Müll raus", fällig morgen 19:00, zuständig Ben, Kategorie Haushalt, wöchentlich, Priorität hoch. Erkannte Teile sind im Text farbig hinterlegt, darunter zeigen Chips, was Stups verstanden hat. Ein Tipp auf einen Chip nimmt ihn zurück (zum Beispiel, wenn „Montag" zum Titel gehört)
- Erkannt werden: Datum (heute, morgen, übermorgen, Wochentage, „nächsten Montag", „in 3 Tagen", „in einer Woche", „1.12.", „1. Dezember"), Uhrzeit („19 Uhr", „19:30", „um 19"), Wiederholung („jeden Tag", „jede Woche", „alle 2 Tage", „jeden Montag", „monatlich", „jährlich"), `@Person`, `#Kategorie` und Priorität (`!` mittel, `!!` oder „wichtig" hoch)
- Eine unbekannte Person sperrt das Anlegen (sonst gäbe es keine Erinnerung); eine neue Kategorie wird nach Rückfrage angelegt. Was du von Hand änderst, überschreibt die Schnell-Eingabe nicht mehr
- Neue Einstellung **Standard-Uhrzeit für Termine** (Einstellungen › Vorgaben, Vorgabe 09:00) für ein Datum ohne Uhrzeit
## 1.10.0-beta.2

- **Agenda: Karten, die weiter als 60 Tage entfernt sind, fehlten**, und bei leerer Liste gab es keinen Knopf „Weitere 60 Tage laden". Jetzt steht der Knopf auch bei leerer Liste (mit dem Hinweis, bis wann geladen ist), und liegt im ersten Zeitraum gar nichts an, schaut die Agenda gleich ein Jahr voraus
## 1.10.0-beta.1

- **Kompakte Karten im Board.** Titel (höchstens zwei Zeilen) und eine Zeile mit allem Wichtigen: Termin (rot, wenn überfällig), Wiederholung, Priorität als Flagge, Checkliste „1/2", Kommentare, Links, Anhänge und Kosten. Kategorien erscheinen als kleine Punkte. „Angelegt vor …" steht nur noch im Karten-Fenster. Auf einem iPhone 15 passen so mindestens vier, meist fünf Karten auf den Bildschirm
- Der „+"-Knopf verdeckt nichts mehr: Die letzte Karte lässt sich darüber hinaus scrollen
- Spalten-Tabs und Filter-Chips zeigen mit einem Verlauf am Rand, dass man wischen kann, und die aktive Auswahl rückt von selbst ins Bild
- Im Karten-Fenster heißt der Knopf oben rechts **„Fertig"** statt „Speichern" (es speichert schon alles sofort; „Gespeichert" erscheint wie bisher)
- Einheitliche Auswahlfelder (Wächter, Wiederholung, Einstellungen, Erinnerung): Wert und Pfeil im Stil der übrigen Zeilen, der Picker des Handys bleibt
## 1.9.0-beta.2

- Der Start meldet im Protokoll, ob ein Umzug gefunden wurde: Fehlt der Export, steht dort, welche Datei gesucht wurde und was in /share liegt (Hilfe, wenn eine neue App leer startet).

## 1.9.0-beta.1

- Erste Beta-Version. Eigene Daten, Push und Wächter zunächst aus (Einstellungen › Beta), eigene Namen für Push, Sensoren und Ereignisse.
