#!/bin/sh
# Einstiegspunkt des Images: gibt die Rechte ab, bevor die App startet.
#
# - Home-Assistant-Add-on (SUPERVISOR_TOKEN gesetzt): bleibt root, wie jedes Add-on. /data gehört dort dem Supervisor, die App
#   darf Home Assistant ohnehin nur über dessen Zugang erreichen.
# - Ohne Home Assistant (Docker): gehört der Datenordner (oft ein Host-Ordner oder ein neues Volume, also root) noch root, bekommt
#   ihn der Benutzer „node"; danach läuft die App als „node". So funktionieren bestehende Daten und neue Installationen gleich.
# - Kann „node" danach nicht schreiben (zum Beispiel ein Netzlaufwerk, das Besitzer nicht ändern lässt), startet die App wie bisher
#   als root und sagt das im Protokoll, statt nicht zu starten.
# - Wurde der Container schon mit --user gestartet, passiert nichts weiter.
set -e

if [ "$(id -u)" != "0" ] || [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  exec "$@"
fi

DATA="${STUPS_DATA_DIR:-${DATA_DIR:-/data}}"
SHARE="${STUPS_SHARE_DIR:-${SHARE_DIR:-/share}}"

mkdir -p "$DATA" "$SHARE"
# nur was noch nicht „node" gehört: bei jedem Start ein schneller Durchlauf, keine Änderung an schon richtigen Dateien
find "$DATA" ! -user node -exec chown node:node {} + 2>/dev/null || true
chown node:node "$SHARE" 2>/dev/null || true

if su-exec node sh -c 'test -w "$1" && test -w "$2"' _ "$DATA" "$SHARE"; then
  exec su-exec node "$@"
fi

echo "Stups: Der Benutzer node darf in $DATA oder $SHARE nicht schreiben und lässt sich dort nicht eintragen; die App läuft deshalb als root." >&2
exec "$@"
