import type { Detector, Finding, FindingCategory, RepoState } from '@core/checks/types.ts';
import { runDetectors } from './check/run-detectors.js';

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

  if (opts.fix && opts.only?.includes('consistency')) {
    opts.writeErr(`check --fix --only consistency: consistency findings are never auto-fixed; drop --fix or change --only\n`);
    return 2;
  }

  if (opts.fix) {
    const result = await runDetectors({
      state,
      detectors: opts.detectors,
      only: opts.only,
      fix: true,
      writeFile: opts.writeFile,
      writeErr: opts.writeErr,
      reload: () => opts.loadState(opts.rootDir),
    });
    opts.write(`${result.fixedCount} fix${result.fixedCount === 1 ? '' : 'es'} applied.\n`);
    return result.findings.length === 0 ? 0 : 1;
  }

  // No-fix path: run detectors, collect and filter findings.
  const { findings } = await runDetectors({
    state,
    detectors: opts.detectors,
    only: opts.only,
    fix: false,
    writeFile: opts.writeFile,
    writeErr: opts.writeErr,
    reload: () => opts.loadState(opts.rootDir),
  });

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
  for (const cat of (['format', 'data', 'schema', 'coverage', 'consistency'] as const)) {
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
  const cats = byCat.size === 1 ? 'category' : 'categories';
  const finds = findings.length === 1 ? 'finding' : 'findings';
  opts.write(`${byCat.size} ${cats}, ${findings.length} ${finds}.\n`);

  // Exit-code mapping
  if (findings.length === 0) return 0;
  if (opts.failOn) {
    const fail = new Set(opts.failOn);
    const matched = findings.some(f => fail.has(f.category));
    return matched ? 1 : 0;
  }
  return 1;
}
