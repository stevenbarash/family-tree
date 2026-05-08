import type { Detector, Finding, RepoState } from './types.ts';
import { CURRENT_SCHEMA_VERSION } from '../pages/migrations/index.ts';

export const detectSchemaDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    if (page.meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `page at schemaVersion ${page.meta.schemaVersion}, current is ${CURRENT_SCHEMA_VERSION} — run \`wai migrate\``,
        location: { file: page.path },
      });
    }
  }
  return findings;
};
