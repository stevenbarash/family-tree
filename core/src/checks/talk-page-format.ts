import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';
import { parseTalkThreads } from '../pages/talk-threads.ts';

/**
 * Surface format drift in talk-page frontmatter and canonical-section
 * ordering. The standard is documented in the editorial-guide skill
 * (`plugins/whoami/skills/editorial-guide/SKILL.md`, "Talk page
 * structure" → "Frontmatter" + "Section ordering"). The format is
 * load-bearing for the i18n translation pipeline — the translator
 * needs to know exactly which lines are structural vs prose — so
 * drift here is more than cosmetic.
 *
 * Rules:
 *
 *   1. `schemaVersion: 1` is required.
 *   2. `title:` carries the `Talk:` prefix, double-quoted form.
 *   3. `type: meta` — talk pages are editorial workspace, not the
 *      article subject.
 *   4. `categories: [Open editorial questions]` iff at least one
 *      `::open` thread exists, else `categories: []`. Other tags in
 *      the list are preserved.
 *   5. When two or more of {Research notes, Drafting plan, Agent log}
 *      appear as `## ` headings, they appear in that order.
 *
 * Rules 1–4 emit line-targeted fixes (insertion encoded as
 * "replace anchor line with anchor + `\n` + new line"). Rule 5 is
 * warn-only — reordering whole sections is too risky for auto-fix
 * and is best done by hand.
 */

const CANONICAL_SECTIONS = ['Research notes', 'Drafting plan', 'Agent log'] as const;
type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];
const OPEN_EDITORIAL_TAG = 'Open editorial questions';

export const detectTalkPageFormat: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    if (!page.slug.endsWith('.talk')) continue;
    findings.push(...detectInPage(page));
  }
  return findings;
};

interface FrontmatterField {
  line: number;
  raw: string;
  value: string;
}

function detectInPage(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const lines = page.text.split('\n');

  if (lines[0]?.trim() !== '---') return findings;
  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') { fmEnd = i; break; }
  }
  if (fmEnd === -1) return findings;

  const fields = new Map<string, FrontmatterField>();
  for (let i = 1; i < fmEnd; i++) {
    const m = /^([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    fields.set(m[1]!, { line: i, raw: lines[i]!, value: m[2]! });
  }

  // Rule 1: schemaVersion
  const sv = fields.get('schemaVersion');
  if (!sv) {
    findings.push({
      category: 'schema',
      severity: 'warn',
      message: `${page.slug}: missing \`schemaVersion: 1\` in frontmatter`,
      location: { file: page.path, line: 1 },
      fix: {
        file: page.path,
        lineNumber: 1,
        oldLine: '---',
        newLine: '---\nschemaVersion: 1',
      },
    });
  } else if (sv.value.trim() !== '1') {
    findings.push({
      category: 'schema',
      severity: 'warn',
      message: `${page.slug}: schemaVersion is "${sv.value}" (expected 1)`,
      location: { file: page.path, line: sv.line + 1 },
    });
  }

  // Rule 2: title carries "Talk:" prefix
  const titleField = fields.get('title');
  if (titleField) {
    const stripped = titleField.value.trim().replace(/^["']|["']$/g, '');
    if (!stripped.startsWith('Talk: ') && stripped !== '') {
      findings.push({
        category: 'format',
        severity: 'info',
        message: `${page.slug}: title missing "Talk:" prefix (current: ${titleField.value.trim()})`,
        location: { file: page.path, line: titleField.line + 1 },
        fix: {
          file: page.path,
          lineNumber: titleField.line + 1,
          oldLine: titleField.raw,
          newLine: `title: "Talk: ${stripped}"`,
        },
      });
    }
  }

  // Rule 3: type: meta
  const typeField = fields.get('type');
  if (typeField && typeField.value.trim() !== 'meta') {
    findings.push({
      category: 'schema',
      severity: 'warn',
      message: `${page.slug}: type is "${typeField.value.trim()}" (expected meta for talk pages)`,
      location: { file: page.path, line: typeField.line + 1 },
      fix: {
        file: page.path,
        lineNumber: typeField.line + 1,
        oldLine: typeField.raw,
        newLine: 'type: meta',
      },
    });
  }

  // Rule 4: categories ↔ ::open threads
  const body = lines.slice(fmEnd + 1).join('\n');
  const openCount = parseTalkThreads(body).filter(t => t.marker === 'open').length;
  const shouldHaveTag = openCount > 0;

  const catField = fields.get('categories');
  if (!catField) {
    const aliasesField = fields.get('aliases');
    if (aliasesField) {
      const desired = shouldHaveTag ? `[${OPEN_EDITORIAL_TAG}]` : '[]';
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `${page.slug}: missing \`categories: ${desired}\` in frontmatter`,
        location: { file: page.path, line: aliasesField.line + 1 },
        fix: {
          file: page.path,
          lineNumber: aliasesField.line + 1,
          oldLine: aliasesField.raw,
          newLine: `${aliasesField.raw}\ncategories: ${desired}`,
        },
      });
    }
  } else {
    const actual = parseFlowList(catField.value);
    const hasTag = actual.includes(OPEN_EDITORIAL_TAG);
    const hasDupes = actual.length !== new Set(actual).size;
    if (hasTag !== shouldHaveTag || hasDupes) {
      const withoutTag = actual.filter(s => s !== OPEN_EDITORIAL_TAG);
      const deduped = [...new Set(withoutTag)];
      const desired = shouldHaveTag ? [...deduped, OPEN_EDITORIAL_TAG] : deduped;
      const desiredStr = desired.length === 0 ? '[]' : `[${desired.join(', ')}]`;
      const why = hasTag !== shouldHaveTag
        ? (shouldHaveTag
          ? `missing "${OPEN_EDITORIAL_TAG}" (${openCount} ::open thread${openCount === 1 ? '' : 's'})`
          : `"${OPEN_EDITORIAL_TAG}" present but no ::open threads`)
        : `duplicate entries`;
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `${page.slug}: categories ${why} — should be ${desiredStr}`,
        location: { file: page.path, line: catField.line + 1 },
        fix: {
          file: page.path,
          lineNumber: catField.line + 1,
          oldLine: catField.raw,
          newLine: `categories: ${desiredStr}`,
        },
      });
    }
  }

  // Rule 5: canonical-section ordering
  const sectionLines = new Map<CanonicalSection, number>();
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const m = /^## (.+?)\s*$/.exec(lines[i]!);
    if (!m) continue;
    const heading = m[1]!;
    if ((CANONICAL_SECTIONS as readonly string[]).includes(heading) && !sectionLines.has(heading as CanonicalSection)) {
      sectionLines.set(heading as CanonicalSection, i);
    }
  }
  if (sectionLines.size >= 2) {
    const expected = CANONICAL_SECTIONS.filter(s => sectionLines.has(s));
    const actualOrder = [...sectionLines.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
    if (expected.join('|') !== actualOrder.join('|')) {
      const firstLine = sectionLines.get(actualOrder[0]!)! + 1;
      findings.push({
        category: 'schema',
        severity: 'warn',
        message: `${page.slug}: canonical sections out of order — found ${actualOrder.join(' → ')}, expected ${expected.join(' → ')}`,
        location: { file: page.path, line: firstLine },
      });
    }
  }

  return findings;
}

function parseFlowList(v: string): string[] {
  const trimmed = v.trim();
  const m = /^\[(.*)\]$/.exec(trimmed);
  if (!m) return [];
  const inner = m[1]!.trim();
  if (inner === '') return [];
  return inner.split(',').map(s => s.trim()).filter(s => s !== '');
}
