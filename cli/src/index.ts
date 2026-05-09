#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from './api-client.js';
import { getServer, setServer } from './config.js';
import { toSlug } from './slug.js';
import { readFromFile, readFromStdin, editInEditor } from './body-input.js';
import { runRead } from './commands/read.js';
import { runWrite } from './commands/write.js';
import { runCreate } from './commands/create.js';
import { runEdit } from './commands/edit.js';
import { runDelete } from './commands/delete.js';
import { runNote } from './commands/note.js';
import { runSyncGedcom } from './commands/sync-gedcom.js';
import { runRebuildSearch } from './commands/rebuild-search.js';
import { runMigrate } from './commands/migrate.js';
import { runRecite } from './commands/recite.js';
import { runRedlinks } from './commands/redlinks.js';
import { runSearch } from './commands/search.js';
import { runExport } from './commands/export.js';
import { runHealthz } from './commands/healthz.js';
import { ApiError } from './api-client.js';
import { runCheck } from './commands/check.js';
import { runPromoteCorrections } from './commands/promote-corrections.js';
import { runInit } from './commands/init.js';
import { loadRepoState } from '@core/checks/load.ts';
import { loadPageCorrectionsWithSource } from '@core/corrections/load.ts';
import { detectFormatDrift } from '@core/checks/format-drift.ts';
import { detectDataDrift } from '@core/checks/data-drift.ts';
import { detectSchemaDrift } from '@core/checks/schema-drift.ts';
import { detectCoverageDrift } from '@core/checks/coverage-drift.ts';
import { detectPlacesDrift } from '@core/checks/places-drift.ts';
import type { FindingCategory } from '@core/checks/types.ts';

const VERSION = '2.0.0-pre.0';

const HELP = `wai — whoami.wiki cli (markdown migration)

Usage:
  wai <command> [args]

Pages:
  read <slug>                 Read a page (body to stdout; --json for full)
  write <slug> [--file F]     Write (overwrite) a page
                                body from --file F, --stdin, or positional arg
                                requires --summary
  create <slug> [--file F]    Create a new page (refuses if exists)
  edit <slug>                 Edit a page in $EDITOR
  note <slug> [text]          Append a dated research note to <slug>.talk
                                body from positional, --file F, or --stdin;
                                no body opens $EDITOR with an empty buffer
  note <slug> --edit <id> "text"
                              Edit an existing note's prose
  note <slug> --delete <id>   Soft-delete (retract) a note; reversible
  note <slug> --restore <id>  Restore a previously retracted note
  note <slug> --list [--json] List notes (id, date, preview)
  note <slug> --as-agent ...  Tag the write kind=agent (append/edit only)
  delete <slug> --yes         Soft-delete a page (moves to _archived)
  search <query> [--limit N]  Search pages, body, aliases, categories,
                                and GEDCOM-derived fields
  redlinks [--limit N] [--json]
                              List unwritten pages that other pages link to,
                                ranked by inbound count

GEDCOM:
  sync-gedcom --ged-file F    Sync GEDCOM .ged → derived/ + commit
              --notes "..."
              [--force]       Re-derive even when input bytes are unchanged
                                (use after a deriver-code update)
  recite                      Report stale snapshot pointers
  recite --apply              Advance pointers in pages

Quality:
  check                       Run all drift detectors. Exit 1 if findings.
        [--fix]                 Apply safe auto-fixes (format, schema)
        [--only A,B]            Only run detectors for categories (format,data,schema,coverage)
        [--fail-on A,B]         Exit 1 only on findings in these categories
        [--json]                Machine-readable output
  promote-corrections         Promote a frontmatter correction to the GEDCOM.
        --record I...           Record id whose corrections to promote
        [--apply]               Write changes (default: dry-run)
  init                        Install pre-commit hook + CI workflow into the
                              data repo at $WHOAMI_ROOT.
        [--force]               Overwrite existing files
        [--hook-only]           Just the pre-commit hook
        [--ci-only]             Just the CI workflow

Search:
  rebuild-search              Rebuild the search index from disk
                                (use after editing pages outside the API)
  rebuild-search --check      Exit non-zero if the index is stale (no rebuild)

Migrations:
  migrate [--dry-run] [--page <slug>] [--force]
                              Apply pending schema migrations to all pages.
                              Use after pulling a code update that bumps
                              CURRENT_SCHEMA_VERSION.

Server:
  healthz                     Ping the API
  config server <url>         Set server URL in ~/.whoami/config.json

Common flags:
  --json                      JSON output (where applicable)
  --summary <text>            Edit summary (required for write/create/edit)

Server URL: ${getServer()}  (override: WHOAMI_SERVER, ~/.whoami/config.json)
`;

