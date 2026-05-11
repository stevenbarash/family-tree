import type { Detector, Finding, FindingCategory, Fix, RepoState } from '@core/checks/types.ts';

export interface RunDetectorsOptions {
  state: RepoState;
  detectors: ReadonlyArray<Detector>;
  only: ReadonlyArray<FindingCategory> | null;
  fix: boolean;
  /** Called for each file the fix loop rewrites. */
  writeFile: (file: string, content: string) => void;
  /** Called when a fix is skipped because the line content drifted. */
  writeErr?: (s: string) => void;
  /** Re-read state after applying fixes (so remaining findings reflect post-fix state). */
  reload: () => Promise<RepoState>;
}

export interface RunDetectorsResult {
  findings: ReadonlyArray<Finding>;
  fixedCount: number;
}

export async function runDetectors(opts: RunDetectorsOptions): Promise<RunDetectorsResult> {
  const { state, detectors, only, fix } = opts;

  // Step 1: collect all findings.
  let findings: Finding[] = [];
  for (const det of detectors) findings.push(...det(state));

  // Step 2: filter by category.
  if (only) {
    const keep = new Set(only);
    findings = findings.filter(f => keep.has(f.category));
  }

  // Step 3: consistency findings are never auto-fixed — short-circuit.
  if (fix && only?.includes('consistency')) {
    return { findings, fixedCount: 0 };
  }

  if (!fix) {
    return { findings, fixedCount: 0 };
  }

  // Step 4: apply fixes.
  const fixesByFile = new Map<string, Fix[]>();
  for (const f of findings) {
    if (!f.fix) continue;
    const arr = fixesByFile.get(f.fix.file) ?? [];
    arr.push(f.fix);
    fixesByFile.set(f.fix.file, arr);
  }

  let fixedCount = 0;
  for (const [file, fixes] of fixesByFile) {
    const sourceText = file === state.gedcomPath
      ? state.gedcomText
      : (state.pages.find(p => p.path === file)?.text ?? '');
    const lines = sourceText.split('\n');
    let fileApplied = 0;
    for (const fix of fixes) {
      const idx = fix.lineNumber - 1;
      if (lines[idx] !== fix.oldLine) {
        opts.writeErr?.(`skipping fix at ${file}:${fix.lineNumber} — line content changed since detection\n`);
        continue;
      }
      lines[idx] = fix.newLine;
      fileApplied += 1;
    }
    if (fileApplied > 0) {
      opts.writeFile(file, lines.join('\n'));
      fixedCount += fileApplied;
    }
  }

  // Step 5: reload and re-run to get remaining findings.
  const fresh = await opts.reload();
  let remaining: Finding[] = [];
  for (const det of detectors) remaining.push(...det(fresh));
  if (only) {
    const keep = new Set(only);
    remaining = remaining.filter(f => keep.has(f.category));
  }

  return { findings: remaining, fixedCount };
}
