import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';

/**
 * Surface non-canonical editorial-thread shapes on talk pages. The
 * canonical form is documented in the editorial-guide skill:
 *
 *   ## Heading text
 *   ::open                      (or ::closed, ::superseded, ::gap)
 *
 *   body markdown
 *
 * The renderer's parser (`core/src/pages/talk-threads.ts`) only
 * recognises that shape. Two real failure modes have appeared in
 * the wiki's corpus and are silently invisible to readers:
 *
 *   - **Orphan marker**: a `::marker` line with no `##`/`###` heading
 *     directly above it. Often a paragraph starts with bold-prefix
 *     text intended as the topic. Without a heading the parser has
 *     nothing to render as the card title and the thread is dropped.
 *
 *   - **Single-line marker**: `## ::open <id>` — heading and marker
 *     concatenated. The parser expects the marker on its own line
 *     after the heading; a same-line pair is treated as a heading
 *     without a marker and skipped.
 *
 * MediaWiki-style `== Heading ==` followed by a marker is also
 * silently ignored — it falls into the orphan-marker bucket because
 * `==` isn't a markdown heading.
 *
 * Severity is `warn`: the file isn't corrupt and the talk page itself
 * still renders the marker as a colored admonition; the loss is on the
 * live-article surface, which the user has opted into.
 */
export const detectTalkThreadShape: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    if (!page.slug.endsWith('.talk')) continue;
    findings.push(...detectInOnePage(page));
  }
  return findings;
};

function detectInOnePage(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  // Scan the full file text so reported line numbers match the editor;
  // skip frontmatter so we don't false-match `## …` inside YAML.
  const lines = page.text.split('\n');
  const start = bodyStartIndex(lines);

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;

    // Single-line: `## ::open ...` or `### ::closed ...`
    const sameLine = /^(#{2,3}) ::(open|closed|superseded|gap)\b/.exec(line);
    if (sameLine) {
      findings.push({
        category: 'schema',
        severity: 'warn',
        message: `${page.slug}: thread marker on same line as heading ("${line.trim()}") — split onto two lines: heading on one, \`::${sameLine[2]}\` on the next`,
        location: { file: page.path, line: i + 1 },
      });
      continue;
    }

    // Bare marker: `::open` at line-start. Walk back over blank lines
    // and assert that the previous non-blank line is a ## or ### heading.
    const markerLine = /^::(open|closed|superseded|gap)\b/.exec(line);
    if (!markerLine) continue;

    let j = i - 1;
    while (j >= start && lines[j]! === '') j--;
    const prev = j >= start ? lines[j]! : '';
    if (/^#{2,3} /.test(prev)) continue; // canonical — fine

    const prevPreview = prev.slice(0, 60) + (prev.length > 60 ? '...' : '');
    findings.push({
      category: 'schema',
      severity: 'warn',
      message: `${page.slug}: orphan \`::${markerLine[1]}\` marker — no \`##\` or \`###\` heading directly above` +
        (prev ? ` (previous line: "${prevPreview}")` : ' (at top of file)'),
      location: { file: page.path, line: i + 1 },
    });
  }

  return findings;
}

/**
 * Index of the first body line in a markdown file with optional YAML
 * frontmatter — i.e. the line after the closing `---`. Returns 0 when
 * the file has no frontmatter. Mirrors `format-drift.ts`.
 */
function bodyStartIndex(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return i + 1;
  }
  return 0;
}
