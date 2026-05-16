# OCR helpers

Local Tesseract-based OCR for source-document images (photographed book
pages, archival scans, letters).

## Install

```bash
brew install tesseract tesseract-lang
```

`tesseract-lang` adds every supported language pack. The 8 languages
this archive cares about most are present, plus 14 useful related ones:

| Code | Language | | Code | Language |
| --- | --- | --- | --- | --- |
| `eng` | English | | `bel` | Belarusian |
| `heb` | Hebrew | | `ces` | Czech |
| `rus` | Russian | | `slk` | Slovak |
| `ukr` | Ukrainian | | `hun` | Hungarian |
| `pol` | Polish | | `ron` | Romanian |
| `deu` | German | | `fra` | French |
| `lit` | Lithuanian | | `ell` | Greek |
| `aze` | Azerbaijani (Latin) | | `ita` / `ita_old` | Italian |
| `aze_cyrl` | Azerbaijani (Cyrillic) | | `spa` / `spa_old` | Spanish |
| `yid` | Yiddish (Hebrew script) | | `por` | Portuguese |
| | | | `lat` | Latin |

`tesseract --list-langs` shows the full list installed.

## Usage

```bash
./ocr-source-image.sh <image> [extra-lang-codes...]
```

The default language combination covers the 10 common-archive codes
(`eng ukr rus heb yid pol deu lit aze aze_cyrl`). Pass extra language
codes as additional arguments when you know the document also has e.g.
Czech or Hungarian text:

```bash
./ocr-source-image.sh ~/whoami/assets/sources/some-archive/letter.jpg
./ocr-source-image.sh ~/Downloads/old-doc.png ces hun
```

Output goes to stdout; companion `.txt` and `.hocr` files land next to
the image. The `.hocr` file has per-word bounding boxes and confidence
scores — useful when manually verifying low-confidence words.

## Two macOS quirks the script handles for you

1. **macOS Tahoe shell sandbox.** Tesseract called with an absolute
   image path from certain CWDs silently produces empty output (exit 0,
   no warnings). The script always `cd`s to the image's directory and
   calls tesseract with a relative path.

2. **PNG ↔ alpha-channel quirk.** PNGs created via `sips` (e.g., the
   resampled bio scans in `~/whoami/assets/sources/`) sometimes carry
   alpha channels that tesseract can't read despite reading every other
   PNG fine. The script transparently converts PNG → JPG via `sips`
   before OCR and removes the temp JPG after.

## Tips for accuracy

- **Use high-resolution originals**, not downsized versions. The 1800px
  resamples in `assets/sources/` are storage-friendly but tesseract is
  much more accurate on the original phone-camera scans (~3000–4000 px
  on the long side).
- **Crop multi-page spreads** to one page each before OCR. Tesseract's
  page-segmentation interleaves text columns when given a two-page
  spread, which is hard to untangle in the output.
- **Mask large solid-color regions** (black bars covering non-relevant
  parts of a photo) by cropping them out. Tesseract's auto page
  segmentation gives up when most of the image is one colour.
- **Cross-reference with your own visual reading.** OCR has its own
  character confusions (e.g., н↔п, в↔ь in some Cyrillic fonts) but
  catches what visual reading misses, and vice versa. Both are best.