interface Args {
  cmd: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let cmd: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        // --flag=value
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (cmd === undefined) {
      cmd = a;
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

async function resolveBody(args: Args): Promise<string> {
  if (typeof args.flags.file === 'string') return readFromFile(args.flags.file);
  if (args.flags.stdin) return await readFromStdin();
  if (args.positional[1] !== undefined) return args.positional[1];
  // No body source given. If stdin is a TTY, the user probably forgot;
  // erroring is friendlier than hanging on a blank prompt forever.
  if (process.stdin.isTTY) {
    throw new Error('no body provided — pass --file F, --stdin, or pipe content via stdin');
  }
  return await readFromStdin();
}

async function resolveNoteBody(args: Args): Promise<string> {
  if (typeof args.flags.file === 'string') return readFromFile(args.flags.file);
  if (args.flags.stdin) return await readFromStdin();
  if (args.positional[1] !== undefined) return args.positional[1];
  // No body source. Open $EDITOR with an empty buffer (wai note -friendly).
  if (process.stdin.isTTY) return editInEditor('');
  return await readFromStdin();
}

const REMOVED = new Set([
  'upload', 'link', 'changes', 'category', 'source', 'task',
  'place', 'snapshot', 'import', 'talk', 'section', 'auth',
]);

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.version || args.cmd === 'version' || args.cmd === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!args.cmd || args.cmd === 'help' || args.flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (REMOVED.has(args.cmd)) {
    process.stderr.write(`wai: '${args.cmd}' is not yet supported in the markdown migration.\n`);
    return 2;
  }

  const client = new ApiClient(getServer());
  const write = (s: string) => process.stdout.write(s);

  try {
    switch (args.cmd) {
      case 'read': {
        const slug = toSlug(args.positional[0] ?? '');
        await runRead({ slug, json: !!args.flags.json, client, write });
        break;
      }
      case 'write': {
        const slug = toSlug(args.positional[0] ?? '');
        const body = await resolveBody(args);
        const summary = String(args.flags.summary ?? '');
        await runWrite({ slug, body, summary, client, write });
        break;
      }
      case 'create': {
        const slug = toSlug(args.positional[0] ?? '');
        const body = await resolveBody(args);
        const summary = String(args.flags.summary ?? '');
        await runCreate({ slug, body, summary, client, write });
        break;
      }
      case 'edit': {
        const slug = toSlug(args.positional[0] ?? '');
        const summary = String(args.flags.summary ?? '');
        await runEdit({ slug, summary, client, write });
        break;
      }
      case 'delete': {
        const slug = toSlug(args.positional[0] ?? '');
        await runDelete({ slug, yes: !!args.flags.yes, client, write });
        break;
      }
      case 'note': {
        const slug = toSlug(args.positional[0] ?? '');
        // Decide mode by which flag is present (mutually exclusive).
        let mode: 'append' | 'edit' | 'delete' | 'restore' | 'list' = 'append';
        let id: string | undefined;
        if (args.flags.list) {
          mode = 'list';
        } else if (typeof args.flags.edit === 'string') {
          mode = 'edit';
          id = args.flags.edit;
        } else if (typeof args.flags.delete === 'string') {
          mode = 'delete';
          id = args.flags.delete;
        } else if (typeof args.flags.restore === 'string') {
          mode = 'restore';
          id = args.flags.restore;
        }
        const by = typeof args.flags.by === 'string'
          ? args.flags.by
          : (process.env.WHOAMI_AUTHOR_NAME || process.env.USER);
        const kind: 'human' | 'agent' = args.flags['as-agent'] || process.env.WHOAMI_NOTE_KIND === 'agent'
          ? 'agent'
          : 'human';
        const note = mode === 'append' || mode === 'edit'
          ? await resolveNoteBody(args)
          : undefined;
        await runNote({
          slug,
          mode,
          id,
          note,
          by,
          kind,
          json: !!args.flags.json,
          client,
          write,
        });
        break;
      }
      case 'sync-gedcom': {
        const gedFile = String(args.flags['ged-file'] ?? '');
        const notes = String(args.flags.notes ?? '');
        const force = !!args.flags.force;
        await runSyncGedcom({ gedFile, notes, force, client, write });
        break;
      }
      case 'recite': {
        await runRecite({ apply: !!args.flags.apply, client, write });
        break;
      }
      case 'search': {
        const query = args.positional[0] ?? '';
        const limit = parseInt(String(args.flags.limit ?? '25'), 10) || 25;
        const includeLiving = !!args.flags['include-living'];
        await runSearch({ query, limit, json: !!args.flags.json, includeLiving, client, write });
        break;
      }
      case 'check': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const parseList = (v: unknown): FindingCategory[] | null => {
          if (typeof v !== 'string') return null;
          return v.split(',').map(s => s.trim()) as FindingCategory[];
        };
        const code = await runCheck({
          rootDir: root,
          json: !!args.flags.json,
          fix: !!args.flags.fix,
          only: parseList(args.flags.only),
          failOn: parseList(args.flags['fail-on']),
          loadState: loadRepoState,
          detectors: [
            detectFormatDrift,
            detectDataDrift,
            detectSchemaDrift,
            detectCoverageDrift,
            detectPlacesDrift,
          ],
          write,
          writeErr: (s) => process.stderr.write(s),
          writeFile: (file, content) => writeFileSync(file, content),
        });
        return code;
      }
      case 'promote-corrections': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const recordArg = args.flags.record;
        if (typeof recordArg !== 'string' || !/^I\d+$/.test(recordArg)) {
          process.stderr.write('promote-corrections: --record I<digits> required\n');
          return 2;
        }
        const code = await runPromoteCorrections({
          record: recordArg,
          apply: !!args.flags.apply,
          gedcomPath: resolve(root, 'genealogy', 'barash-tree.ged'),
          pagesDir: resolve(root, 'pages'),
          loadCorrections: loadPageCorrectionsWithSource,
          readFile: (p) => readFileSync(p, 'utf-8'),
          writeFile: (p, c) => writeFileSync(p, c),
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
      case 'init': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const code = await runInit({
          rootDir: root,
          force: !!args.flags.force,
          hookOnly: !!args.flags['hook-only'],
          ciOnly: !!args.flags['ci-only'],
          writeFile: (p, c) => {
            // Hooks need exec permission; templates embed the shebang.
            writeFileSync(p, c, { mode: 0o755 });
          },
          mkdirP: (p) => { mkdirSync(p, { recursive: true }); },
          exists: (p) => existsSync(p),
          setGitConfig: (key, value) => {
            const { execFileSync } = require('node:child_process');
            execFileSync('git', ['-C', root, 'config', '--local', key, value], { stdio: 'inherit' });
          },
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
      case 'export': {
        const root = process.env.WHOAMI_ROOT
          ?? `${process.env.HOME}/whoami`;
        const outDir = typeof args.flags.out === 'string' ? args.flags.out : './export';
        await runExport({
          whoamiRoot: root,
          outDir,
          redactLiving: !!args.flags['redact-living'],
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        break;
      }
      case 'redlinks': {
        const limit = parseInt(String(args.flags.limit ?? '50'), 10) || 50;
        await runRedlinks({ limit, json: !!args.flags.json, client, write });
        break;
      }
      case 'rebuild-search': {
        await runRebuildSearch({
          check: !!args.flags.check,
          client,
          write,
        });
        break;
      }
      case 'migrate': {
        const code = await runMigrate({
          client,
          write,
          page: typeof args.flags.page === 'string' ? args.flags.page : undefined,
          dryRun: !!args.flags['dry-run'],
          force: !!args.flags.force,
          json: !!args.flags.json,
        });
        return code;
      }
      case 'healthz': {
        await runHealthz({ client, write });
        break;
      }
      case 'config': {
        if (args.positional[0] === 'server' && args.positional[1]) {
          setServer(args.positional[1]);
          write(`saved server=${args.positional[1]}\n`);
        } else {
          write(`server=${getServer()}\n`);
        }
        break;
      }
      default: {
        process.stderr.write(`wai: unknown command '${args.cmd}'. Run 'wai help' for usage.\n`);
        return 2;
      }
    }
    return 0;
  } catch (err) {
    if (err instanceof ApiError) {
      process.stderr.write(`wai: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(`wai: ${(err as Error).message}\n`);
    return 1;
  }
}

main().then(code => process.exit(code));
