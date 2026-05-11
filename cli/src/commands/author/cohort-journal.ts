export interface JournalEntry {
  ts: string;
  runId: string;
  slug: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  reason?: string;
}

export interface JournalDeps {
  rootDir: string;
  appendFile: (path: string, content: string) => void;
  mkdirP: (path: string) => void;
}

export function journalAppend(entry: JournalEntry, deps: JournalDeps): void {
  const dir = `${deps.rootDir}/data/author-runs`;
  deps.mkdirP(dir);
  deps.appendFile(`${dir}/${entry.runId}.jsonl`, JSON.stringify(entry) + '\n');
}

export function journalReadCompleted(
  runId: string,
  rootDir: string,
  readFile: (p: string) => string | null,
): ReadonlySet<string> {
  const text = readFile(`${rootDir}/data/author-runs/${runId}.jsonl`);
  if (!text) return new Set();
  const completed = new Set<string>();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const entry = JSON.parse(t) as JournalEntry;
      if (entry.status === 'completed') completed.add(entry.slug);
    } catch { /* skip malformed lines */ }
  }
  return completed;
}

export function journalReadStartedNotCompleted(
  runId: string,
  rootDir: string,
  readFile: (p: string) => string | null,
): ReadonlySet<string> {
  const text = readFile(`${rootDir}/data/author-runs/${runId}.jsonl`);
  if (!text) return new Set();
  const started = new Set<string>();
  const completed = new Set<string>();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const entry = JSON.parse(t) as JournalEntry;
      if (entry.status === 'started') started.add(entry.slug);
      if (entry.status === 'completed') completed.add(entry.slug);
    } catch { /* skip */ }
  }
  for (const s of completed) started.delete(s);
  return started;
}
