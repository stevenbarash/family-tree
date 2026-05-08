import type { Detector, Finding, FindingCategory, RepoState } from '@core/checks/types.ts';

export interface CheckOptions {
  rootDir: string;
  json: boolean;
  fix: boolean;
  only: ReadonlyArray<FindingCategory> | null;
  failOn: ReadonlyArray<FindingCategory> | null;
  loadState: (rootDir: string) => Promise<RepoState>;
  detectors: ReadonlyArray<Detector>;
  write: (s: string) => void;
  writeErr: (s: string) => void;
  writeFile: (file: string, content: string) => void;
}

export async function runCheck(opts: CheckOptions): Promise<number> {
  const state = await opts.loadState(opts.rootDir);
  let findings: Finding[] = [];
  for (const det of opts.detectors) findings.push(...det(state));
  if (opts.only) {
    const keep = new Set(opts.only);
    findings = findings.filter(f => keep.has(f.category));
  }

  // (Task 10 inserts the --fix branch here.)

  if (opts.json) {
    opts.write(JSON.stringify({ findings }, null, 2));
    return findings.length === 0 ? 0 : 1;
  }

  const byCat = new Map<FindingCategory, Finding[]>();
  for (const f of findings) {
    const arr = byCat.get(f.category) ?? [];
    arr.push(f);
    byCat.set(f.category, arr);
  }
  for (const cat of (['format', 'data', 'schema', 'coverage'] as const)) {
    const arr = byCat.get(cat) ?? [];
    if (arr.length === 0) continue;
    const fixable = arr.filter(f => f.fix).length;
    opts.write(`${cat.padEnd(16)} [ ${arr.length} findings, ${fixable} fixable ]\n`);
    for (const f of arr) {
      const where = f.location.line ? `:${f.location.line}` : '';
      opts.write(`  ${f.location.file}${where}  ${f.message}\n`);
    }
    opts.write('\n');
  }
  opts.write(`${byCat.size} categories, ${findings.length} findings.\n`);

  // Exit-code mapping
  if (findings.length === 0) return 0;
  if (opts.failOn) {
    const fail = new Set(opts.failOn);
    const matched = findings.some(f => fail.has(f.category));
    return matched ? 1 : 0;
  }
  return 1;
}
