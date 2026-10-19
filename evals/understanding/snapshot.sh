#!/bin/sh
# A code snapshot for a decisive run (the lead, 2026-10-08): the repo copied without data/, node_modules, archive and
# results, so other agents keep working without confounding the run. node_modules and .env are linked; results, the
# caches and the scoreboard are linked back to the real tree, so they land where they belong. Every copied file is hashed;
# the hash goes into each scoreboard row (UNDERSTANDING_SNAPSHOT) and the file list stays at <snapshot>.files.
#   sh evals/understanding/snapshot.sh <name> [dir]   → prints "<snapshot dir> <hash>"; then run run.mjs from that dir with
#   UNDERSTANDING_SNAPSHOT=<hash>. Code changed after it needs a level-2 run and an L3 smoke before going live.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SNAP="${2:-$ROOT/../snapshots}/snap-$1"
rm -rf "$SNAP" "$SNAP.files"; mkdir -p "$SNAP"
rsync -a --exclude /data --exclude /.env --exclude /node_modules --exclude /.git --exclude /archive --exclude /dist --exclude /evals/runs \
  --exclude /evals/understanding/runs --exclude /evals/understanding/cache --exclude /evals/understanding/scoreboard.md "$ROOT/" "$SNAP/"
ln -s "$ROOT/node_modules" "$SNAP/node_modules"
[ -e "$ROOT/.env" ] && ln -s "$ROOT/.env" "$SNAP/.env"
for p in evals/runs evals/understanding/runs evals/understanding/cache evals/understanding/scoreboard.md; do ln -s "$ROOT/$p" "$SNAP/$p"; done
(cd "$SNAP" && find . -type f | LC_ALL=C sort | xargs shasum -a 256) > "$SNAP.files"
echo "$SNAP $(shasum -a 256 "$SNAP.files" | cut -c1-12)"
