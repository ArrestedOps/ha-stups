# Wächter: mehr Vorschläge, Mehrfachauswahl, Massenbearbeitung

Stand: 2026-11-14 · gemeinsam im Gespräch entworfen

## Warum

Der Wächter funktioniert, aber bei vielen Geräten wird „einzeln einrichten, einzeln ändern“ mühsam: 20 Batterie-Treffer heißt heute
20-mal durch den Assistenten. Außerdem erkennt Stups noch zu wenige Gerätearten. Ziel: mehr passende Vorschläge, und alles, was man
mehrfach tun würde, einmal für eine ganze Auswahl tun.

## Ziele

1. **Neue Vorschläge (A) und neue wiederkehrende Vorlagen (C)**, siehe Liste unten.
2. **Gefunden: mehrere Treffer gemeinsam einrichten und ausblenden.**
3. **Wächterliste: mehrere Wächter auswählen und gemeinsam bearbeiten, pausieren/fortsetzen, löschen.**

## Nicht-Ziele

- Neue Auslöser-Arten (Frost, Sturm, Hitze in der Vorhersage; Kalender-Stichworte): später (B).
- Duplizieren, eigene „Verschieben“-Aktion, „Testen“ für mehrere.
- Der bestehende Assistent für EINEN Vorschlag bleibt, wie er ist.

## Anti-Ziele

- Eine Massenänderung darf nie unbemerkt Werte überschreiben, die man nicht angefasst hat.
- Gerät und Name eines Wächters werden nie gemeinsam gesetzt.

## 1. Neue Vorlagen

**A – mit den heutigen Auslösern** (state / above / below), Erkennung über Domäne, `device_class` und Wörter wie bei den bestehenden.
✓ = „von selbst erledigen“ möglich (Done-Bedingung belegbar).

| Vorlage | Erkennung (Richtung) | Karte | ✓ |
|---|---|---|---|
| Fenster/Tür lange offen | binary_sensor window/door/opening, on ≥ 30 Min. | Fenster schließen | ✓ off |
| Kühl-/Gefriertür offen | binary_sensor door + Wörter kühlschrank/gefrier/fridge/freezer, on ≥ 5 Min. | Tür zumachen | ✓ off |
| Wasserleck | binary_sensor moisture, on | Leck prüfen, aufwischen | – |
| Pflanze gießen | sensor moisture (Pflanzensensor) / plant, below | Pflanze gießen | ✓ above |
| Lüften (Feuchte) | sensor humidity, above 65 % ≥ 30 Min. | Lüften | ✓ below |
| Lüften (CO₂) | sensor carbon_dioxide, above 1200 ppm | Lüften | ✓ below |
| Entfeuchter Tank voll | Tank-/„tank full“-Sensor des Entfeuchters | Tank leeren | ✓ |
| Roboter steckt fest | vacuum / lawn_mower, state error | Roboter befreien | ✓ |
| Filter verbraucht | sensor filter_life/Filter-Restlaufzeit, below 10 % | Filter wechseln | ✓ above |
| Toner/Tinte | sensor toner/ink, below 15 % | Toner bestellen | ✓ above |
| Füllstand niedrig | Pellets/Heizöl/Zisterne/Futter-Füllstand, below | Nachbestellen | ✓ above |
| Salz/Klarspüler, Wassertank, Trester | Geräte-Integrationen (z. B. Home Connect) | Nachfüllen / Leeren | ✓ |
| Katzenklo voll | Behälter-voll-Sensor (Katzenklo-Roboter) | Katzenklo leeren | ✓ |
| E-Auto einstecken | Ladestand-Sensor below 30 % | Auto einstecken | ✓ (Laden) |
| Post | Briefkasten-binary_sensor on | Post holen | – |
| Garage/Haustür | cover garage open / lock unlocked ≥ 30 Min. | Schließen | ✓ |
| Gefriertruhe warm | Temperatur-Sensor gefrier/freezer, above −15 °C | Gefriertruhe prüfen | – |
| Gerät nicht erreichbar | state unavailable ≥ 60 Min. | Gerät prüfen | ✓ |
| Update verfügbar | update-Entität on | Update einspielen | ✓ off |

Schwellwerte, Minuten und Zuteilung sind Vorbelegungen; der Mensch passt sie im Assistenten an. Kategorie je Vorlage aus den
Standardkategorien (watcher-categories.ts) ableiten.

**C – wiederkehrende Karten ohne Gerät:** Kühlschrank reinigen, Backofen reinigen, Fenster putzen, Heizung entlüften (jährlich, Herbst),
Reifen wechseln (Okt./Apr., zwei Termine oder halbjährlich), Dachrinne reinigen, Hygienewäsche Waschmaschine, Duschkopf entkalken,
Abflüsse reinigen, Erste-Hilfe-Kasten prüfen, Feuerlöscher prüfen, Matratze wenden, Pflanzen düngen. Die Wiederholung kann `yearly`.

