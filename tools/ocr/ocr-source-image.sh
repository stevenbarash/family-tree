#!/usr/bin/env bash
# OCR a source image with Tesseract, defaulting to the language set used
# across the family's documents (Hebrew, English, Russian, Ukrainian,
# Polish, German, Lithuanian, Azerbaijani, plus Yiddish for Hebrew-script
# Eastern European Jewish documents).
#
# Usage:
#   ocr-source-image.sh <image-path> [extra-lang-codes...]
#
# Examples:
#   ocr-source-image.sh ~/whoami/assets/sources/.../kelman/02-bio-p122.png
#   ocr-source-image.sh ~/Downloads/grandparents-letter.jpg ces hun  # add Czech + Hungarian
#
# Output goes to stdout. Each word is annotated with confidence via the
# `--print-parameters` and `hocr` modes in companion files alongside the
# image (same basename, .txt and .hocr extensions). Use the .hocr file to
# spot low-confidence words for manual review.
#
# WHY THIS EXISTS:
#   1. macOS Tahoe (26.x) shell sandboxing causes tesseract to silently
#      produce empty output when invoked with an absolute image path from
#      certain CWDs. Workaround: cd to the image's directory first and
#      call with a relative path. This script always does that.
#   2. tesseract's PNG handling chokes on some images created via `sips`
#      resampling (alpha channel quirks). Workaround: convert PNG → JPG
#      via sips before passing to tesseract. This script does that
#      transparently when given a PNG.
#   3. Multi-language combinations are tedious to type; the default set
#      here covers everything the family's archive has shown so far.
#
# Tip: high-resolution originals OCR better than downsized versions; the
# bio-scan PNGs in the data repo were resampled to 1800px for storage and
# may need re-OCR'ing from the originals in ~/Downloads if accuracy matters.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <image-path> [extra-lang-codes...]" >&2
  exit 2
fi

IMG_INPUT="$1"
shift
EXTRA_LANGS=("$@")

DEFAULT_LANGS=(eng ukr rus heb yid pol deu lit aze aze_cyrl)
ALL_LANGS=("${DEFAULT_LANGS[@]}" ${EXTRA_LANGS[@]+"${EXTRA_LANGS[@]}"})
LANG_ARG=$(IFS=+; echo "${ALL_LANGS[*]}")

if [[ ! -f "$IMG_INPUT" ]]; then
  echo "ocr: file not found: $IMG_INPUT" >&2
  exit 1
fi

IMG_ABS="$(cd "$(dirname "$IMG_INPUT")" && pwd)/$(basename "$IMG_INPUT")"
IMG_DIR="$(dirname "$IMG_ABS")"
IMG_BASE="$(basename "$IMG_ABS")"
IMG_STEM="${IMG_BASE%.*}"
IMG_EXT="${IMG_BASE##*.}"

# Convert PNG → JPG if needed (tesseract PNG quirk; see comment above).
WORK_IMG="$IMG_BASE"
if [[ "$(echo "$IMG_EXT" | tr '[:upper:]' '[:lower:]')" == "png" ]]; then
  WORK_IMG="${IMG_STEM}.ocr.jpg"
  if [[ ! -f "$IMG_DIR/$WORK_IMG" ]]; then
    sips -s format jpeg "$IMG_ABS" --out "$IMG_DIR/$WORK_IMG" >/dev/null
  fi
fi

# cd-first workaround for the Tahoe sandbox quirk.
cd "$IMG_DIR"
tesseract "$WORK_IMG" "$IMG_STEM" -l "$LANG_ARG" --psm 6 >/dev/null 2>&1
tesseract "$WORK_IMG" "$IMG_STEM" -l "$LANG_ARG" --psm 6 hocr >/dev/null 2>&1 || true

# Clean up the converted JPG if we made one (keep the .txt and .hocr).
if [[ "$(echo "$IMG_EXT" | tr '[:upper:]' '[:lower:]')" == "png" ]] && [[ -f "$IMG_DIR/$WORK_IMG" ]]; then
  rm -f "$IMG_DIR/$WORK_IMG"
fi

cat "$IMG_DIR/$IMG_STEM.txt"
