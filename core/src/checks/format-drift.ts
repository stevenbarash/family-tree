import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';
import { normalizeDate } from '../format/dates.ts';

export const detectFormatDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const lines = state.gedcomText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match "<level> DATE <value>" — DATE always at level 2 in our GEDCOMs
    // but the detector tolerates any level for forward compat.
    const m = line.match(/^(\d+\s+DATE\s+)(.+)$/);
    if (!m) continue;
    const [, prefix, value] = m;
    const result = normalizeDate(value!);
    if (!result.changed && !result.ambiguous) continue;
    if (result.ambiguous) {
      findings.push({
        category: 'format',
        severity: 'warn',
        message: `ambiguous slash date "${value}" — needs manual disambiguation (m/d/y vs d/m/y)`,
        location: { file: state.gedcomPath, line: i + 1 },
      });
      continue;
    }
    findings.push({
      category: 'format',
      severity: 'info',
      message: `non-canonical date "${value}" → "${result.value}"`,
      location: { file: state.gedcomPath, line: i + 1 },
      fix: {
        file: state.gedcomPath,
        lineNumber: i + 1,
        oldLine: line,
        newLine: `${prefix}${result.value}`,
      },
    });
  }

  // Page bodies
  for (const page of state.pages) {
    findings.push(...detectInPage(page));
  }
  return findings;
};

// Match date-like substrings strictly. Order matters: longer / more specific
// patterns first so they're tried before shorter ones.
const DATE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}\b/g,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
];

function findDatesInLine(line: string): Array<{ start: number; text: string }> {
  const hits: Array<{ start: number; text: string }> = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      // Skip overlap with already-recorded hits
      const overlaps = hits.some(h => m!.index < h.start + h.text.length && m!.index + m![0].length > h.start);
      if (!overlaps) hits.push({ start: m.index, text: m[0]! });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function inFencedCodeBlock(lines: string[], lineIdx: number): boolean {
  let inside = false;
  for (let i = 0; i < lineIdx; i++) {
    if (lines[i]!.trimStart().startsWith('```')) inside = !inside;
  }
  return inside;
}

/**
 * Find the line index (0-based) just past the frontmatter delimiter `---`,
 * if the file opens with one. Returns 0 if the file has no frontmatter.
 */
function bodyStartIndex(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return i + 1;
  }
  return 0;
}

function detectInPage(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const lines = page.text.split('\n');
  const bodyStart = bodyStartIndex(lines);
  for (let i = bodyStart; i < lines.length; i++) {
    if (inFencedCodeBlock(lines.slice(bodyStart), i - bodyStart)) continue;
    const line = lines[i]!;
    const hits = findDatesInLine(line);
    if (hits.length === 0) continue;
    let newLine = line;
    let changed = false;
    let ambiguousHit = false;
    // Apply replacements right-to-left so indices stay stable.
    for (const hit of [...hits].reverse()) {
      const result = normalizeDate(hit.text);
      if (result.ambiguous) { ambiguousHit = true; continue; }
      if (!result.changed) continue;
      newLine = newLine.slice(0, hit.start) + result.value + newLine.slice(hit.start + hit.text.length);
      changed = true;
    }
    if (changed) {
      findings.push({
        category: 'format',
        severity: 'info',
        message: `non-canonical date(s) in page body → "${newLine.trim().slice(0, 80)}…"`,
        location: { file: page.path, line: i + 1 },
        fix: { file: page.path, lineNumber: i + 1, oldLine: line, newLine },
      });
    }
    if (ambiguousHit) {
      findings.push({
        category: 'format',
        severity: 'warn',
        message: `ambiguous slash date in page body — needs manual disambiguation`,
        location: { file: page.path, line: i + 1 },
      });
    }
  }
  return findings;
}
