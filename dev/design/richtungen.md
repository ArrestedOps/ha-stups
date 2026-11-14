# Redesign Dashboard: drei Richtungen

Stand: Branch `design`. Erarbeitet nach dem Skill `frontend-design` (`.claude/skills/frontend-design/`): erst Plan, dann Abgleich mit dem Auftrag, dann Bau, dann Kritik.

## Gegenstand (Vorschlag, zur Korrektur)

- **Was:** Stups, eine App in Home Assistant, die aus dem, was das Haus weiß, Aufgaben macht und sie fair verteilt.
- **Wer:** Familien und Wohngemeinschaften, meist auf dem iPhone, selten am Rechner. Keine Technikfans.
- **Hauptaufgabe des Bildschirms:** In drei Sekunden sehen, was jetzt für mich ansteht, und es mit einem Tipp erledigen. Zweitens: wer was hat.
- **Auftrag des Nutzers:** „Möglichst modern.“ Optisch kein KI-Look (Verläufe, Leuchten, Kästen um alles, Emojis). Mehr gibt es nicht, es gibt keine Vorbilder.

## Was wir vermeiden (Muster der letzten Entwürfe)

Cremefarbener Grund mit Terrakotta-Orange (das war mein erster Entwurf), schwarzer Grund mit einem Leuchtakzent, Zeitungslayout mit Haarlinien, gleiche runde Karten mit gleichem Schatten, Verlaufsflächen, Mittelpunkt-Ketten („A · B · C“), Großbuchstaben-Marken über jeder Überschrift, „große Zahl, kleines Label“ als Standard für Kennzahlen.

Die drei Richtungen unterscheiden sich in der **Ordnung**, nicht nur in Farbe und Schrift.

---

## A · Fahrplan (nach Zeit geordnet)

Gedanke: Ein Haushalt hat einen Takt. Der Bildschirm ist eine Abfahrtstafel für den Tag. Überfälliges ist „verspätet“, der Moment „jetzt“ ist die Mitte.

**Farben:** Weiß `#FFFFFF`, Schwarz `#000000`, Stups-Orange `#F05400` (nur als Fläche, schwarze Schrift darauf, 6,2 : 1), Grau für Nebentext `#5C5C5C`.
**Schrift:** Eine Familie, Archivo (Breite und Gewicht verstellbar): schmal und schwer für Uhrzeit und Tag, normal für Text.
**Struktur als Information:** Die Zeitspalte links ist eine echte Reihenfolge (deshalb sind Zahlen hier erlaubt). Schwarze Balken trennen Tage, ein Orange-Balken ist „jetzt“.

```
┌──────────────────────┐
│ stups          🔔  A │
│██████████████████████│  schwarzes Band: Tag + große Uhr
│ Do 5.11.     17:42   │
│██████████████████████│
│ 2 überfällig  0 heute  1 erledigt
│ Mo Di Mi [Do] Fr Sa So │
│──────────────────────│
│ 08:05 ✓ Spülmaschine │
│[16:17] Müll rausbr.  │  Zeitzelle orange = verspätet
│[16:30] Paket abholen │
│▓▓ jetzt 17:42 ▓▓▓▓▓▓▓│  orange Balken
│██ Freitag 6.11. ████ │
│ 10:00 Fenster putzen │
└──────────────────────┘
```

**Abgleich:** Weiß/Schwarz/Signalorange ist kein Creme-Terrakotta und kein Dunkel-Leuchtakzent. Die Kennzahlen sind ein Satz („2 überfällig“) statt Zahlenkarten. Ehrlich bleibt: Schweizer Tafelstil ist unter Designern ein bekannter Look. Er ist hier aber durch den Inhalt gedeckt (Zeiten, Verspätung).

## B · Familie (nach Person geordnet)

Gedanke: Die zentrale Frage im Haushalt ist „Wer hat was?“. Jede Person hat eine Farbe, und der **ganze Kopf des Bildschirms nimmt die Farbe der gewählten Person an**. Das ist der eine mutige Punkt, der Rest bleibt ruhig.

**Farben:** Anna Blau `#2447F5`, Ben Orange `#FF7A1A` (Schrift schwarz), Mia Grün `#12B76A` (Schrift schwarz), Grund Weiß `#FFFFFF`, Fläche `#F1F2F6`, Tinte Marineblau `#0E1A52`. „Überfällig“ ist eine Tinten-Pille (keine zusätzliche Farbe).
**Schrift:** Eine Familie, Bricolage Grotesque: eigenwillig, freundlich, kräftig, in großen Größen.
**Struktur:** Der Kopf sagt in einem Satz, wie es steht („Zwei Dinge sind liegen geblieben.“). Der Stups von Ben ist eine Sprechblase mit Avatar, so wie er ankommt.

```
┌──────────────────────┐
│▓▓ stups           🔔 │  ganzer Kopf in Annas Blau
│▓ (A)  (B)  (M)       │  Personen: Anna gewählt
│▓                     │
│▓ Zwei Dinge sind     │
│▓ liegen geblieben.   │
│▓ [Heute 0] [Erledigt 1]
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ (B) Ben stupst dich  │
│ Liegen geblieben     │
│ ☐ Müll rausbringen   │
│ ☐ Paket abholen      │
└──────────────────────┘
```

**Abgleich:** Keine Verläufe, nicht Creme, nicht Dunkel. Gefahr: zu verspielt. Gegenmittel: große ruhige Schrift, nur eine Farbfläche, Rest weiß.

## C · Nativ (nach den Regeln des Telefons)

Gedanke: Stups soll sich wie eine App des iPhones anfühlen und im Home-Assistant-Rahmen nicht fremd wirken. Wenig Gestaltung, viel Sorgfalt: Systemschrift, gruppierte Listen, ein Tönungsorange.

**Farben:** Grund `#F2F2F7`, Fläche Weiß, Text `#000000`, Nebentext `#6C6C70`, Tönung Orange `#C93F00`.
**Schrift:** Systemschrift (SF Pro auf dem iPhone). Das heißt auch: keine Schriftdateien, und es bleibt dabei, dass nichts aus dem Internet geladen wird. In diesem Mockup ersetzt Inter die Systemschrift nur, weil der Browser hier keine SF Pro hat.
**Struktur:** Großer Titel, Segment „Meine / Alle / Ben“, **eine** gruppierte Liste je Abschnitt (eine Fläche, keine Einzelkarten).

```
┌──────────────────────┐
│ Aufgaben        🔔 ⋯ │
│ [Meine|Alle|Ben]     │
│ ┌──────────────────┐ │
│ │Heute fällig  0 > │ │
│ │Überfällig    2 > │ │
│ │Erledigt      1 > │ │
│ └──────────────────┘ │
│ Überfällig           │
│ ┌──────────────────┐ │
│ │○ Müll rausbringen│ │
│ │○ Paket abholen   │ │
│ └──────────────────┘ │
└──────────────────────┘
```

**Abgleich:** Das ist die sicherste Richtung. Sie ist bewusst unauffällig und gewinnt durch Vertrautheit. Die Gruppierung in einer Fläche vermeidet die „gleichen Karten“.

---

## Nach der Wahl

Nur ein Bildschirm ist gezeigt (Aufgaben). Vor dem Bau in Svelte: Dunkelthema, Boards, Karte-Detail, Wächter, Einstellungen, Dialoge. Alle Farben liegen als Tokens in `packages/web/src/app.css`, dort würde die Umstellung ansetzen.
