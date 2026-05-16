export interface VerifyDeps {
  runCheck: (args: { only: string[]; fix?: boolean; slugFilter?: string }) => Promise<{ exitCode: number; findingCount: number; fixedCount: number }>;
  /**
   * The slug being authored. When set, the consistency check only counts
   * findings whose `location.file` is the slug's page or talk page —
   * pre-existing findings on unrelated pages don't block this run. Format
   * and schema fixes still apply globally (they're idempotent normalizations).
   */
  slug: string;
}

export interface VerifyResult {
  fixesApplied: number;
  consistencyFindings: number;
  citationFindings: number;
  blocked: boolean;
}

export async function verify(deps: VerifyDeps): Promise<VerifyResult> {
  const fix = await deps.runCheck({ only: ['format', 'schema'], fix: true });
  const consistency = await deps.runCheck({ only: ['consistency'], slugFilter: deps.slug });
  const citation = await deps.runCheck({ only: ['citation'], slugFilter: deps.slug });
  return {
    fixesApplied: fix.fixedCount,
    consistencyFindings: consistency.findingCount,
    citationFindings: citation.findingCount,
    blocked: consistency.findingCount > 0 || citation.findingCount > 0,
  };
}
