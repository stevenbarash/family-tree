import { join } from 'node:path';

export type NarrativeMode = 'edit' | 'print' | 'ingest';

export interface NarrativeOptions {
  rootDir: string;
  slug: string;
  mode: NarrativeMode;
  ingestPath?: string;
  readFile: (path: string) => string | null;
  writeFile: (path: string, content: string) => void;
  exists: (path: string) => boolean;
  editInEditor: (initial: string) => Promise<string>;
  gitAdd: (paths: string[]) => void;
  gitCommit: (message: string) => void;
  gitHasUncommittedChanges: () => boolean;
  now: () => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runNarrative(opts: NarrativeOptions): Promise<number> {
  const path = join(opts.rootDir, 'pages', `${opts.slug}.narrative.md`);

  if (opts.mode === 'print') {
    const existing = opts.readFile(path);
    if (existing === null) {
      opts.writeErr(`narrative: ${path} does not exist\n`);
      return 2;
    }
    opts.write(existing);
    return 0;
  }

  if (opts.gitHasUncommittedChanges()) {
    opts.writeErr(`narrative: ${opts.rootDir} has uncommitted changes; commit or stash first\n`);
    return 7;
  }

  const existed = opts.exists(path);
  let nextBody: string;

  if (opts.mode === 'ingest') {
    if (!opts.ingestPath) {
      opts.writeErr(`narrative: --file requires a path\n`);
      return 2;
    }
    const ingested = opts.readFile(opts.ingestPath);
    if (ingested === null) {
      opts.writeErr(`narrative: ${opts.ingestPath} not found\n`);
      return 3;
    }
    nextBody = ingested;
  } else {
    const initial = opts.readFile(path) ?? defaultFrontmatter(opts.slug, opts.now());
    nextBody = await opts.editInEditor(initial);
    if (nextBody.trim() === '' || nextBody === initial) {
      opts.write(`narrative: no changes\n`);
      return 0;
    }
  }

  opts.writeFile(path, nextBody);
  opts.gitAdd([path]);
  const verb = existed ? 'update' : 'create';
  opts.gitCommit(`narrative(${opts.slug}): ${verb}`);
  opts.write(`narrative: ${verb}d ${path}\n`);
  return 0;
}

function defaultFrontmatter(slug: string, today: string): string {
  const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `---\ntitle: ${title}\nsubject: ${slug}\ncreated: ${today}\nupdated: ${today}\n---\n\n`;
}
