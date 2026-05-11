export type CohortSelector =
  | { kind: 'missing' }
  | { kind: 'file'; path: string };

export interface ResolveDeps {
  rootDir: string;
  /** Reads slugs that exist as pages (basename without .md, excluding *.talk.md and *.narrative.md). */
  listExistingPages: (rootDir: string) => ReadonlyArray<string>;
  /** Reads derived/<rec>.yml files; returns slug-form names. */
  listDerivedSlugs: (rootDir: string) => Promise<ReadonlyArray<string>>;
  readFile: (path: string) => string | null;
}

export async function resolveCohort(selector: CohortSelector, deps: ResolveDeps): Promise<ReadonlyArray<string>> {
  if (selector.kind === 'file') {
    const text = deps.readFile(selector.path);
    if (text === null) throw new Error(`cohort: file not found: ${selector.path}`);
    return text.split('\n')
      .map(l => l.replace(/#.*$/, '').trim())
      .filter(l => l.length > 0);
  }
  // 'missing': all derived slugs without a page.
  const pages = new Set(deps.listExistingPages(deps.rootDir));
  const derived = await deps.listDerivedSlugs(deps.rootDir);
  return derived.filter(s => !pages.has(s));
}

export function parseSelector(raw: string): CohortSelector {
  if (raw === 'missing') return { kind: 'missing' };
  if (raw.startsWith('file:')) return { kind: 'file', path: raw.slice('file:'.length) };
  throw new Error(`cohort: unknown selector: ${raw} (supported: missing, file:<path>)`);
}
