# Runde 3: fünf Welten (animiert, antippbar)

Auslöser: Runde 1 und 2 trafen den Geschmack nicht. Jetzt jeweils eine Idee mit **einem** mutigen Element, mit Bewegung und Interaktion. Dateien: `dev/design/mockups/v3/`, Galerie: `dev/design/mockups/galerie.html`.
Jede Welt ist eine Seite für Handy und Desktop, hell und dunkel (`?theme=dark`), respektiert „Bewegung reduzieren“.

| # | Welt | Mutiges Element | Antippen / Ziehen | Schrift |
|---|---|---|---|---|
| 1 | Fallblatt | Abfahrtstafel, Klappen rattern durch (3D-Klappen, optional Ton) | Zeile antippen klappt um, Ben stupst herein | Archivo |
| 2 | Murmeln | Aufgaben als Kugeln mit eigener Physik | Ziehen, werfen, in die Schale; Antippen stupst | Familjen Grotesk |
| 3 | Kühlschrank | Zettel, Magnete, Stempel schlägt auf | Zettel ziehen, Stempel, Dose | Caveat, Figtree |
| 4 | Haushaltswetter | Wetterszene gekoppelt an die Aufgaben | Warnungen abhaken, Sonne und Regenbogen, Windböe = Stups | Bricolage Grotesque |
| 5 | Puppenhaus | Aufgeschnittenes Haus, Licht zeigt Wartendes | Raum antippen, abhaken, Anna hüpft | Schibsted Grotesk |

## Abgleich (Skill frontend-design)

Vermieden: Creme mit Terrakotta, Schwarz mit Leuchtakzent, Zeitungslinien, gleiche Karten mit gleichem Schatten, Verläufe, Großbuchstaben-Marken, Mittelpunkt-Ketten. Farben stehen in jeder Welt für etwas (Gelb = verspätet, Kugelfarbe = Board, Wetter = Lage).

## Was es für die App bedeuten würde

- **Fallblatt, Ring, Werkbank-artige Listen:** keine neuen Daten.
- **Murmeln, Kühlschrank:** brauchen eine Ansicht neben der Liste (Überblick bei vielen Aufgaben, Barrierefreiheit per Tastatur ist vorgesehen).
- **Haushaltswetter:** nur eine Ansicht über Zahlen, die es schon gibt; Szene braucht Illustrationen.
- **Puppenhaus:** braucht einen Raum je Karte (Home Assistant kennt Bereiche) und ein Haus je Haushalt.
