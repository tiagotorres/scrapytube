#!/bin/sh
# Starts ScrapyTube in the Docker image.
#
# With PUID (and PGID), it runs as that user of the NAS instead of root, so
# the files it saves belong to you and can be moved, renamed or deleted from
# the NAS's shares. UMASK (default 0002) sets their permissions: 0002 lets
# the group change them too, 0022 only the owner.
set -eu

umask "${UMASK:-0002}"
DATA_DIR="${DATA_DIR:-/data}"
MEDIA_DIR="${MEDIA_DIR:-/media}"

if [ "$(id -u)" = "0" ] && [ -n "${PUID:-}" ]; then
  PGID="${PGID:-$PUID}"
  # ScrapyTube's own folder is made theirs; the media folder is left as it is.
  mkdir -p "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  as_user() { setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"; }
  if ! as_user test -w "$MEDIA_DIR"; then
    echo "Warning: user $PUID:$PGID can't write to $MEDIA_DIR. Give it access on the NAS, or change PUID/PGID." >&2
  fi
  export HOME=/tmp
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi

exec "$@"
