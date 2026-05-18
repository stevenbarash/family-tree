/**
 * Inject GEDCOM 7 NAME.TRAN substructures into a 5.5.1 or 7.0 GEDCOM text.
 *
 * Idempotent by construction: any pre-existing `2 TRAN` (and its
 * accompanying `3 LANG`) lines inside each INDI record's NAME block are
 * stripped before the new set is injected. Running this twice produces
 * the same output as running it once.
 *
 * Pure: takes a GEDCOM text and a per-record translation map, returns
 * the rewritten text. No I/O. The CLI (or other callers) handle file
 * reads/writes at the boundary.
 *
 * Lines NOT inside an INDI's first NAME block are passed through
 * unchanged — preserving the converter's PHRASE, EXID, SOUR, and other
 * substructures the project has already opted into.
 */

/**
 * A translation entry for one (record, locale) pair.
 * `record` is the bare xref id without `@` wrappers (e.g. "I123").
 * `locale` is a BCP 47 short code ("ru", "uk", "he").
 */
export interface NameTranEntry {
  record: string;
  locale: string;
  title: string;
}

/**
 * Strip every `2 TRAN .../3 LANG ...` pair from the GEDCOM (regardless of
 * which record/NAME block they're under), then re-inject from `entries`.
 *
 * Each INDI record's first `1 NAME` line gets the new TRANs appended after
 * all of its existing level-2 substructures (SOUR, GIVN, SURN, etc.),
 * before the next level-1 line. Order: ru → uk → he → other locales
 * (alphabetical fallback). Records with no entries in the map are
 * untouched (both pre-existing and the strip-then-rewrite path are no-ops).
 */
export function injectNameTran(gedcomText: string, entries: NameTranEntry[]): string {
  // Stage 1: strip ALL existing TRAN/LANG pairs.
  const stripped = stripExistingTrans(gedcomText);

  // Stage 2: group entries by record.
  const byRecord = new Map<string, NameTranEntry[]>();
  for (const e of entries) {
    if (!byRecord.has(e.record)) byRecord.set(e.record, []);
    byRecord.get(e.record)!.push(e);
  }

  // Stage 3: walk lines; when entering an INDI record's first NAME block,
  // append TRANs after the last contiguous level-2+ substructure.
  const lines = stripped.split('\n');
  const out: string[] = [];
  let currentRecord: string | null = null;
  let nameLineSeenForCurrentRecord = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);

    const recordMatch = line.match(/^0 @([^@]+)@ (\w+)$/);
    if (recordMatch) {
      currentRecord = recordMatch[2] === 'INDI' ? recordMatch[1]! : null;
      nameLineSeenForCurrentRecord = false;
      continue;
    }
    if (line.startsWith('0 ')) {
      currentRecord = null;
      nameLineSeenForCurrentRecord = false;
      continue;
    }

    if (currentRecord && !nameLineSeenForCurrentRecord && /^1 NAME /.test(line)) {
      nameLineSeenForCurrentRecord = true;
      const recordEntries = byRecord.get(currentRecord);
      if (!recordEntries || recordEntries.length === 0) continue;

      // Walk past existing level-2+ substructures of this NAME, copying
      // them through, then inject the TRAN lines before the next level-1.
      let j = i + 1;
      while (j < lines.length && /^[2-9] /.test(lines[j]!)) {
        out.push(lines[j]!);
        j++;
      }
      i = j - 1; // advance outer loop past what we just copied
      for (const e of sortLocales(recordEntries)) {
        out.push(`2 TRAN ${e.title}`);
        out.push(`3 LANG ${e.locale}`);
      }
    }
  }

  return out.join('\n');
}

/**
 * Remove every `2 TRAN ...` line (and the immediately-following `3 LANG ...`
 * if present) from the GEDCOM. Pure / line-level. Safe to call on text that
 * has no TRAN entries.
 */
export function stripExistingTrans(gedcomText: string): string {
  const lines = gedcomText.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^2 TRAN /.test(line)) {
      // Skip this line + presumed `3 LANG` child
      if (i + 1 < lines.length && /^3 LANG /.test(lines[i + 1]!)) {
        i++;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Deterministic locale ordering — ru, uk, he, then others alphabetically. */
function sortLocales(entries: NameTranEntry[]): NameTranEntry[] {
  const preferred = ['ru', 'uk', 'he'];
  const rank = (loc: string) => {
    const idx = preferred.indexOf(loc);
    return idx >= 0 ? idx : preferred.length + loc.charCodeAt(0);
  };
  return [...entries].sort((a, b) => rank(a.locale) - rank(b.locale));
}
