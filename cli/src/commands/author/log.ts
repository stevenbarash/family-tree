import { TOTAL_PHASES } from './pipeline-run.js';

export interface LogSummary {
  phases: number;
  episodes: number;
  sources: number;
}

export function formatAgentLog(slug: string, runId: string, summary: LogSummary, now: string): string {
  return [
    '## Agent log',
    '',
    formatLogSubsection(runId, summary, now),
    '',
  ].join('\n');
}

/**
 * Splice a new `### <date> — pipeline run <id>` subsection into the talk
 * body's `## Agent log` section. If the section already exists (from a
 * prior pipeline run), the new subsection is appended at the end of that
 * section so the section header isn't duplicated — preserving each run's
 * entry as visible history. If the section doesn't exist yet, create it.
 *
 * This is the Phase 7 counterpart to `replaceOrAppendOutline` (Phase 3):
 * both keep the talk page structurally clean across retries and resumes
 * instead of accreting duplicate section headers.
 */
export function appendLogEntry(existingBody: string, runId: string, summary: LogSummary, now: string): string {
  const subsection = formatLogSubsection(runId, summary, now);
  const marker = '## Agent log';
  // Anchor to line start so a literal "## Agent log" in a research-note
  // paragraph or a fenced code block doesn't get matched as the section
  // header — same anchoring discipline the next-heading scan below uses
  // via `\n## `.
  const sectionStart = findSectionStart(existingBody, marker);
  if (sectionStart === -1) {
    const newSection = `${marker}\n\n${subsection}\n`;
    const trimmed = existingBody.trim();
    return trimmed ? `${existingBody.trimEnd()}\n\n${newSection}` : newSection;
  }
  // Find the next `## ` heading after the section marker — that's where
  // the Agent log section ends. We splice the new subsection just before
  // that boundary; everything else in the body stays put.
  const nextHeading = existingBody.indexOf('\n## ', sectionStart + marker.length);
  if (nextHeading === -1) {
    // Agent log is the last section; append the new subsection at end.
    return `${existingBody.trimEnd()}\n\n${subsection}\n`;
  }
  const before = existingBody.slice(0, nextHeading + 1).trimEnd();
  const after = existingBody.slice(nextHeading + 1);
  return `${before}\n\n${subsection}\n\n${after}`;
}

function findSectionStart(body: string, marker: string): number {
  const lines = body.split('\n');
  let inCode = false;
  let pos = 0;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode;
      pos += line.length + 1;
      continue;
    }
    if (!inCode && line.startsWith(marker)) return pos;
    pos += line.length + 1;
  }
  return -1;
}

function formatLogSubsection(runId: string, summary: LogSummary, now: string): string {
  return [
    `### ${now} — pipeline run ${runId}`,
    `- Phases completed: ${summary.phases}/${TOTAL_PHASES}`,
    `- Episodes drafted: ${summary.episodes}`,
    `- Sources cited: ${summary.sources}`,
  ].join('\n');
}
