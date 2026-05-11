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
    `### ${now} — pipeline run ${runId}`,
    `- Phases completed: ${summary.phases}/${TOTAL_PHASES}`,
    `- Episodes drafted: ${summary.episodes}`,
    `- Sources cited: ${summary.sources}`,
    '',
  ].join('\n');
}
