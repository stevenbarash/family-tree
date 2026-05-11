export interface VerifyDeps {
  runCheck: (args: { only: string[]; fix?: boolean }) => Promise<{ exitCode: number; findingCount: number; fixedCount: number }>;
}

export interface VerifyResult {
  fixesApplied: number;
  consistencyFindings: number;
  blocked: boolean;
}

export async function verify(deps: VerifyDeps): Promise<VerifyResult> {
  const fix = await deps.runCheck({ only: ['format', 'schema'], fix: true });
  const consistency = await deps.runCheck({ only: ['consistency'] });
  return {
    fixesApplied: fix.fixedCount,
    consistencyFindings: consistency.findingCount,
    blocked: consistency.findingCount > 0,
  };
}
