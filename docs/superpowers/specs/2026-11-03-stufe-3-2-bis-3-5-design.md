# Stufe 3.2 bis 3.5: Fairness, Rolle „Kind", Board-Vorlagen, Spike HA-Integration – Nachtrag zur Spec

Stand 03.11.2026, Ausgangslage Stups 1.15.0 (stabil) und 1.16.0-beta.1 (Haus-Kanäle, in der Beta). Grundlage ist das Briefing „Stups ausbauen" (Stufe 3, Abschnitte 3.2 bis 3.5). Die vier Teile teilen sich Dateien (Migrationen, `store.ts`, Personen-Fenster, Katalog) und werden deshalb **nacheinander in einem Zug** umgesetzt, mit einem gemeinsamen Entwurf und Plan. Ausgeliefert wird **ein** Beta-Release **1.17.0-beta.1** für 3.2 bis 3.4; 3.5 ist ein Bericht und kein Release.

## 1. Ziel

- **3.2 Fairness:** „Wer erledigt wie viel?" als ruhige Ansicht (Balken, keine Rangliste), mit optionalem Aufwand je Karte und einer abschaltbaren Sonntags-Zusammenfassung.
- **3.3 Kind:** Eine Rolle mit eingeschränkten Rechten und einer **Bestätigung durch Eltern**: Das Kind hakt ab, erst nach „Bestätigen" gilt die Karte als erledigt.
- **3.4 Board-Vorlagen:** Beim Anlegen eines Boards leer oder aus einer Vorlage starten; eigene Boards lassen sich als Vorlage speichern.
- **3.5 HA-Integration (nur Spike):** Bericht, ob und wie Karten als HA-To-do-Listen und im HA-Kalender erscheinen können. **Keine Umsetzung ohne deine Entscheidung nach dem Spike.**

## 2. Entscheidungen aus der Klärung

