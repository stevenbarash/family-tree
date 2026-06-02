import { join } from 'node:path';
import type { Finding, Severity } from '@core/checks/types.ts';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, error: 2 };

/**
 * The findings the author verify gate should consider for a single run:
 * those located on the slug's own page or talk page. Canonical articles
 * live under `pages/en/` since the v2 layout migration, so that's the path
 * we match — a finding anywhere else is pre-existing drift this run did not
 * introduce and must not block it. (The old filter matched the legacy flat
 * `pages/<slug>.md` path, which no longer exists, so it matched nothing and
 * left the gate silently dead.)
 */
export function findingsForRunSlug(
  findings: ReadonlyArray<Finding>,
  rootDir: string,
  slug: string,
): Finding[] {
  const page = join(rootDir, 'pages', 'en', `${slug}.md`);
  const talk = join(rootDir, 'pages', 'en', `${slug}.talk.md`);
  return findings.filter(f => f.location?.file === page || f.location?.file === talk);
}

/**
 * Findings at or above a severity floor. The verify gate blocks on `warn`:
 * `info`-severity findings (e.g. citation "factual line has no source"
 * nudges, which hit ~half the corpus) are advisory, not blocking.
 */
export function atOrAboveSeverity(
  findings: ReadonlyArray<Finding>,
  floor: Severity,
): Finding[] {
  return findings.filter(f => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[floor]);
}
