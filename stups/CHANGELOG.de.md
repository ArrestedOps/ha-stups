# Änderungen

> 🇬🇧 [English version](CHANGELOG.md) · Die englische Fassung ist maßgeblich.

## Unreleased

- **Neues Design.** Stups wirkt ruhiger und mehr wie eine iPhone-App: flaches Orange statt leuchtender Verläufe, gruppierte Listen mit feinen Linien, eine schwebende Leiste (Aufgaben · Boards · **+** · Kalender · Wächter) und vier Zahlenkacheln bei Aufgaben. Das Board steht in jeder Zeile als farbiger Punkt mit Namen; der Erledigt-Kreis bleibt neutral. Der dunkle Modus folgt denselben Regeln, der Kontrast jedes Farbpaars wird getestet.
- **Stups-Karte bei Aufgaben.** Hat dich jemand angestupst, antwortest du direkt oben: **Erledigt**, **Mach ich** oder **Später**. Nach der Antwort verschwindet die Karte, die Zeile behält eine leise Spur mit **Rückgängig**.
- **Kalender.** Tag, **3 Tage** (Standard auf dem Handy, Wischen blättert), Woche und Monat. Am Desktop hat der Kalender einen eigenen Eintrag in der Seitenleiste.
- **Wächter als Seiten.** Jede Kategorie öffnet als eigene Seite, bei allen gleich, mit Suche, Filter (Alle · Aktiv · Aus) und „Mehr anzeigen“ bei großen Kategorien wie Batterien.
- **Wischen bei Aufgaben (Handy).** Nach rechts wischen erledigt, nach links liegen **Später** (Termin auf morgen) und **Löschen** bereit.
- **Desktop.** Seitenleiste mit den Ansichten (Alle offen, Gestupst, Heute, Überfällig, Diese Woche, Erledigt), Boards, Mehr und Personen; Aufgaben als Tabelle mit Stups-Leiste und Schnellzeile; Kalender mit Mini-Monat und Board-Auswahl; Wächter mit Auswahl links (Alle, Mit Problem, Wartet, Läuft gerade, Kommt bald, Pausiert, Kategorien); Befehlspalette (**Strg/Cmd+K**), **/** fokussiert das Filterfeld, **G** dann **T / B / C / W** wechselt die Seite.
- **„Karte“ heißt jetzt „Aufgabe“** überall (App, Nachrichten, Anleitung).
- **Suche am Handy** unter dem Titel bei Aufgaben.
- **Aufgaben-Details.** Die Eigenschaften stehen jetzt als gruppierte Liste (Fällig, Zuständig, Wiederholung, Erinnerung, Priorität, …) mit dem Wert rechts; ein Tipp auf die Zeile öffnet darunter das Feld. Am Handy folgen unter der Liste ein großer Knopf **Erledigt** und **Auf morgen verschieben**, ein Stups an dich erscheint als orange Karte mit den drei Antworten. Am Desktop füllen die Details die ganze Höhe rechts neben der Liste.
- **Neuer Wächter-Assistent.** Vorlagen als Liste mit Symbol und einer Zeile Erklärung, eine einzige Fortschrittsleiste („Schritt 2 von 4“) und ein schlichtes „Zurück“ in der Kopfzeile.
- **Einstellungen, Mitteilungen und Startseiten.** Zeilen der Einstellungen sind einzeilig mit dem Wert rechts und **Fertig** oben rechts; Mitteilungen sind eine gruppierte Liste mit **Alle als gelesen markieren** unten; „Noch kein Zugriff“ und die Anmeldung kommen ohne Leuchten aus. Wächter-Kategorien haben ein **…**-Menü (alle pausieren, alle aktivieren, neuer Wächter in der Kategorie); der letzte Schritt des Assistenten beginnt mit einer kurzen Zusammenfassung WENN / DANN / WER.
- **Zeilen am Handy.** Aufgaben und Karten im Board zeigen jetzt immer, wem sie zugeordnet sind: als Bilder und mit Vornamen in der Zeile darunter, neben Datum und Kategorie. Der Kalender bekommt am Handy denselben Kopf wie alle Reiter (Logo, Home Assistant, Glocke, Einstellungen). Am Desktop schneidet die Kopfzeile der Seitenleiste das Zahnrad nicht mehr ab und scrollt nicht mehr zur Seite.
- **Wächter am Desktop.** Wächter sind eine eigene Gruppe in der Seitenleiste (unter Boards und Kalender) mit den Filtern (Mit Problem, Wartet, Läuft gerade, Kommt bald, Pausiert) und den Kategorien. Die Seite ist eine Tabelle in voller Breite mit gleich hohen Zeilen; ein Klick klappt den ganzen Ablauf (Wenn, Dann, Wer, Erledigt sich selbst) direkt unter der Zeile auf, dort lässt er sich bearbeiten und speichern, statt in einem Fenster. „Aktivität“ ist ein Reiter neben „Wächter“ mit derselben Tabelle.
- **Lange Wächternamen.** Der Name bekommt in der Tabelle den meisten Platz: Die Bedingung steht jetzt in der Zelle des Namens (zweite Zeile, neben dem Gerät), und ein langer Name bricht auf zwei Zeilen um, statt abgeschnitten zu werden. Die Seitenleiste zeigt jedes Board mit dem Symbol aus den Board-Einstellungen, in der Farbe des Boards.
- **Aufgaben am Desktop klappen auf.** Ein Klick auf eine Aufgabe öffnet sie direkt unter ihrer Zeile, in zwei Spalten (links die Eigenschaften, rechts Beschreibung, Checkliste, Links und Kommentare), wie bei den Wächtern. Ein zweiter Klick, Esc oder der Schließen-Knopf klappen sie wieder zu. Die Detailspalte rechts entfällt, die Liste behält ihre volle Breite.
- **Handy: „Alle Wächter verwalten“ entfällt.** Im Reiter Wächter wird alles verwaltet (öffnen, ein- und ausschalten, hinzufügen), deshalb sind der zusätzliche Knopf und die Einstellungsseite dahinter weg. „Wächter aus Vorlagen“ steht jetzt neben „Neuer Wächter“ im Reiter Wächter.
- **Wächter lösen beim Anlegen gleich aus.** Gilt die Bedingung schon, wenn du einen Wächter anlegst (Batterie steht bei 16 % und die Grenze ist 20 %, die Tür ist schon im Zielzustand), entsteht die Aufgabe sofort (bei einem Pegel wie einer Batterie ohne Wartezeit, weil sich ein Handy-Akku ständig ändert; bei einem Zustand wie einer Tür nach der Wartezeit ab der letzten Änderung). Beim Ändern eines vorhandenen Wächters fragt die App weiterhin zuerst. Im aufgeklappten Wächter am Desktop stehen die vier Schritte (Wenn, Dann, Wer, Erledigt sich selbst) jetzt untereinander; Ändern bringt das Layout nicht mehr durcheinander.
- **Desktop: „Ansicht für“ und die neue aufgeklappte Aufgabe.** Die Personen stehen nicht mehr unten in der Seitenleiste: Ganz oben gibt es das Feld **Ansicht für** (Alle, du, die anderen). Es gilt für Aufgaben **und** Wächter; ein Chip wie „Nur Ben ✕“ neben dem Titel zeigt, was gefiltert ist. Eine geöffnete Aufgabe zeigt ihre Eigenschaften als Raster aus Feldern (Beschriftung oben, Wert darunter) statt der langen Liste, links Notiz, Checkliste (mit Fortschritt) und Links, rechts Kommentare und Verlauf als Reiter.

## 1.41.1

Korrekturen nach einer Durchsicht. Keine neuen Funktionen.

- **Datenschutz.** „Symbole aus Titeln erkennen“ zeigte Administratoren die Titel von Karten aus fremden privaten Boards und konnte dort Symbole setzen. Beides gilt jetzt nur noch für Boards, die man selbst sehen darf.
- **Zuletzt erledigt** zeigt heute Erledigtes auch dann, wenn die Karte vor Wochen fällig war oder nie einen Termin hatte. Gefragt wird nach dem Erledigungsdatum, nicht nach der Fälligkeit.
- **Handys in der Einrichtung.** Das letzte Handy lässt sich wieder abwählen und wird auch so gespeichert. „Ann“ findet kein Handy „Annas iPhone“ mehr, und ein Gerät, das zum Namen von zwei Personen passt, wird keiner von beiden vorgewählt. Ein Kind kann in der Einrichtung die Testnachricht an das eigene Handy senden; das Handy eintragen bleibt Sache eines Erwachsenen, und der Text sagt das. Der Fehlertext heißt „Die Testnachricht konnte nicht gesendet werden“ und nennt den Grund; die Abschlussseite verspricht „Ab jetzt meldet sich dein Zuhause von selbst“ nur, wenn ein Wächter eingerichtet wurde.
- **Gleichzeitig arbeiten.** „Rückgängig“ nach „Überfällige verschieben“ setzt nur Karten zurück, deren Termin noch so dasteht, wie das Verschieben ihn hinterlassen hat. Hat jemand inzwischen einen anderen Termin gesetzt, bleibt dessen Entscheidung, und Stups sagt es. „Alle auf heute/morgen/Wochenende“ und „Morgen“ schreiben mit der Version, die die Liste gesehen hat: Eine inzwischen geänderte Karte bleibt, wie sie ist, und die Meldung sagt, dass sie sich nicht verschieben ließ. Ein Fehler bei einer Karte bricht die übrigen nicht mehr ab.
- **Aufgaben laden schneller und vollständig.** Die Terminliste wurde bei 2000 Karten still abgeschnitten. Sie kommt jetzt seitenweise und vollständig; bei 6000 Karten braucht der Server dafür etwa ein Drittel der Zeit. Schnell aufeinander folgende Änderungen laden einmal statt mehrfach nach, und überholte Anfragen werden abgebrochen.
- **Das Docker-Image läuft nicht mehr als root.** Ohne Home Assistant übergibt ein kleiner Einstiegspunkt den Datenordner an den Benutzer `node` (Benutzerkennung 1000) und startet Stups als diesen Benutzer. Bestehende Daten und ein neues Volume funktionieren beide; Ordner, die sich nicht übergeben lassen (Netzlaufwerk), laufen wie bisher als root, mit Hinweis im Protokoll. **Im Home-Assistant-Add-on ändert sich nichts**: Es bleibt root, wie jedes Add-on.
- **Kleineres.** Kalender und Aufgaben ordnen Karten kurz vor und nach Mitternacht dem richtigen Tag zu. Importzyklen zwischen Dateien in Server und Oberfläche sind aufgelöst, ein neuer Test lässt künftig keine mehr zu.

## 1.41.0

- **Einrichtung beim ersten Start.** Wer Stups zum ersten Mal öffnet, wird als Administrator in etwa drei Minuten durch die Einrichtung geführt: **Wer wohnt hier?** (die Personen aus Home Assistant sind vorgewählt, Handys erkennt Stups nach der Zuordnung von Home Assistant selbst, wer kein Handy hat, bekommt einen Link zur Companion App, du legst fest, wer ein Kind ist), **Dein erster Wächter** (dieselbe „Gefunden“-Liste und derselbe Assistent wie unter Wächter), **Testnachricht** (ein echtes Beispiel der Nachricht zu einer neuen Aufgabe, mit Vorschau wie auf dem iPhone) und **Fertig**. Jeder Schritt lässt sich überspringen; der Stand liegt auf dem Server, ein Abbruch lässt sich auf einem anderen Gerät weiterführen. Mitglieder sehen eine Kurzfassung. Bestehende Installationen zeigen sie nicht von selbst; sie lässt sich jederzeit unter *Einstellungen › Hilfe und Daten › Einrichtung nochmal durchgehen* öffnen (nicht für Kinder).
- **Optionen in der App.** Personen, Push-Geräte, Zugriff, Dashboard und die zwei Uhrzeiten stellst du jetzt in der App ein, nicht mehr in der Konfiguration von Home Assistant. Beim ersten Start nach dem Update übernimmt Stups, was dort eingetragen ist, einmal und entfernt niemanden; danach gilt die App, und Änderungen in der Konfiguration wirken nicht mehr (auch Personen und Zugriff sind nicht mehr gesperrt). Neu: **Einstellungen › Erinnerungszeiten** (für Administratoren und Personen mit dem Recht „App-Einstellungen“, wo Push verfügbar ist) mit der Tageszusammenfassung und **Nachhaken um …** (Standard 18:00), bisher nur als Option einstellbar. Neue Installationen sehen in der Konfiguration nur noch das Log-Level und die leere Personenliste; die übrigen Optionen erscheinen mit dem Schalter „Show unused optional configuration options“. In Docker ändert sich nichts außer der neuen Einstellung, die dort Vorrang vor `STUPS_OVERDUE_NAG_TIME` hat.
- **Schnellerer Start, besonders unterwegs.** Beim Start werden rund 198 kB (komprimiert) geladen statt 369 kB: Selten gebrauchte Fenster, der Wächter-Reiter, der englische Text und die Suchwörter der Symbole laden erst bei Gebrauch. Die Schrift Inter hat nur noch die lateinischen Zeichen (kyrillische, griechische und vietnamesische erscheinen in der Systemschrift). Das Docker-Image ist schlanker.
- **Anleitung neu geordnet.** „Erste Schritte“ und „Wenn etwas nicht klappt“ stehen oben, die Seitennamen stimmen mit der App überein, die veralteten Optionen des Add-ons stehen unten. Der Changelog ist getrennt nach Sprache (`CHANGELOG.md` englisch, `CHANGELOG.de.md` deutsch).
- **Kleinere Korrekturen.** Das Namensfeld in den Board-Einstellungen wird beim Tippen nicht mehr zurückgesetzt. Der Code ist in kleinere Teile aufgeteilt (Wächter, API, Oberfläche), an der App ändert sich dadurch nichts.
- Datenbank: **Migration 30** (Stand der Einrichtung), vorher wie immer mit Sicherung.

## 1.27.1

**Links öffnen im Handy-Browser.** Ein Link an einer Aufgabe öffnet jetzt in einem neuen Tab bzw. im Standardbrowser des Handys, statt in einem schwarzen Fenster innerhalb der App.

## 1.27.0

- **Private und geteilte Boards.** Jedes Board ist für „Nur ich“, „Alle in Stups“ oder „Ausgewählte Personen“ sichtbar. Ein privates Board sieht sonst niemand, auch kein Administrator; der Server blendet es überall aus (Aufgaben, Heute, Kalender, Mitteilungen, Anhänge, Sensoren, Live-Sync). Bestehende Boards bleiben für alle sichtbar. Kinder können „Nur ich“-Boards anlegen.
- **Fairness je Board.** Ein Schalter bestimmt, ob ein Board zur Fairness der Woche zählt (private nie; auch rückwirkend). Wächter haben einen eigenen Schalter.
- **Wächter wissen, wer zuständig sein darf.** Zur Auswahl stehen nur Mitglieder des Boards, private Boards sind als Ziel nicht möglich, und wer ein Mitglied entfernt, sieht vorher alle betroffenen Wächter. Bleibt ein Wächter ohne Zuständige, steht er rot ganz oben in der Liste („braucht neue Zuständige“) und legt keine Aufgaben an, bis jemand gewählt ist; die Glocke sagt es den Richtigen.
- **Glocke mit kleiner Zahl** statt Punkt. Wächter heißen wie ihre Vorlage; erzeugte Aufgaben bekommen die Entität dazu („Batterie wechseln: Nuki Türschloss“).
- **Wiederholung ohne Termin, stündlich, und kleine Verspätung ist okay.** Die Wiederholungs-Zeile ist immer antippbar, „Stündlich“ (auf Wunsch nur in einem Zeitfenster) ist neu, und wöchentliche/monatliche Regeln dürfen ein paar Tage zu spät erledigt werden. Jede Option zeigt ein Beispiel live.
- **Sich selbst stupsen.** „Nochmal erinnern, wenn nicht erledigt“ an Aufgaben (nach X, alle X wiederholen, höchstens N ×; nur für dich). Wächter können die Zuständigen nach einer Zeit stupsen, wiederholt, mit Höchstzahl.
- **Boards: Auswahl, Einstellungen, Löschen, Archivieren, Duplizieren.** Die Board-Liste zeigt nur Boards; darunter „Neues Board“, „Board-Einstellungen“ (Name, Symbol, wer sieht es, Fairness, Spalten …) und „Archivierte Boards“. Beim Löschen stehen Aufgaben, wiederkehrende Aufgaben, Wächter und Erinnerungen in der Liste, und je Wächter wählst du Pausieren, Umziehen oder Löschen. Boards lassen sich archivieren, duplizieren und als Vorlage speichern; die Reihenfolge ist änderbar.
- **Beta-Marke** neben dem Logo, nur in der Beta-App.
- **Von selbst wieder online.** Nach dem Schlafen des Handys verbindet sich die App sofort neu und bleibt nicht mehr auf „Offline“ hängen.
- Datenbank: **Migrationen 27 bis 29** (Sichtbarkeit und Fairness der Boards, Erinnerungen, archivierte Boards), vorher wie immer mit Sicherung.

## 1.26.0

- **Desktop-Ansicht (ab 1024 px Breite).** Eine feste Seitenleiste ersetzt die Leiste unten (Reiter, Boards, Nutzeraufgabe), die Kopfzeile hat Suche (Strg/Cmd + K), „Neue Aufgabe“, Home und Glocke. Aufgaben öffnen in einer Detailspalte rechts, Boards sind ein Kanban über die volle Breite, Wächter eine Tabelle. Fenster öffnen als Dialog in der Mitte. Handy und Companion App sehen aus wie bisher, Tablets zeigen die Handy-Ansicht zentriert.
- **Wächter: alle Wächter stehen immer da**, nach **Kategorie** sortiert (beim Anlegen vorgeschlagen oder eigene), zuklappbar, jeder mit **Schalter an/aus**. Laufende stehen oben. Auf dem Desktop ist es eine Tabelle mit Bedingung, Stand, Status, letzter Auslösung, nächster Aufgabe und Zuständigen. Einen Wächter anlegen ist am Desktop **ein Formular, das über der Liste aufklappt**; am Handy bleibt der Assistent, jetzt mit „Zurück“ in jedem Schritt.
- **Wächter: das Gerät steht im Namen** („Batterie schwach: iPhone Rene“), bestehende zeigen den Friendly Name der Entität unter dem Titel und den aktuellen Stand oben rechts; ein Knopf ergänzt das Gerät in alten Namen (nur mit deiner Zustimmung).
- **Wächter: „Gefunden“ schlägt alle passenden Geräte vor**, nach Vorlage gruppiert und mit Suche (nicht mehr höchstens fünf je Vorlage).
- **Wächter: Bedingung beim Anlegen schon erfüllt?** Pegel wie eine Batterie unter der Grenze legen die Aufgabe sofort an. Bei allem anderen fragt die App „Aufgabe jetzt erstellen?“. Behoben: Batterie-Wächter standen fälschlich unter „Läuft gerade“, und nach einem Update stand kurz bei allen Wächtern „Entität fehlt“.
- **Aufgaben: die drei Zahlen sind antippbar** und öffnen ein Blatt (heute fällig, überfällig mit „Morgen“ / „Alle verschieben“, heute erledigt mit Rückgängig). Die **Chips** heißen jetzt Alle, Meine, Personen; die App startet immer bei „Meine“.
- **Berechtigungen.** Ein Administrator kann einzelnen Personen gezielt Rechte geben (Wächter, Ansage und Lampe, App-Einstellungen, Personen, Bestätigen für Kinder, Feedback), ohne sie zu Administratoren zu machen.
- **Feedback.** Fehler melden, Verbesserungen vorschlagen, loben oder kritisieren, direkt in der App (Art, bis zu 1000 Zeichen, optional Bild); Administratoren lesen es unter Einstellungen › Hilfe und Daten. Alles bleibt auf deiner Installation.
- **Sicherheit und Robustheit.** Mehrere Härtungen (Anmeldung hinter Reverse Proxy, Uploads, Link-Vorschauen, Umzug-Export ohne Geheimnisse, Push-Aktionen nur für die zugewiesene Person), eine robustere Verbindung zu Home Assistant und eine vorsichtigere Datenbank-Migration. Update empfohlen.
- Datenbank: **Migrationen 24 bis 26** (Feedback, Berechtigungen, Wächter-Kategorien), vorher wie immer eine Sicherung.

## 1.25.1

- **Neues Design.** Drei Reiter: **Aufgaben, Boards, Wächter**. Die App öffnet immer auf Aufgaben. Aufgaben hat Zahlenleiste, Wochenleiste, das Stups-Banner, Personen-Chips mit ihren Bildern, ein Filter-Blatt und Gruppen (Überfällig, Heute, Diese Woche, Später). Der Kopf hat **Home** (zurück zu Home Assistant), **Mitteilungen**, **Einstellungen** und dein Bild. Alle Listen nutzen eine Zeile: runder Haken, **Symbol-Kachel**, Titel, Datum • Kategorie • Priorität, rechts die Personen
- **Symbol pro Aufgabe.** Rund 300 Symbole mit deutschen und englischen Suchwörtern; Stups wählt eines aus dem Titel (Funken-Abzeichen). Die Wahl im Blatt mit Suche, Vorschlägen, zuletzt benutzt und Farbe. Neues Blatt für Datum und Uhrzeit. In Einstellungen › Symbole lässt du Stups Symbole für vorhandene Aufgaben erkennen
- **Filter.** Ein Filter für Aufgaben und Kalender: Wer, Wann (auch mehrere zugleich), Boards, Priorität, nur mit offenem Stups, nur von Wächtern, Erledigte anzeigen, Sortierung. Er bleibt pro Gerät erhalten
- **Mitteilungen (Glocke).** Ein echter Posteingang pro Person mit Gelesen-Markierung, „Alle gelesen“ und Filtern. Der **Home**-Knopf bringt dich zu deinem Dashboard, das jede Person unter Einstellungen › Home Assistant selbst wählt (vorausgewählt: dein Standard-Dashboard aus Home Assistant)
- **Wächter.** Der Editor ist ein Ablauf (Wenn → Dann Aufgabe → An wen → Erledigt sich selbst) mit dem **Verlauf der Entität** (letzte 3 Stunden, Schwelle, Auslösepunkte). Ein Assistent in vier Schritten legt neue an; „reihum“ ist vorausgewählt. Lange Entitätsnamen brechen um
- **Alles Übrige im neuen Stil:** Kalender, Boards (Wechseln, Einstellungen, Archiv, Papierkorb), Einstellungen, Personen und Zugriff mit Push-Stand („x von y Geräten erreichbar“), Dashboard-Button, Anmelden und Konto, Dialoge. Die Uhrzeit der Tageszusammenfassung stellst du in der App ein. Fast alle Kontrollkästchen sind jetzt Schalter
- **Wischen** nach rechts = nächster Status, nach links = zurück. **Priorität** hoch leuchtet rot, mittel ist orange
- **Home Assistant 2026.8 und neuer:** Stups übernimmt die Sicherheitsabstände selbst: kein schwarzer Streifen oben oder unten, die Leiste reicht bis zum unteren Rand
- **Fehlerbehebungen:** eine Sicherheitslücke bei der Anmeldung im eigenen Container (codierte Pfade) und die Diagnose-Routen für Kinder; „Rückgängig“ bei einer wiederkehrenden Aufgabe löscht die nächste Aufgabe nicht mehr, wenn schon mit ihr gearbeitet wurde; offene Bestätigungs-Anfragen, die Spalte „Erledigt“, falsche Feldtypen und Grenzen bei Wiederholungen; Live-Sync nach dem Aufwecken des Handys; Meldungen beim Löschen und beim Zugriff
- Datenbank: **Migrationen 22 und 23** (vorher wie immer eine Sicherung)

## 1.18.2

- **Gefunden: Treffer ausblenden.** Bei jedem Treffer (Waschmaschine, Abfallkalender, Batterie …) gibt es **Ausblenden**. Was du nicht hast, schlägt Stups nie wieder vor, auch nicht nach einem Neustart. Unter **Ausgeblendet (n)** steht es mit **Wieder anzeigen**, falls du es doch brauchst. Gilt für alle Administratoren; der nächste Treffer derselben Art rückt nach
- Datenbank: Migration 21 (eine kleine Tabelle für das Ausgeblendete, vorher wie immer eine Sicherung)

## 1.18.1

- **Start immer auf „Heute".** Wer zuletzt unter Zuhause war, landete beim nächsten Öffnen wieder dort. Jetzt öffnet die App immer auf Heute; gemerkt werden nur Boards und Kalender
- **Zuhause: Wächter direkt öffnen.** Ein Tipp auf einen Wächter öffnet ihn. **Administratoren bearbeiten ihn dort** (Satz, Mehr Regeln, Testen, Pausieren, Löschen). **Alle anderen sehen ihn lesend:** Einstellungen und Verlauf, ohne Speichern und ohne Änderungen (der Server verweigert sie ohnehin)
- **Verlauf sichtbar.** Unten auf Zuhause steht die **letzte Aktivität** aller Wächter; im Wächter selbst der Verlauf seiner Läufe, älterer auf Wunsch. Die Zeile „Ruhig" ist jetzt eine Liste, jeder Eintrag antippbar
- Keine Änderung an der Datenbank

## 1.18.0

- **Neue Startseite „Heute".** Die Leiste unten heißt jetzt **Heute · Boards · Kalender · Zuhause**. Heute zeigt, was für dich dran ist: **Vom Haus** (Aufgaben von Wächtern, mit Auslöser, Zeit und Grund; Knöpfe **Erledigt**, **Weitergeben** und bei „Erst vorschlagen" **Übernehmen**), **Für dich** (deine Aufgaben mit Termin bis morgen) und eine Zeile **Bei den anderen**, die zu **Diese Woche** führt (die frühere Fairness-Ansicht, jetzt mit „Wartet auf dich" für Bestätigungen und der Zahl der Aufgaben vom Haus). Die Agenda ist im **Kalender** die vierte Ansicht „Liste"
- **Eine Kopfzeile auf jedem Reiter.** Links „‹ Dashboard" (in der App), rechts Offline-Hinweis und dein **Avatar**, der die Einstellungen öffnet (das Zahnrad entfällt). **Personenbilder:** aus Home Assistant (immer über Stups geholt, nie direkt vom Browser) oder selbst hochgeladen; Administratoren ändern sie auch für andere
- **Zuhause** zeigt den Zustand der Wächter: wartet auf jemanden (mit **Stupsen**), läuft gerade, bald dran (Zähler, nächster Termin), ruhig; ohne Verbindung zu Home Assistant steht seit wann
- **Wächter aus Vorlagen.** „Gefunden" erkennt in Home Assistant, wozu ein Wächter passt (Waschmaschine, Trockner, Spülmaschine, Abfallkalender, Regen, Batterien, Saugroboter), mit Begründung. Das Formular ist ein **Satz mit antippbaren Feldern**, dazu ein **Probelauf** auf den letzten 7 Tagen („3 Auslösungen erkannt, kein Fehlalarm"). Neue Auslöser: **Termin im Kalender mit Vorlauf** und **Regen in der Vorhersage** (Abfrage alle 30 Minuten). Vorlagen ohne Gerät legen wiederkehrende Aufgaben an (Entkalken, Rauchmelder testen, Filter wechseln, Bettwäsche)
- **Weitergeben, Erst vorschlagen, Wenig Zeit.** Weitergeben schickt eine Aufgabe vom Haus an die nächste Person der Rotation. „Erst vorschlagen" fragt alle Anwesenden „Wer übernimmt?", wer zuerst tippt, bekommt sie, nach 30 Minuten greift der Rückfall. Wer **wenig Zeit** hat (bis zu 90 Tage), wird von den Rotationen übersprungen
- **Einstellungen** sind eine gegliederte Seite mit Unterseiten: Für mich (Benachrichtigungen, Sprache und Farbe, Konto), Haushalt (Personen und Kinder, Wächter, Vorlagen, Termine), Home Assistant (Dashboard und Kopfzeile, Ansage und Lampe), Hilfe und Daten (Warum kommt nichts an?, Papierkorb, Archiv, Umzug, Beta). Nichts ging verloren; Mitglieder sehen „Haushalt" und „Home Assistant" nicht. Version und Diagnose-Seite stehen am Fuß
- **Farben:** Türkis ist die Farbe für alles, was vom Haus kommt; der Farbkreis lässt Grün und Türkis aus. Überschriften in einer eigenen Schrift (lokal in der App gebündelt, kein Download)
- Datenbank: Migration 20 (vorher wie immer eine Sicherung). Ohne Wächter ändert sich sonst für niemanden etwas

## 1.17.0

Diese Version fasst die Versionen 1.16.0 und 1.17.0 zusammen, die zuvor in der Beta-App liefen.

- **Stups ins Haus.** Ein Stups (und wenn du magst eine Fälligkeits-Erinnerung oder eine Wächter-Aufgabe) kann im Haus ankommen: als **Ansage über einen Lautsprecher** („Ben, Anna stupst dich: Müll rausbringen. Denkst du dran?") oder als **Lampe, die fünf Sekunden in der Akzentfarbe der Person leuchtet** und danach wieder so ist wie vorher. Gedacht für Kinder ohne Handy. Nur mit Home Assistant. Administratoren richten es unter Einstellungen › Personen & Zugriff ein (einmal den Sprachdienst, dann Kanäle je Person); jeder Kanal ist ein- und ausschaltbar, wählt, welche Nachrichten ankommen, und was geschieht, wenn die Person nicht zu Hause ist (verwerfen oder warten, bis sie heimkommt). Die Ruhezeit der Person gilt
- **Fairness.** Agenda › „Termine | Fairness": wer diese Woche oder diesen Monat wie viel erledigt hat, als Balken für den **Aufwand**. Jede Aufgabe hat einen optionalen Aufwand (klein, mittel, groß; ohne Angabe mittel). **Keine Rangliste:** keine Plätze, keine Medaillen, die Reihenfolge ist die der Personenliste. Wer mag, schaltet bei sich eine **Zusammenfassung am Sonntagabend** ein (aus, bis du sie einschaltest, nie bei null)
- **Rolle Kind.** Einstellungen › Personen & Zugriff › Rolle Kind (nur Administratoren). Ein Kind sieht alle Boards oder nur die mit eigenen Aufgaben und kann eigene Aufgaben abhaken, kommentieren, Fotos und Links anhängen, sonst nichts; der **Server** verweigert alles andere. Die App zeigt ihm eine reduzierte Oberfläche
- **Bestätigung.** Je Kind einschaltbar, je Aufgabe überschreibbar: Das Kind hakt ab, die Aufgabe **wartet auf Bestätigung**, die Erwachsenen bekommen **Bestätigen / Nochmal** (in der Nachricht oder in der Aufgabe). Bestätigt zählt sie **für das Kind**; „Nochmal" gibt sie zurück, mit Ansage im Haus, wenn ein Haus-Kanal da ist. Unbeantwortet erinnert Stups nach zwei Stunden, höchstens einmal am Tag. Ist niemand als Bestätiger gewählt, dürfen alle Erwachsenen bestätigen
- **Board-Vorlagen.** Beim Anlegen eines Boards leer oder aus einer Vorlage starten (Haushalt, Umzug, Renovierung, Urlaub packen, Baby kommt, Ideen und Unternehmungen) mit Vorschau. Eigene Boards lassen sich als Vorlage speichern
- Datenbank: neue Tabellen und Spalten für Haus-Kanäle, Vorlagen, Aufwand, Zusammenfassung und die Rolle Kind (Migrationen 16 bis 19, vorher wie immer eine Sicherung). Ohne Kinder, Vorlagen und Sonntagsnachricht ändert sich für niemanden etwas

## 1.15.0

Diese Version fasst die Versionen 1.13.1, 1.14.0 und 1.15.0 zusammen, die zuvor in der Beta-App liefen.

- **Stups gibt es jetzt auf Englisch.** Meldet dein Gerät (iPhone, Browser) Englisch, zeigt Stups die Oberfläche auf Englisch: Board, Aufgaben, Agenda, Kalender, Wächter, Einstellungen, Hinweise. **Ein deutsches Gerät sieht weiter Deutsch, es ändert sich nichts.** Einstellungen › Sprache: „Automatisch", „Deutsch" oder „English", gilt für dich auf allen Geräten, der Wechsel wirkt sofort
- Die **Schnell-Eingabe** versteht Englisch: `Take out trash tomorrow 7pm @Ben #Home every week !!`, auch `in 3 days`, `next Monday`, `Dec 1`, `at 18:30`, `every 2 weeks`, `important`. Zeiten, Datum und Wochentage folgen der Sprache
- **Push-Nachrichten, Tageszusammenfassung, Stupse und Fehlermeldungen** kommen in der Sprache der Person. Der Server merkt sich die Sprache, die dein Gerät zuletzt gemeldet hat (oder deine Wahl in den Einstellungen). **Wer noch keine Sprache gemeldet hat, bekommt Push weiter auf Deutsch**, bis die App einmal geöffnet wurde. Stups-Vorlagen erscheinen beim Empfänger in dessen Sprache, eigene Texte bleiben, wie sie geschrieben wurden
- Ein neues Board bekommt seine Spalten („Open", „Planned", „In progress", „Done" bzw. die deutschen Namen) in der Sprache der Person; bestehende Boards und Namen, die du vergeben hast, bleiben. Die Notizen der Wächter-Läufe erscheinen in der Sprache der Oberfläche, die Optionen der App in Home Assistant gibt es auch auf Englisch. Die Namen der Home-Assistant-Sensoren bleiben vorerst deutsch
- **Eigene Farbe.** Einstellungen › Farbe: ein Farbkreis, auf dem du deinen Lieblingsfarbton antippst oder ziehst. Knöpfe, aktiver Reiter, Plus-Knopf und farbige Schrift folgen sofort. Die Farbe gilt für dich auf allen Geräten, jede Person wählt ihre eigene; „Orange (Standard)" stellt das bisherige Aussehen wieder her. Hell und Dunkel werden einzeln berechnet, die Schrift auf den Knöpfen bleibt bei jedem Farbton gut lesbar. Die Dringlichkeitsbalken an den Aufgaben bleiben, wie sie sind
- **Der Plus-Knopf legt immer in „Offen" an**, auch wenn gerade „Erledigt" oder „In Arbeit" geöffnet ist; wählst du einen Termin nach heute, landet die Aufgabe in „Geplant". Am Desktop gibt es nur noch den einen orangen Plus-Knopf statt eines Knopfes je Spalte, wie auf dem Handy
- **Zahnrad für die Einstellungen.** Oben rechts in der Kopfzeile jedes Reiters (Boards, Agenda, Kalender, Wächter) sitzt ein dezentes Zahnrad ohne Rahmen; der Weg über den Board-Namen bleibt
- **Fehler behoben:** Wer unter „Für die nächste Aufgabe übernehmen" zwei Häkchen schnell hintereinander setzte, konnte das erste verlieren, wenn der Server langsam antwortete. Die Häkchen werden jetzt der Reihe nach gespeichert, die Anzeige folgt sofort deinem Tipp
- **Schneller:** „Personen & Zugriff" öffnet sich im eigenen Container sofort; ohne Home Assistant wartete es 2 bis 3 Sekunden auf einen Home Assistant, den es nicht gibt
- **Dokumentation:** README, Anleitung der App und Docker-Anleitung gibt es jetzt auf Englisch (die deutschen Fassungen bleiben als `*.de.md`), mit englischen Bildern und einem kurzen Demo-GIF
- Datenbank: zwei neue Spalten für Sprache und Farbton der Person (Migration 14 und 15, vorher wie immer eine Sicherung)

## 1.13.0

Diese Version fasst die Versionen 1.10.0 bis 1.13.0 zusammen, die zuvor in der Beta-App liefen.

- **Schnell-Eingabe (neu).** Im Fenster „Neue Aufgabe" wird aus einer Zeile eine fertige Aufgabe: `Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!` ergibt Titel „Müll raus", fällig morgen 19:00, zuständig Ben, Kategorie Haushalt, wöchentlich, Priorität hoch. Erkannte Teile sind im Text farbig hinterlegt, darunter zeigen Chips, was Stups verstanden hat; ein Tipp auf einen Chip nimmt ihn zurück. Erkannt werden Datum (heute, morgen, Wochentage, „in 3 Tagen", „1.12.", „1. Dezember"), Uhrzeit, Wiederholung („jede Woche", „alle 2 Tage", „monatlich" …), `@Person`, `#Kategorie` und Priorität (`!`, `!!`, „wichtig")
- Eine unbekannte Person sperrt das Anlegen (sonst gäbe es keine Erinnerung); eine neue Kategorie wird nach Rückfrage angelegt. Neue Einstellung **Standard-Uhrzeit für Termine** (Einstellungen › Vorgaben, Vorgabe 09:00) für ein Datum ohne Uhrzeit
- **Kompakte Aufgaben im Board.** Titel (höchstens zwei Zeilen) und eine Zeile mit allem Wichtigen: Termin (rot, wenn überfällig), Wiederholung, Priorität, Checkliste, Kommentare, Links, Anhänge und Kosten; Kategorien als kleine Punkte. Auf einem iPhone passen so meist fünf Aufgaben auf den Bildschirm
- Der „+"-Knopf verdeckt nichts mehr, Spalten-Tabs und Filter-Chips zeigen mit einem Verlauf am Rand, dass man wischen kann, und im Aufgaben-Fenster heißt der Knopf oben rechts „Fertig" statt „Speichern". Auswahlfelder sehen überall gleich aus
- **Agenda:** Aufgaben, die weiter als 60 Tage entfernt sind, fehlten. Jetzt gibt es auch bei leerer Liste den Knopf „Weitere 60 Tage laden", und liegt im ersten Zeitraum nichts an, schaut die Agenda gleich ein Jahr voraus
- **Live-Sync schlanker.** Ändert jemand eine Aufgabe, holen die anderen Geräte nur diese Aufgabe nach statt das ganze Board: bei 300 Aufgaben 1,1 KB statt 210 KB je Änderung. Bei allem anderen (Boards, Spalten, Kategorien, Personen, Stupse, Wächter, Kosten) und nach einem Verbindungsabbruch wird wie bisher alles neu geladen
- Unter der Haube nach Themen aufgeteilt (Datenteil und Schnittstelle in kleinere Dateien), ohne Änderung im Verhalten
- **Lizenz:** Stups steht ab dieser Version unter der PolyForm Strict License 1.0.0 (Nutzen und Lesen ja, Weitergeben und Verändern nein). Für 1.9.0 und früher gilt weiter die MIT-Lizenz
- Keine Migration der Datenbank

## 1.9.0

- **Neue Beta-App „Stups (Beta)".** Neue Versionen erscheinen künftig zuerst dort und erst nach dem Test in dieser App. Die Beta hat **eigene Daten** (echte Daten lassen sich einmal über Einstellungen › Umzug hineinkopieren), ein eigenes Symbol mit „BETA"-Band und einen eigenen Eintrag in der Seitenleiste. Installation: Repository `https://github.com/ArrestedOps/ha-stups#beta` in Home Assistant hinzufügen (Anleitung im README)
- In der Beta sind **Push und Wächter zunächst aus**, damit niemand Nachrichten doppelt bekommt; ein Administrator schaltet sie unter Einstellungen › Beta gezielt ein. Push-Titel beginnen mit „Beta ·", Sensoren heißen `sensor.stups_beta_…`, das Ereignis `stups_beta_create_card`
- **Der eigene Container ist jetzt ausdrücklich als Beta gekennzeichnet**, mit einem Hinweis zur Sicherheit (nie ohne HTTPS und Reverse-Proxy ins Internet, regelmäßig aktualisieren). Er bekommt vorerst keine neuen Funktionen
- **Für diese App ändert sich nichts**, außer dass die Oberfläche der Beta ein Band zeigt. Keine Migration

## 1.8.0

- **Anmelden mit Passkey im eigenen Container.** Statt das Passwort zu tippen, genügt Fingerabdruck, Gesicht oder die Bildschirmsperre. Einstellungen › Passkeys › „Passkey hinzufügen", danach zeigt die Anmeldeseite „Mit Passkey anmelden", ohne Benutzername. Das Passwort bleibt als Rückfall. Voraussetzung: `STUPS_PUBLIC_URL` ist eine https-Adresse mit Namen (nicht mit IP-Adresse). Anleitung: `docs/docker.md`
- Das Gerät muss die Person immer bestätigen (Fingerabdruck, Gesicht oder PIN). Fehlversuche zählen wie falsche Passwörter. In der Datenbank liegt nur der öffentliche Schlüssel
- **Für die App in Home Assistant ändert sich nichts:** Dort meldet weiter Home Assistant an, die Oberfläche zeigt keine Passkeys
- Datenbank: neue Tabelle für Passkeys (Migration 13, vorher wie immer eine Sicherung)

## 1.7.0

- **Der eigene Container kann sich mit Home Assistant verbinden.** Mit `HA_URL` und `HA_TOKEN` (Long-Lived-Token) bekommt er auch **Wächter, Sensoren und Push über die Companion App**, ohne selbst eine Home-Assistant-App zu sein. Angemeldet wird weiter mit den Konten in Stups. Anleitung: `docs/docker.md`
- **Personen aus Home Assistant** erscheinen unter Personen & Zugriff als Vorschläge zum Hinzufügen. Für „wer ist zu Hause" findet Stups die Person über ihren Namen
- Push-Nachrichten über die Companion App öffnen im Container Stups unter `STUPS_PUBLIC_URL`, nicht ein Panel in Home Assistant
- Vorschläge aus Home Assistant zeigen keine Personen mehr, die es in Stups schon gibt (gleicher Name)
- **Für die App in Home Assistant ändert sich nichts**

## 1.6.0

- **Push über ntfy im eigenen Container.** Ohne Home Assistant gibt es keine Companion App; jetzt kommen Erinnerungen, Stupse und die Tageszusammenfassung über einen ntfy-Server (selbst betrieben oder `ntfy.sh`). Jede Person trägt unter Personen & Zugriff ein eigenes Thema ein und abonniert es in der ntfy-App. Mit Link zur Aufgabe und Knöpfen: „Erledigt" bei Fälligkeit, „Erledigt", „Mach ich" und „Später" beim Stups. Einrichtung und Hinweise: `docs/docker.md`
- **Knöpfe ohne Anmeldung, aber abgesichert:** Jeder Knopf trägt ein signiertes Token (Person, Aktion, 14 Tage gültig). Damit lässt sich genau diese Aktion auslösen und nichts sonst; Fälschungen werden abgewiesen
- Test-Nachricht mit „Rückweg prüfen" und ein Stand der Zustellung zeigen, ob ntfy und der Weg zurück zu Stups funktionieren
- **Für die App in Home Assistant ändert sich nichts:** Push läuft weiter über die Companion App
- Datenbank: neue Spalte für das ntfy-Thema (Migration 12, vorher wie immer eine Sicherung)

## 1.5.0

- **Stups läuft jetzt auch ohne Home Assistant**, als eigener Docker-Container (zum Beispiel auf einer Synology-NAS), mit eigenen Konten und Passwort statt Home Assistant. Boards, Agenda, Kalender, Wiederholungen und Stupsen funktionieren dort wie in der App; Wächter und Sensoren bleiben Home Assistant vorbehalten und sind im Container ausgeblendet. Anleitung und Compose-Beispiel: `docs/docker.md` im Repository
- **Für die App in Home Assistant ändert sich nichts:** gleiche Anmeldung über Home Assistant, gleiche Optionen, Daten und Oberfläche
- Eigene Anmeldung (nur im Container): Einrichtung des ersten Administrators mit einem Code aus dem Protokoll oder über `STUPS_ADMIN_USER`/`STUPS_ADMIN_PASSWORD`, Passwörter mit scrypt, Sitzungen 30 Tage, Wartezeit nach Fehlversuchen, Benutzerverwaltung unter Personen & Zugriff, Passwort ändern und Abmelden in den Einstellungen
- Neuer Image-Name `ghcr.io/arrestedops/stups` für beide Architekturen (die App nutzt weiter die Bilder mit Architektur im Namen)
- Datenbank: zwei neue Tabellen für Konten und Sitzungen (Migration 11, vorher wie immer eine Sicherung)

## 1.4.0

- **Unter der Haube umgebaut, für dich ändert sich nichts.** Anmeldung, Personen, Push und Einstellungen hängen jetzt an eigenen Schnittstellen statt direkt an Home Assistant. Das ist die Grundlage dafür, dass Stups später auch ohne Home Assistant laufen kann. Daten, Optionen und Verhalten im Add-on bleiben gleich
- Neu: Die Oberfläche kann abfragen, was die Betriebsart bietet (`/api/capabilities`)

## 1.3.1

- **Der Reiter „Wächter" ist für alle da.** Auch Mitglieder (keine Administratoren) sehen ihn von Anfang an, nur lesend. Gibt es noch keinen Wächter, erklärt ein Hinweis, dass ein Administrator sie einrichten kann. Anlegen, ändern und pausieren dürfen weiterhin nur Administratoren

## 1.3.0

- **Reiter „Wächter":** Die Wächter haben einen eigenen, vierten Reiter in der Leiste unten (vorher tief in den Einstellungen). Er zeigt je Wächter die Bedingung, den aktuellen Zustand der Entität, den Zählerstand, die offene Aufgabe (ein Tipp öffnet sie) und was zuletzt ausgelöst hat, dazu die **letzte Aktivität** über alle Wächter. Ohne Wächter stehen die Vorlagen gleich da
- **Wer ihn sieht:** Administratoren immer (dort richten sie ein, ändern und pausieren), alle anderen nur, wenn es Wächter gibt, und nur lesend. In den Einstellungen führt „Wächter" zum Reiter

## 1.2.0

- **Wächter:** Stups beobachtet Entitäten in Home Assistant und legt von selbst eine Aufgabe an, die jemandem zugewiesen wird. Einrichten unter Einstellungen › Wächter (nur Administratoren, ohne YAML), mit Vorlagen für Waschmaschine, Spülmaschine, Trockner, Filter, Batterie und Saugroboter, Entitäten-Suche mit aktuellem Zustand, Vorschau-Satz und „Testen". Bedingungen: Wert fällt unter oder steigt über eine Zahl, Zustand wechselt zu, jeweils „für mindestens … Minuten"; optional „erst beim N-ten Mal" (Zähler, setzt sich beim Erledigen zurück)
- **Zuweisung pro Wächter:** feste Person(en), abwechselnd, abwechselnd unter den Anwesenden, alle Anwesenden, **wer zuerst nach Hause kommt** (Aufgabe wartet ohne Zuständige und Push, die erste Heimkehr bekommt sie samt Nachricht, Fälligkeit ab Zuweisung, Rückfall nach 24 Stunden) oder niemand
- **Regeln:** Sperrzeit gegen flatternde Sensoren, keine Doppelaufgaben, kein Auslösen beim Anlegen, neustartfest (ein verpasster Übergang löst genau einmal aus), optional „erledigt sich selbst, wenn …" und „nach … Minuten erinnern, wenn noch offen". Aufgaben von Wächtern tragen ein Auge-Symbol, im Verlauf steht, was der Wächter getan hat
- **Eigene Automationen:** Das Home-Assistant-Ereignis `stups_create_card` legt eine Aufgabe an (Board, Spalte, Titel, Beschreibung, Zuständige oder `present`, Fälligkeit, `dedupe_key`). Das Protokoll steht auf der Diagnose-Seite
- Neuer Sensor `sensor.stups_waechter_offen`
- Datenbank: neue Tabellen für Wächter, Läufe und Wartende (Migration 10, vorher wie immer eine Sicherung)
- Diagnose-Seite: „Wächter-Test" prüft, ob Stups bei Home Assistant Zustände lesen und Auslöser abonnieren darf

## 1.1.1

- **Diagnose-Seite:** Neuer Abschnitt „Wächter-Test" für Administratoren. Er prüft nur lesend, ob Stups bei Home Assistant alle Zustände lesen und Auslöser (Zustandswechsel und Zahlenwerte, jeweils mit Wartezeit) abonnieren darf, und zeigt die Personen mit ihrem Zustand. Vorbereitung für automatische Aufgaben aus Home Assistant

## 1.1.0

- **Alles in der Konfiguration von Home Assistant einstellen:** Unter Einstellungen › Apps › Stups › Konfiguration trägst du bei `users` die Personen mit ihren Push-Geräten ein und wählst mit `access_mode`, wer Stups öffnen darf (nur diese Personen oder alle). Die Liste gilt bei jedem Start; in der App sind Personen, Geräte und Zugriff dann gesperrt und nur zu sehen. Bleibt `users` leer, pflegst du wie bisher alles in der App
- Die App sitzt im Home-Assistant-Fenster ohne leere Streifen oben und unten (Statusleiste und Home-Balken wurden doppelt eingerechnet)

## 1.0.0

Erste Veröffentlichung.

- **Boards** mit eigenen Spalten und Kategorien. Aufgaben mit Zuständigen, Termin (mit Uhrzeit), Priorität, Kosten, Beschreibung, Checkliste, Links, Fotos und PDFs sowie Kommentaren und einem Verlauf. Aufgaben wischen oder per Menü verschieben, ein Farbbalken zeigt die Dringlichkeit, „Geplant" hält Aufgaben mit späterem Termin aus „Offen" heraus
- **Agenda:** alle Aufgaben mit Termin aus allen Boards nach Tagen, Überfälliges zuerst, mit Filter nach Personen und Boards
- **Kalender:** Tag, Woche und Monat. Auf einen freien Zeitpunkt tippen legt eine Aufgabe mit diesem Termin an
- **Wiederkehrende Aufgaben:** fester Rhythmus oder ab Erledigung. Die erledigte Aufgabe bleibt samt Verlauf erhalten, die nächste entsteht neu; welche Felder mitgenommen werden, lässt sich pro Aufgabe wählen
- **Push-Nachrichten** über die Companion App: zur Fälligkeit, vorab, nachhaken und als Tageszusammenfassung, mit „Erledigt" direkt in der Nachricht
- **Stupsen:** einer anderen Person zu ihrer Aufgabe einen Stups schicken. Antworten „Erledigt", „Mach ich" und „Später", Sperrzeit und Ruhezeit pro Person
- **Personen und Zugriff** in der App: Personen aus Home Assistant, ihre Push-Geräte, Zugriff für alle oder nur für ausgewählte Personen. Administratoren von Home Assistant stellen ein
- **Kategorien** lassen sich direkt an der Aufgabe anlegen
- **Sensoren** für Home Assistant (`sensor.stups_…`): überfällig und heute fällig, gesamt und je Person, offene Stupse
- Dunkel und hell, live synchron auf allen Geräten, Papierkorb, Archiv, Duplizieren, Kosten je Board
- **Umzug:** Einstellungen › Umzug exportiert Datenbank und Anhänge nach `/share/stups-umzug`, eine neue Stups-App übernimmt sie beim ersten Start
