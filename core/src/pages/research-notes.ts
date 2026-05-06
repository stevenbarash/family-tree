/**
 * Append a single research note to the `## Research notes` section
 * of a talk-page body, preserving day-grouped chronology (newest day
 * first). Pure: returns a new body string, never mutates input.
 *
 * - If the section is missing, append it at the end of the body.
 * - If the section exists but has no entry for `date`, insert a new
 *   `### date` heading at the top of the section.
 * - If a `### date` heading already exists, append a new bullet to
 *   the end of that heading's bullet list.
 */
export function appendResearchNote(body: string, date: string, note: string): string {
  const bullet = formatBullet(note);
  const lines = body.split('\n');

  const sectionIdx = lines.findIndex((l) => /^## Research notes\s*$/.test(l));

  if (sectionIdx === -1) {
    const trimmed = body.replace(/\s+$/, '');
    const sep = trimmed.length === 0 ? '' : '\n\n';
    return `${trimmed}${sep}## Research notes\n\n### ${date}\n${bullet}\n`;
  }

  // Section spans [sectionIdx+1, endIdx) — up to the next `## ` heading or EOF.
  let endIdx = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }

  const todayHeading = `### ${date}`;
  let todayIdx = -1;
  for (let i = sectionIdx + 1; i < endIdx; i++) {
    if (lines[i] === todayHeading) {
      todayIdx = i;
      break;
    }
  }

  if (todayIdx !== -1) {
    let blockEnd = endIdx;
    for (let i = todayIdx + 1; i < endIdx; i++) {
      if (/^### /.test(lines[i]!)) {
        blockEnd = i;
        break;
      }
    }
    let insertAt = blockEnd;
    while (insertAt > todayIdx + 1 && lines[insertAt - 1] === '') insertAt--;
    lines.splice(insertAt, 0, ...bullet.split('\n'));
    return lines.join('\n');
  }

  // New day: insert above existing entries, just under the section heading.
  let insertAt = sectionIdx + 1;
  while (insertAt < endIdx && lines[insertAt] === '') insertAt++;

  const block: string[] = [todayHeading, ...bullet.split('\n')];
  if (insertAt < endIdx && lines[insertAt] !== '') block.push('');
  if (lines[sectionIdx + 1] !== '') block.unshift('');

  lines.splice(insertAt, 0, ...block);
  return lines.join('\n');
}

/**
 * Return the markdown body of the `## Research notes` section
 * (without the `## Research notes` heading itself), or an empty
 * string if no such section exists. Used by the renderer to surface
 * the section on the article page without re-parsing the heading.
 */
export function extractResearchNotesSection(body: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^## Research notes\s*$/.test(l));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  let bodyStart = start + 1;
  while (bodyStart < end && lines[bodyStart] === '') bodyStart++;
  return lines.slice(bodyStart, end).join('\n').replace(/\s+$/, '');
}

function formatBullet(note: string): string {
  const trimmed = note.replace(/\s+$/, '').replace(/^\n+/, '');
  if (trimmed === '') return '- (empty)';
  const noteLines = trimmed.split('\n');
  const head = noteLines[0]!;
  const tail = noteLines.slice(1).map((l) => (l.length === 0 ? '' : `  ${l}`));
  return [`- ${head}`, ...tail].join('\n');
}