| Frage | Entscheidung |
|---|---|
| Fairness: wo, Aufwand? | **Abschnitt in der Agenda** (Umschalter „Termine / Fairness"), keine fünfte Leiste. **Mit Feld „Aufwand"** (klein / mittel / groß, ohne Angabe mittel) |
| Kind: Sichtbarkeit | **Einstellbar je Kind:** alle Boards oder nur Boards mit eigenen Karten |
| Bestätigung | **Je Person (Vorgabe) und je Karte (überschreibbar).** Bestätigen dürfen Administratoren und die Personen, die der Administrator je Kind wählt |
| Release | **Ein Beta-Release 1.17.0-beta.1** für 3.2 bis 3.4, gemeinsam getestet und freigegeben |
| Reihenfolge der Arbeit | 3.4 Vorlagen (eigenständig), 3.2 Fairness, 3.3 Kind (größter Teil, Rechte quer durch die Schnittstelle), 3.5 Spike (Bericht) |
| Annahmen, die du im Entwurf prüfen kannst | Ein Kind sieht die Fairness-Ansicht **nicht** (kein Vergleich unter Kindern). Die Sonntags-Zusammenfassung ist **aus**, bis jemand sie einschaltet. Wer Kind ist, ist kein Administrator |

## 3. Was beim Lesen des Codes zu beachten war

- **Rollen:** `access.ts` kennt nur Administrator (aus Home Assistant) und Mitglied. „Kind" wird eine **Eigenschaft der Person** in Stups (`users`), kein Home-Assistant-Konzept. Ein Kind ist nie Administrator.
- **Schreibende Routen:** 60. Statt jede einzeln zu ändern, prüft **ein Filter** (`onRequest`-Haken) alle Anfragen eines Kindes gegen eine **Erlaubnisliste** („verboten, was nicht ausdrücklich erlaubt ist") und dieselbe Liste gilt im Server, nicht nur in der Oberfläche.
- **Erledigen** läuft über `completeCard` (`store/completion.ts`) mit Wiederholung, Zählern der Wächter, Stupse schließen und „Rückgängig". Die Bestätigung setzt davor an: Ein Kind löst nur eine **Anfrage** aus, `completeCard` läuft erst bei „Bestätigen" und zählt dann auf das Kind.
- **Fairness braucht keine neue Datenerhebung:** `completions` (wer, wann) und `nudges` (Antwort `ack`/`done`) liegen schon vor; neu ist nur der Aufwand an der Karte.
- **Push-Aktionen:** Knöpfe in Nachrichten laufen über `notifier.handleAction` (Companion App) und signierte Token (ntfy). Die neuen Aktionen „Bestätigen" und „Nochmal" benutzen denselben Weg wie die Stupse.
- **Haus-Kanäle (1.16.0-beta.1):** Kinder ohne Handy erreichen wir darüber; die Rückfrage „Nochmal" geht als Stups-Art ins Haus.
- **Board anlegen:** `POST /api/boards`; die Standardspalten kommen heute aus `ensureDefaultBoard`/`createBoard` in der Sprache der Person. Vorlagen setzen darauf auf.

## 4. Design

### 4.1 Fairness (3.2, Migration 17)

- **Aufwand:** `cards.effort` (`small` | `medium` | `large`, leer = mittel), Gewichte 1 / 2 / 3. Feld in der Karte (Zeile „Aufwand" in den Eigenschaften, auch beim Anlegen). Die nächste Karte einer Wiederholung erbt den Aufwand.
- **Ansicht:** In der Agenda ein Umschalter „Termine | Fairness" (die Wahl wird gemerkt). Zeitraum **Diese Woche / Dieser Monat** (Wochenbeginn Montag, Zeit in der Zeitzone des Servers). Je Person ein Balken **in der Reihenfolge der Personenliste** (nicht nach Wert sortiert, ohne Platz, Medaille oder Farbe für „vorne"): erledigte Karten (Zahl), Aufwand (Balkenlänge), angelegte Karten, beantwortete Stupse, übernommene Wächter-Karten. Darüber ein Satz: „Diese Woche habt ihr 23 Aufgaben erledigt." Ohne Daten ein freundlicher Leerzustand.
- **Zählweise:** erledigt = Einträge in `completions` im Zeitraum (nach der Bestätigung, siehe 4.2); Aufwand = Summe der Gewichte; angelegt = `cards.created_by`; beantwortete Stupse = Antworten `ack` und `done` des Empfängers; Wächter-Karten = erledigte Karten mit `watcher_id`, die der Person zugewiesen waren. Nur Personen (`is_person`), keine Gäste oder wartenden Benutzer.
- **Schnittstelle:** `GET /api/fairness?period=week|month`. Nicht für Kinder.
- **Sonntags-Zusammenfassung (Push, aus, bis eingeschaltet):** `users.weekly_summary` (je Person, jede Person für sich oder ein Administrator). Sonntag ab 18:00 Ortszeit, einmal je Woche (Eintrag im Sendeprotokoll), Text wertschätzend: „Diese Woche habt ihr 23 Aufgaben erledigt. Anna 12, Ben 11. 💪". Bei 0 Karten **keine** Nachricht. Nur aufs Handy (keine Art, erreicht das Haus nie).

### 4.2 Rolle „Kind" und Bestätigung (3.3, Migration 18)

- **Daten:** `users.is_child`, `users.child_scope` (`all` | `assigned`), `users.confirm_default` (0/1), Tabelle `child_confirmers (child_id, user_id)`; an der Karte `cards.confirm` (leer = Vorgabe der zuständigen Person, `on`, `off`) und `cards.confirm_requested_at` / `confirm_requested_by`.
- **Einrichten** (nur Administratoren, Personen & Zugriff): je Person „Kind", Sichtbarkeit (alle Boards / nur Boards mit eigenen Karten), „Erledigt braucht Bestätigung" als Vorgabe, „Wer bestätigt" (Auswahl unter den Personen; Administratoren dürfen immer).
- **Was ein Kind darf** (Erlaubnisliste im Server, Rest 403 „Das darf ein Kind nicht"): eigene (zugewiesene) Karten **erledigen**, Checkliste abhaken, **kommentieren**, **Fotos und Links anhängen**; Sprache und Farbe der eigenen Oberfläche. Nicht: Karten anlegen, verschieben, löschen, Boards, Spalten, Kategorien, Wächter, Personen, Einstellungen, Stupsen, Fairness, Haus-Kanäle.
- **Sichtbarkeit:** Bei „nur eigene Boards" liefern Boardliste, Boardansicht, Agenda, Kalender, Karte-nach-Kennung und Suche nur Boards mit mindestens einer dem Kind zugewiesenen Karte; geprüft in den Abfragen des Servers.
- **Bestätigung:** Braucht eine Karte Bestätigung (`confirm = on`, oder leer und `confirm_default` der Zuständigen), löst „Erledigt" des Kindes **nur eine Anfrage** aus: `confirm_requested_at` wird gesetzt, die Karte bleibt offen und zeigt „wartet auf Bestätigung". Die Bestätiger bekommen eine Push-Nachricht mit **„Bestätigen"** und **„Nochmal"**.
  - **Bestätigen:** `completeCard` läuft, **zählt auf das Kind** (Wiederholung, Fairness, Wächter-Zähler); das Kind bekommt „Bestätigt ✓".
  - **Nochmal:** die Anfrage wird zurückgenommen, das Kind bekommt „Nochmal: <Karte>" (aufs Handy und, als Art `nudge`, ins Haus).
  - Mehrere Bestätiger: Wer zuerst antwortet, entscheidet; die anderen sehen „schon bestätigt". Wird die Karte anders erledigt oder gelöscht, entfällt die Anfrage.
- **Oberfläche für das Kind:** Plus-Knopf, Karten-Menü (Verschieben, Duplizieren, Löschen), Wischen zwischen Spalten, Board-Verwaltung und Einstellungen außer Sprache und Farbe entfallen. Das Erledigen-Rund bleibt.
- **Schnittstellen:** `PATCH /api/access/people/:id` bekommt `isChild`, `childScope`, `confirmDefault`, `confirmers`; `POST /api/cards/:id/confirm` und `/reject` (Bestätiger); `PATCH /api/cards/:id` bekommt `confirm`.
- **Keine Punkte, Sterne oder Belohnungen** (bewusst nicht): wer mag, baut es über die Sensoren.

### 4.3 Board-Vorlagen (3.4, Migration 19)

- **Eingebaute Vorlagen** als Daten im Code (`packages/server/src/templates.ts`, Deutsch und Englisch): *Haushalt* (mit typischen wiederkehrenden Aufgaben), *Umzug*, *Renovierung*, *Urlaub packen*, *Baby kommt*, *Ideen & Unternehmungen*. Je Vorlage Spalten, Kategorien und Beispielkarten (Beschreibung, Checkliste, Priorität, Aufwand, Wiederholung, Termin als **relative Tage** oder ohne Termin). Texte in der Sprache der Person.
- **Eigene Vorlagen:** Tabelle `board_templates (id, name, data json, created_by, created_at)`; „Als Vorlage speichern" im Board speichert Spalten, Kategorien und Karten (Termine werden relativ zum ältesten gespeicherten Termin, ohne Termin bleibt ohne Termin). Löschen darf der Ersteller und ein Administrator. Anhänge, Kommentare, Erledigtes und Zuweisungen gehören **nicht** in die Vorlage.
- **Anlegen:** `POST /api/boards { name, template }`; `GET /api/templates` (eingebaute und eigene, mit Zahl der Spalten, Kategorien, Karten und kurzer Beschreibung), `POST /api/boards/:id/save-as-template`, `DELETE /api/templates/:id`. Ein Termin nach heute landet wie sonst von selbst in „Geplant".
- **Oberfläche:** Im Board-Wechsler beim Anlegen: Name und **Vorlage** (Leer, eingebaute, eigene) mit Vorschau; im Board „Als Vorlage speichern".

### 4.4 Spike HA-Integration (3.5, nur Bericht)

Ergebnis ist `docs/spike-ha-integration.md`, kein Code im Produkt. Der Bericht beantwortet:

- **Wie findet und authentifiziert** eine Begleit-Integration die App (Ingress, interne Adresse des Add-ons, Token für die Integration)?
- **Welche Entitäten:** eine To-do-Liste je Board, je Spalte oder je Person? Ein Kalender? Welche Richtung (lesen, anlegen, abhaken)?
- **Wartung:** Was kostet eine zweite Komponente (HACS, Versionen, Tests, Fehlersuche)?
- **Alternativen:** ICS-Feed für Kalender-Abos, Assist-Sätze über `stups_create_card`, REST-Befehle.
- **Empfehlung und Aufwand** mit den Auswirkungen auf Lizenz und Veröffentlichung. **Danach entscheidest du.**

### 4.5 Tests

- **Server (Einheiten, feste Uhr):** Zählweise der Fairness je Zeitraum (Wochengrenze, Zeitzone, Aufwand, ausgeblendete Personen), Sonntags-Zusammenfassung (einmal je Woche, bei 0 keine Nachricht, aus bis eingeschaltet); Erlaubnisliste der Kind-Rolle für **alle 60 schreibenden Routen** (ein Test geht die Routenliste aus `fixtures/api-routes.json` durch); Sichtbarkeit je Bereich; Bestätigungsablauf (Anfrage, Bestätigen zählt auf das Kind, Nochmal, mehrere Bestätiger, Wiederholung, Rückgängig); Vorlagen (jede eingebaute erzeugt gültige Karten, Sprache, relative Termine, Speichern und Wiederverwenden); Migrationen 17 bis 19 aus Datenbanken im Stand 16.
- **Browser:** Aufwand setzen, Fairness-Ansicht, Kind-Oberfläche (reduziert), Bestätigung bis zum Ende (Kind hakt ab, Elternteil bestätigt), Board aus Vorlage.
- **Oberfläche:** Abdeckungstests für Texte (Deutsch/Englisch), Schmalansicht ohne waagerechtes Wischen.
- Alle Zeitregeln mit fester Uhr, nie mit der Wanduhr.

### 4.6 Doku und Release

- Anleitung (Englisch und Deutsch): „Fairness", „Child role and confirmation", „Board templates"; README-Zeilen; `docs/testliste.md`: neue Abschnitte.
- `docs/spike-ha-integration.md` (Deutsch, mit englischer Kurzfassung).
- **1.17.0-beta.1** (Migrationen 17 bis 19, vorher wie immer eine Sicherung); die normale App erst nach deiner Freigabe.

## 5. Nicht in diesem Teil

- Umsetzung der HA-Integration (nur der Spike)
- Punkte, Sterne, Belohnungen
- Fairness über Boards hinaus gefiltert, Ranglisten, Vergleiche unter Kindern
- Mehrere Zeiträume zum Blättern (nur diese Woche / dieser Monat)
- Eigene Rollen außer „Kind"
- Anhänge und Kommentare in Vorlagen

## 6. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Ein Kind ändert etwas, das es nicht dürfte (Lücke in einer der 60 Routen) | Erlaubnisliste statt Verbotsliste; ein Test geht **alle** schreibenden Routen durch; neue Routen sind für Kinder standardmäßig verboten |
| Ein Kind sieht fremde Boards oder Karten über eine Nebenroute (Agenda, Kalender, Suche, Karte nach Kennung) | Filter in den Abfragen des Servers; Test je Bereich |
| Fairness wirkt wie ein Wettbewerb | Keine Reihenfolge nach Wert, keine Plätze, neutrale Farben, wertschätzende Texte, Aufwand statt reiner Zählung |
| Bestätigung hängt (niemand antwortet) | Die Karte bleibt „wartet auf Bestätigung" sichtbar; Erinnerung an die Bestätiger über das Nachhaken; Administratoren können jederzeit direkt erledigen |
| Doppeltes Erledigen oder Zählen | Bestätigen läuft über `completeCard` (ein Weg); wer zuerst bestätigt, gewinnt; Test |
| Sonntags-Nachricht kommt mehrfach oder nachts | Eintrag im Sendeprotokoll je Woche und Person; nur ab 18:00 Ortszeit; Ruhezeit der Person gilt |
| Eigene Vorlage enthält Persönliches | Nur Struktur und Karten ohne Zuweisung, Anhänge, Kommentare |
| Eine große Änderung auf einmal | Aufgaben klein, jede endet grün; Beta zuerst; ein gemeinsamer Test am Ende |

## 7. Erfolgskriterien

- Ohne Kinder, Vorlagen und eingeschaltete Zusammenfassung ändert sich für niemanden etwas (alle bestehenden Tests unverändert grün).
- Ein Kind kann genau das, was in 4.2 steht, und der Server verweigert alles andere (Test über alle Routen).
- Eine bestätigungspflichtige Karte zählt erst nach „Bestätigen", und dann auf das Kind.
- Die Fairness-Ansicht zeigt dieselben Zahlen wie die Daten (Test) und nennt keine Rangfolge.
- Jede eingebaute Vorlage legt ein vollständiges, sinnvolles Board an, auf Deutsch und Englisch.
- `docs/spike-ha-integration.md` beantwortet die Fragen aus 4.4 mit Quellen und einer Empfehlung.
- Alle Texte gibt es auf Deutsch und Englisch; Browser-Tests laufen stabil und unabhängig von der Uhrzeit.
