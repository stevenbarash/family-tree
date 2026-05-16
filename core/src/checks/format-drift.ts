import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';
import { normalizeDate, findDatesInLine } from '../format/dates.ts';

const MAX_PREVIEW = 80;

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
  let inCode = false;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    // Toggle on fence-open / fence-close lines, AND skip the fence line itself.
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const hits = findDatesInLine(line);
    if (hits.length === 0) continue;
    let newLine = line;
    let changed = false;
    let ambiguousHit = false;
    for (const hit of [...hits].reverse()) {
      const result = normalizeDate(hit.text);
      if (result.ambiguous) { ambiguousHit = true; continue; }
      if (!result.changed) continue;
      newLine = newLine.slice(0, hit.start) + result.value + newLine.slice(hit.start + hit.text.length);
      changed = true;
    }
    if (changed) {
      const trimmed = newLine.trim();
      const preview = trimmed.length > MAX_PREVIEW ? trimmed.slice(0, MAX_PREVIEW) + '…' : trimmed;
      findings.push({
        category: 'format',
        severity: 'info',
        message: `non-canonical date(s) in page body → "${preview}"`,
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
