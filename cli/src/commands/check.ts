import type { Detector, Finding, FindingCategory, Fix, RepoState } from '@core/checks/types.ts';

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

  if (opts.fix) {
    // Group fixes by file. We patch by line number, and fixes don't add or
    // remove lines, so simple index assignment is safe.
    const fixesByFile = new Map<string, Fix[]>();
    for (const f of findings) {
      if (!f.fix) continue;
      const arr = fixesByFile.get(f.fix.file) ?? [];
      arr.push(f.fix);
      fixesByFile.set(f.fix.file, arr);
    }

    let applied = 0;
    for (const [file, fixes] of fixesByFile) {
      // Pages use `text` (frontmatter included) so line numbers from detectors
      // refer to the full file. The GEDCOM is the only non-page file we touch.
      const sourceText = file === state.gedcomPath
        ? state.gedcomText
        : (state.pages.find(p => p.path === file)?.text ?? '');
      const lines = sourceText.split('\n');
      let fileApplied = 0;
      for (const fix of fixes) {
        const idx = fix.lineNumber - 1;
        if (lines[idx] !== fix.oldLine) {
          opts.writeErr(`skipping fix at ${file}:${fix.lineNumber} — line content changed since detection\n`);
          continue;
        }
        lines[idx] = fix.newLine;
        fileApplied += 1;
      }
      if (fileApplied > 0) {
        opts.writeFile(file, lines.join('\n'));
        applied += fileApplied;
      }
    }
    opts.write(`${applied} fix${applied === 1 ? '' : 'es'} applied.\n`);

    // Re-run detectors against the fresh state (caller's loadState should
    // re-read disk OR return updated in-memory state).
    const fresh = await opts.loadState(opts.rootDir);
    let remaining: Finding[] = [];
    for (const det of opts.detectors) remaining.push(...det(fresh));
    if (opts.only) {
      const keep = new Set(opts.only);
      remaining = remaining.filter(f => keep.has(f.category));
    }
    return remaining.length === 0 ? 0 : 1;
  }

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
