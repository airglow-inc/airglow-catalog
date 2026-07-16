#!/usr/bin/env bash
# Turn a screen recording into catalog card media for one app:
#   <app>/media/preview.mp4    1600x1000 (16:10), 30fps, h264 — the hover video
#   <app>/media/thumbnail.jpg  last frame of the recording — the card poster
# Any input resolution/aspect works: scaled to cover 1600x1000, center-cropped.
# build-catalog.mjs picks both files up by convention; delete media/ to opt out.
#
# Usage: scripts/compress-media.sh <recording.(mp4|mov)> <app-id>
set -euo pipefail
in=$1; out="$(dirname "$0")/../$2/media"; mkdir -p "$out"
vf='scale=1600:1000:force_original_aspect_ratio=increase,crop=1600:1000'
ffmpeg -hide_banner -loglevel error -y -i "$in" -vf "$vf" -r 30 \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart -an \
  "$out/preview.mp4"
ffmpeg -hide_banner -loglevel error -y -sseof -0.1 -i "$in" -vf "$vf" \
  -frames:v 1 -update 1 -q:v 3 "$out/thumbnail.jpg"
ls -lh "$out"
