import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';
import { findDatesInLine } from '../format/dates.ts';

/**
 * Citation drift: every factual line in a page body must contain either
 * a footnote reference `[^id]` or the citation-needed marker `[?]`. The
 * marker is the model's escape hatch for "I believe this but can't cite
 * it" — it eliminates the incentive to fabricate fake footnotes, and
 * surfaces uncited claims to reviewers for follow-up.
 *
 * A "factual line" is one whose text contains any of:
 *   - a date (matched by `findDatesInLine`)
 *   - a four-digit year on its own
 *   - a `[[wikilink]]` (to a person, place, or other entity)
 *
 * Granularity is per-line rather than per-sentence because genealogy prose
 * is dense with abbreviations like `(b. 1946)` and `Jr.` that confound
 * sentence-splitters; per-line is coarse but reliable. The cost: a line
 * with two claims where only one is cited will still pass — that case is
 * uncommon in drafted articles, and the consistency check
 * (footnote-orphan / cite-vault mismatch) catches the worst version of it.
 *
 * Skipped: frontmatter, fenced code blocks, headers, footnote definitions,
 * directive blocks (`:::...:::`), table rows, and blank lines. List items
 * ARE scanned — they commonly carry birth/death/place facts.
 *
 * Severity: 'info'. The verify phase of `wai author` treats any citation
 * finding for the current slug as blocking (phase 7 won't run), but
 * standalone `wai check` and the data-repo pre-commit hook surface them as
 * non-blocking warnings — manual edits aren't held to the same gate.
 */
export const detectCitationDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    // Talk pages are working-notes surfaces — the outline phase commits its
    // drafting plan there, and research notes live there as raw input. Holding
    // them to citation strictness defeats the working-doc purpose; the
    // article page is where editorial rigor must hold.
    if (page.slug.endsWith('.talk')) continue;
    findings.push(...detectInPage(page));
  }
  return findings;
};

const YEAR_RE = /\b(1[5-9]\d{2}|20[0-9]\d|21[0-2]\d)\b/;
const WIKILINK_RE = /\[\[[^\]]+\]\]/;
const FOOTNOTE_REF_RE = /\[\^[a-zA-Z0-9_-]+\](?!:)/;
const CITE_NEEDED_RE = /\[\?\]/;

// Bullet that opens with a single wikilink followed by an optional short
// relation descriptor (`- [[link]] — wife`, `* [[link|Name]] — son`). These
// are See-also / family-list entries; the wikilink is navigation, not a
// claim. The descriptor is checked separately below — if it contains its
// own year/date/second wikilink, the line stays flagged.
const BULLET_RELATION_RE = /^\s*[-*+]\s+\[\[[^\]]+\]\](?:\s*[—–-]\s*(.+))?\s*$/;

// H2 sections whose contents we exempt from citation strictness because
// they enumerate sources rather than make claims:
//   - `## Bibliography`    : the references list — bibliography entries
//                            ARE the sources, citing them would be recursive
//   - `## Further reading` : same rationale; used when entries inform but
//                            weren't pulled into [^id] footnotes
//
// Note: `## See also` is NOT in this set — its main shape (relation
// bullets) is handled by BULLET_RELATION_RE below, which still lets a
// descriptor smuggling a year/date/second-wikilink fall through and be
// flagged. Section-level skip on See-also would let real claims slip
// past unchecked.
const SKIPPABLE_H2 = new Set(['bibliography', 'further reading']);

