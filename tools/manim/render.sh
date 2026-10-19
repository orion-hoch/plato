#!/bin/sh
# Plato's animate builder (backend/session/animate.mjs) renders with this, in its own work dir: scene.py (one Scene subclass)
# rendered at 480p15 into ./out.mp4, then 4 frames (at 15%, 40%, 65%, 95% of it) as ./frame-1..4.png for it to look at.
# PATH: the venv's manim, Homebrew's ffmpeg and TinyTeX's latex/dvisvgm (TinyTeX's `tlmgr path add` needs sudo, so not linked).
here=$(cd "$(dirname "$0")" && pwd)
export PATH="$here/.venv/bin:$HOME/Library/TinyTeX/bin/universal-darwin:/opt/homebrew/bin:/usr/bin:/bin"
file=${1:-scene.py}
rm -f out.mp4 frame-*.png
manim render -ql -v WARNING --progress_bar none --disable_caching --media_dir ./media -o out "$file" 2>&1 | grep -v -E 'SyntaxWarning|re\.match|elif re\.|^\s*$' | tail -30
mp4=$(find ./media/videos -name out.mp4 -newer "$file" 2>/dev/null | head -1)
[ -n "$mp4" ] || { echo "RENDER FAILED: no video (see the error above)"; exit 1; }
mv "$mp4" out.mp4
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out.mp4)
i=1; for f in 0.15 0.40 0.65 0.95; do ffmpeg -v error -y -ss "$(awk "BEGIN{print $d * $f}")" -i out.mp4 -frames:v 1 "frame-$i.png"; i=$((i+1)); done
echo "OK: out.mp4, ${d}s; look at frame-1.png .. frame-4.png"
