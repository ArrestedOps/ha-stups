# Stups (Beta)

> Deutsche Fassung. Die englische Fassung ([DOCS.md](DOCS.md)) ist maßgeblich.

Das ist die **Beta-Version** von Stups: dieselbe App wie „Stups", aber mit **eigenen Daten** und mit neuen Funktionen, bevor sie veröffentlicht werden. Sie ist zum Ausprobieren da, nicht für den Alltag.

## Was ist anders als in der normalen App

- **Eigene Daten.** Die Beta hat ihren eigenen Speicher. Boards und Karten der normalen App sind nicht darin, außer du kopierst sie einmal hinein (siehe unten).
- **Push und Wächter sind zunächst aus.** Sonst bekäme die Familie Erinnerungen doppelt. Unter **Einstellungen › Beta** schaltet ein Administrator beides gezielt ein, zum Beispiel Push nur für sich.
- **Eigene Namen.** Push-Titel beginnen mit „Beta ·", Sensoren heißen `sensor.stups_beta_…`, das Ereignis für Automationen heißt `stups_beta_create_card`, die Knöpfe in Nachrichten gehören nur der Beta.
- **Eigenes Symbol** („BETA") und eigener Eintrag in der Seitenleiste („Stups Beta").

## Echte Daten zum Testen kopieren

1. In der **normalen** Stups-App: **Einstellungen › Umzug › Exportieren**. Die Daten landen in `/share/stups-umzug`.
2. **Erst danach** die Beta zum ersten Mal starten. Sie übernimmt den Export beim ersten Start, aber nur dann, wenn sie noch keine eigenen Daten hat.
3. Die Beta nimmt die Daten **als Kopie**; die normale App bleibt unberührt.

Neue Kopie nötig? Die **Beta** (und nur die Beta, erkennbar am Namen) deinstallieren, in der normalen App neu exportieren und die Beta neu installieren. Die normale App wird nie deinstalliert.

## Beta installieren

In Home Assistant unter **Einstellungen › Apps › App-Store › ⋮ › Repositories** diese Adresse hinzufügen:

```
https://github.com/ArrestedOps/ha-stups#beta
```

Dort erscheint **Stups (Beta)**. Aus dieser Adresse erscheint auch ein zweites „Stups": das **nicht** installieren, es ist nicht die normale App und hätte eigene, leere Daten.

Bedienung und Optionen sind wie in der normalen App ([Dokumentation von Stups](https://github.com/ArrestedOps/ha-stups/blob/main/stups/DOCS.md)).