Texte zweisprachig (de/en) wie die bestehenden.

## 2. Gefunden: gemeinsam einrichten und ausblenden

- „Auswählen“ schaltet Kästchen an den Treffern ein; im Gruppenkopf „Alle auswählen“. Auswahl nur innerhalb **einer** Vorlage
  (gleiche Gruppe = gleicher Auslöser; beim Gerät mit Leistung vs. Programmstatus zählt die Fassung mit).
- Leiste unten: „N ausgewählt · Einrichten · Ausblenden“.
- **Einrichten** öffnet **denselben Assistenten mit vier Schritten**. Schritt 1 zeigt statt der Geräteauswahl die Liste der angehakten
  Geräte (mit aktuellem Wert), einzelne lassen sich abwählen; die Werte des Auslösers gelten für alle. Name und Kartentitel setzt Stups je
  Gerät (wie heute über `label`). Letzter Knopf: „N Wächter anlegen“. Probelauf und Feinschliff bleiben.
- **Ausblenden** blendet alle ausgewählten Treffer aus (wie das heutige Ausblenden einzeln).

```
Wenn  ·  Dann  ·  Wer  ·  Feinschliff
20 Geräte  (Batterie schwach)
☑ Bewegungsmelder Flur      12 %
☐ Fernbedienung TV          31 %
Auslösen unter  [20] %  seit [10] Min.
```

## 3. Wächterliste: Mehrfachauswahl

- Desktop: Kästchen in der Tabelle. Handy: „Auswählen“, dann Kästchen und unten eine Leiste „N ausgewählt · Bearbeiten · Pausieren/
  Fortsetzen · Löschen“.
- Gemischte Auswahl ist erlaubt.
- **Bearbeiten** zeigt nur Felder, die für alle Ausgewählten passen:
  - immer: Zuteilung (Modus, Personen, Rückfälle), Board und Spalte, Kategorie, Fälligkeit, Priorität, Stupsen, Sperrzeit,
    „keine zweite Karte“, Fairness, aktiv.
  - Auslöser-Felder nur bei gleicher Auslöser-Art (und bei Schwellwerten gleicher Einheit): Schwelle, Dauer, Anzahl,
    „von selbst erledigt ab“; bei Kalender der Vorlauf; bei Vorhersage die Stunden. Sonst ein Hinweis, warum sie fehlen.
  - nie: Entität, Name, Kartentitel.
- Haben die Ausgewählten verschiedene Werte, steht „verschieden“ im Feld. Nur angefasste Felder werden geschrieben, alles andere
  bleibt je Wächter erhalten.
- **Löschen**: Wächter landen heute nicht im Papierkorb, also Rückfrage „N Wächter löschen?“ (endgültig).
- Rechte wie beim Einzelbearbeiten (wer einen Wächter nicht bearbeiten darf, kann ihn nicht auswählen; Board-Zugriff beachten).

```
3 Wächter ausgewählt
Wer:        Rotation (Anwesende)   ✎
Board:      verschieden            ✎
Schwelle:   20 %                   ✎
            [Für alle übernehmen]
```

## Ansätze

- **Gewählt:** Massenänderung als eine Anfrage an den Server (alle oder keiner, in einer Transaktion), die nur die angefassten Felder als
  Teil-Änderung je Wächter anwendet und dieselbe Prüfung wie das Einzelspeichern nutzt. Gemeinsames Einrichten genauso: eine Anfrage, N
  Wächter. So bleibt es bei Fehlern konsistent und ist schnell.
- Verworfen: die Oberfläche schickt N einzelne Speicher-Anfragen (halbe Ergebnisse bei Fehlern, langsam bei 40 Wächtern).
- Verworfen: eigener Formular-Bildschirm für das gemeinsame Einrichten (doppelte Logik zum Assistenten, neu zu lernen).

## Reihenfolge

1. Mehrfachauswahl + Massenbearbeitung der Wächterliste (legt Auswahl-Leiste und „verschieden“-Felder an).
2. Gefunden: gemeinsam einrichten und ausblenden (nutzt dieselben Bausteine).
3. Neue Vorlagen A und C.

## Dem Bauenden überlassen

API-Form, Komponenten-Schnitt, ob Löschen zusätzlich „Rückgängig“ bekommt, genaue Erkennungsmuster und Vorbelegungen je Vorlage,
Tests (Vitest + E2E im Stil des Projekts), CHANGELOG/DOCS-Einträge für stups-beta.