function detectInPage(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const lines = page.text.split('\n');
  const bodyStart = bodyStartIndex(lines);
  let inCode = false;
  let inDirective = false;
  // Toggled on `---` lines encountered in the body. Some pages have a second
  // frontmatter block embedded by buggy author pipelines (and we want to
  // forgive that, not double-flag every field as a factual line). The first
  // frontmatter is already skipped by bodyStart.
  let inEmbeddedFrontmatter = false;
  // Tracks the current `## ` heading lowercased so we can skip whole
  // bibliography / further-reading / see-also sections. Cleared by the next
  // `## ` heading; nested `###` headings don't change it.
  let currentH2: string | null = null;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Code-fence toggle (line is the fence itself; skip it too)
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    // Embedded `---` block — treat as frontmatter and skip its contents.
    if (trimmed === '---') {
      inEmbeddedFrontmatter = !inEmbeddedFrontmatter;
      continue;
    }
    if (inEmbeddedFrontmatter) continue;

    // Directive-block toggle (`:::name` opens, bare `:::` closes)
    if (trimmed.startsWith(':::')) {
      // A directive can be a single-line block `:::name{...}` (no toggle)
      // or a multi-line block (`:::name\n...\n:::`). Toggle only on
      // multi-line opens/closes.
      if (trimmed === ':::') {
        inDirective = false;
      } else if (!inDirective) {
        // Opens: assume multi-line. A single-line directive doesn't have
        // body content to flag, so it's fine if we toggle and then toggle
        // back when we hit the next `:::` line; if we don't, single-line
        // directives leave inDirective true until the next block close —
        // acceptable for v1 since directive bodies aren't claim-bearing
        // prose anyway.
        inDirective = true;
      }
      continue;
    }
    if (inDirective) continue;

    // Skip non-prose lines
    if (trimmed === '') continue;
    // Headers — track H2 transitions so we can skip whole skippable sections.
    // H3/H4/... headers don't change currentH2; they nest inside the H2.
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      currentH2 = trimmed.slice(3).trim().toLowerCase();
      continue;
    }
    if (trimmed.startsWith('#')) continue;          // other headers
    // Skip the entire body of bibliography / further-reading / see-also.
    // These sections enumerate sources or navigation, not claims.
    if (currentH2 !== null && SKIPPABLE_H2.has(currentH2)) continue;
    if (/^\[\^[a-zA-Z0-9_-]+\]:/.test(trimmed)) continue;  // footnote definitions
    if (trimmed.startsWith('|')) continue;          // table rows
    // Single-colon leaf directives (`::cite-vault{...}`, `::cite-message{...}`,
    // `::open`, etc.). These ARE citations or admonitions; they don't need
    // their own citation. Triple-colon block directives (`:::name`) are
    // handled by the inDirective toggle above.
    if (/^::[a-zA-Z][\w-]*(\{|\s|$)/.test(trimmed)) continue;
    // Bare-wikilink navigation list items (`* [[name]]`, `- [[name|Display]]`)
    // and stand-alone `[[wikilinks]]` — these are See-also / cross-reference
    // entries, not factual claims. Skip them.
    if (/^\s*([-*+]\s+)?\[\[[^\]]+\]\]\s*$/.test(line)) continue;
    // Relation bullets (`- [[link]] — wife`, `* [[link|Name]] — son`). The
    // wikilink is navigation; the descriptor is a relation tag. Skip iff
    // the descriptor contains no factual triggers of its own — if someone
    // smuggled a year, date, or second wikilink into the descriptor, that
    // is a claim and falls through to the normal scan.
    const relMatch = line.match(BULLET_RELATION_RE);
    if (relMatch) {
      const descriptor = relMatch[1] ?? '';
      if (!YEAR_RE.test(descriptor)
          && !WIKILINK_RE.test(descriptor)
          && findDatesInLine(descriptor).length === 0) {
        continue;
      }
    }

    if (!isFactual(line)) continue;
    if (FOOTNOTE_REF_RE.test(line) || CITE_NEEDED_RE.test(line)) continue;
    const preview = trimmed.length > 100 ? trimmed.slice(0, 100) + '…' : trimmed;
    findings.push({
      category: 'citation',
      severity: 'info',
      message: `${page.slug}: factual line has no source — add a footnote or mark with [?]: "${preview}"`,
      location: { file: page.path, line: i + 1 },
    });
  }
  return findings;
}

function bodyStartIndex(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return i + 1;
  }
  return 0;
}

function isFactual(line: string): boolean {
  if (YEAR_RE.test(line)) return true;
  if (WIKILINK_RE.test(line)) return true;
  if (findDatesInLine(line).length > 0) return true;
  return false;
}
