#!/usr/bin/env bash
# S28: Geist Sans / Geist Mono cut down to the scripts the app shows (Latin
# incl. Polish, punctuation, arrows, math, box/geometric symbols). The full
# variable fonts carry Cyrillic and more (~70 KB each); these are what a phone
# downloads before the first paint. Characters outside the set fall back to
# the system font. Needs fonttools: python3 -m pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/.."
UNICODES="U+0000-00FF,U+0100-017F,U+0218-021B,U+02C6-02DD,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+221E,U+2248,U+2260,U+2264-2265,U+2318,U+2500-257F,U+25A0-25FF,U+2713,U+2715"
for f in geist-sans/Geist-Variable geist-mono/GeistMono-Variable; do
  out="src/fonts/$(basename "$f")-subset.woff2"
  python3 -m fontTools.subset "node_modules/geist/dist/fonts/$f.ttf" --unicodes="$UNICODES" --no-hinting --layout-features+=tnum,zero,ss01,ss02,case \
    --flavor=woff2 --output-file="$out"
  echo "$out $(stat -c %s "$out") bytes"
done
