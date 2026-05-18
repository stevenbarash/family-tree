import type { Detector, Finding, RepoState } from './types.ts';

/**
 * Assert that the `name:` field inside the page's `:::infobox-*` block
 * matches the page's frontmatter title. Catches the case where a user
 * renames a person on the wiki by editing the title in frontmatter but
 * leaves the infobox name (rendered in the page heading area) untouched
 * — or vice versa.
 *
 * Tolerant rule: if the infobox name CONTAINS the title as a substring,
 * the divergence is treated as intentional (a richer multilingual form,
 * e.g. "Clara קלרה Barash" alongside title "Clara Barash"). Only flag
 * when the two values clearly disagree.
 *
 * Silent when:
 *   - Page has no infobox block.
 *   - Infobox block has no `name:` field.
 *
 * Severity is `warn` — the user picks which side wins.
 */
export const detectInfoboxNameDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const p of state.pages) {
    const infoboxName = extractInfoboxName(p.body);
    if (infoboxName === null) continue;
    const title = p.meta.title;
    if (infoboxName === title) continue;
    if (isRicherForm(title, infoboxName)) continue; // richer form, intentional
    findings.push({
      category: 'consistency',
      severity: 'warn',
      message: `infobox name "${infoboxName}" diverges from frontmatter title "${title}" — pick one and update the other`,
      location: { file: p.path },
    });
  }
  return findings;
};

/**
 * Title is a "subsequence" of infobox name when every whitespace-separated
 * token in the title appears in the infobox name, in order, with optional
 * extra tokens interleaved. Lets "Clara Barash" pass against
 * "Clara קלרה Barash" or "Aidele" against "Aidele (recorded form *Eidel*)".
 */
function isRicherForm(title: string, infoboxName: string): boolean {
  const titleTokens = title.split(/\s+/).filter(Boolean);
  const infoTokens = infoboxName.split(/\s+/).filter(Boolean);
  let i = 0;
  for (const tok of infoTokens) {
    if (tok === titleTokens[i]) i++;
    if (i === titleTokens.length) return true;
  }
  return false;
}

/**
 * Find the first `:::infobox-*` directive block and extract its `name:`
 * value (the first line inside the block whose key is `name`). Returns
 * null if no infobox is present or it carries no name.
 *
 * Handles bare and double-quoted YAML scalars. Multiline / folded
 * scalars are not supported — infobox names in this project are always
 * single-line.
 */
function extractInfoboxName(body: string): string | null {
  const lines = body.split('\n');
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      if (/^:::infobox-/.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() === ':::') return null; // block ended without a name
    const m = /^name:\s*(.+)$/.exec(line);
    if (!m) continue;
    let v = m[1]!.trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return v;
  }
  return null;
}
