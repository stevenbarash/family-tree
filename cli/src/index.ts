#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { ApiClient } from './api-client.js';
import { getServer, setServer } from './config.js';
import { toSlug } from './slug.js';
import { readFromFile, readFromStdin, editInEditor } from './body-input.js';
import { runRead } from './commands/read.js';
import { runWrite } from './commands/write.js';
import { runCreate } from './commands/create.js';
import { runEdit } from './commands/edit.js';
import { runDelete } from './commands/delete.js';
import { runNote, type NoteKind } from './commands/note.js';
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
import { runGrepClaims } from './commands/grep-claims.js';
import { runAuditDates } from './commands/audit-dates.js';
import { runI18nStatus } from './commands/i18n-status.js';
import { runI18nSync } from './commands/i18n-sync.js';
import { runPromoteCorrections } from './commands/promote-corrections.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runNarrative } from './commands/narrative.js';
import type { NarrativeMode } from './commands/narrative.js';
import { runTranscribe, runTranscribeDir } from './commands/transcribe.js';
import { runInterview } from './commands/interview.js';
import { runAuthor, runAuthorCohort } from './commands/author.js';
import { runRevert, type RevertMode } from './commands/revert.js';
import { runHistory } from './commands/history.js';
import { parseSelector, resolveCohort } from './commands/author/cohort.js';
import { selectHarness, HarnessUnsupportedError } from './harness/index.js';
import { whisperTranscriber } from './transcriber.js';
import { probeServers, commonServerCandidates } from './probe.js';
import { loadRepoState } from '@core/checks/load.ts';
import { loadPageCorrectionsWithSource } from '@core/corrections/load.ts';
import { detectFormatDrift } from '@core/checks/format-drift.ts';
import { detectDataDrift } from '@core/checks/data-drift.ts';
import { detectSchemaDrift } from '@core/checks/schema-drift.ts';
import { detectCoverageDrift } from '@core/checks/coverage-drift.ts';
import { detectPlacesDrift } from '@core/checks/places-drift.ts';
import { detectConsistencyDrift } from '@core/checks/consistency-drift.ts';
import { detectCitationDrift } from '@core/checks/citation-drift.ts';
import { detectNameTranDrift } from '@core/checks/name-tran-drift.ts';
import { detectStaleCanonicalSha } from '@core/checks/stale-canonical-sha.ts';
import { detectInfoboxNameDrift } from '@core/checks/infobox-name-drift.ts';
import { detectPipelineFrontmatterDrift } from '@core/checks/pipeline-frontmatter-drift.ts';
import { detectTalkThreadShape } from '@core/checks/talk-thread-shape.ts';
import { detectTalkPageFormat } from '@core/checks/talk-page-format.ts';
import type { Detector, FindingCategory, Severity } from '@core/checks/types.ts';
import { runDetectors } from './commands/check/run-detectors.js';
import { checkBundleFreshness } from './bundle-freshness.js';

function shellEscape(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }

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
  note <slug> --kind <k> ...  Tag the note as kind=<k>; one of: human, agent,
                                interview, research, transcript
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
  check                        Run drift detectors against $WHOAMI_ROOT
        [--fix]                  Apply safe auto-fixes (format, schema)
        [--only A,B]             Only run detectors for categories
        [--fail-on A,B]          Exit 1 only on findings in these categories
        [--min-severity S]       Severity floor for exit code: info|warn|error.
                                   Findings below S still print but don't fail.
                                   Default: no floor (any finding blocks per --fail-on).
        [--json]                 Machine-readable output
                                 Categories: format, data, schema, coverage, consistency, citation
                                 Default set: format, data, schema, coverage (NOT consistency, NOT citation)
  audit dates                 List every ambiguous slash date (m/d/y vs d/m/y
                              when both fields ≤ 12) across the GEDCOM, derived
                              records, and page prose. Exits 1 when any are
                              found, so it can run in pre-commit / CI.
        [--json]                Machine-readable output
  i18n status                 List every (slug × target-locale) pair with its
                              computed translation status (current / stale /
                              review / missing) and unresolved talk-entry count.
                              Tab-separated output for grep / sort.
  i18n sync <slug> <locale>   Translate pages/en/<slug>.md into <locale>,
                              writing pages/<locale>/<slug>.md and the sibling
                              <slug>.translation.talk.md. When the EN canonical
                              has an editorial talk page (pages/en/<slug>.talk.md),
                              also writes the localized talk page at
                              pages/<locale>/<slug>.talk.md. Default invokes
                              the editor agent via the harness adapter (one
                              call for the article, a second for the talk).
        [--stub]                Use the offline echo translator (skips the
                              harness; for tests / dry runs).
        [--no-talk]             Skip talk-page translation even when EN talk
                              exists. Article translation still runs.
        [--talk-only]           Skip article translation; translate ONLY the
                              talk page. Requires an existing article
                              translation at pages/<locale>/<slug>.md (the
                              talk translator reads it for term-consistency
                              context). Useful for bulk-backfill of talk
                              pages against current article translations.
  grep-claims <phrase>        Find every occurrence of a phrase across pages,
                              talk pages, and source transcripts. Use as the
                              first step of any factual correction so you can
                              fix every place the wrong claim lives in one pass.
        [--variants A,B,C]      Comma-separated additional phrases to search
                                  (e.g., Ukrainian/Russian forms of the same claim)
        [--no-talk]              Skip *.talk.md files
        [--no-sources]           Skip assets/sources/**/transcript.md
        [--case-sensitive]       Default is case-insensitive
        [--json]                 Machine-readable output
  promote-corrections         Promote a frontmatter correction to the GEDCOM.
        --record I...           Record id whose corrections to promote
        [--apply]               Write changes (default: dry-run)
  init                        Install pre-commit hook + CI workflow into the
                              data repo at $WHOAMI_ROOT.
        [--force]               Overwrite existing files
        [--hook-only]           Just the pre-commit hook
        [--ci-only]             Just the CI workflow
  narrative <slug>             Edit or create pages/<slug>.narrative.md
                                 --file F to ingest an existing file
                                 --print to write current contents to stdout
  transcribe <slug> <audio>    Transcribe via OpenAI Whisper, append as
                                 research note on <slug>.talk
                                 --lang en|ru|he|auto (default: auto)
                                 --speaker NAME, --date YYYY-MM-DD
  transcribe <slug> --dir D    Batch-transcribe every audio file in D
  interview <slug>             Generate Q&A questions via the harness;
                                 captures answers as kind=interview notes
                                 --questions N (default: 8)
  author <slug>                Generate the article for <slug>
                                 --no-web (skip web research)
                                 --skip-episodes (only the person hub)
                                 --resume (continue from last commit)
                                 --dry-run (print plan; no commits)
                                 --branch <name> (commit on a new branch)
  author --cohort missing      Run author for every derived record without a page
  author --cohort file:F.txt   Run author for slugs listed in F (one per line)
                                 --parallel N (v1: ignored, always sequential)
                                 --order chronological|alphabetical|file
                                 --resume-run <run-id>
                                 --yes (skip the >25 confirmation prompt)
  revert <slug>                Undo most recent pipeline run for slug
  revert <slug> --run <uuid>   Undo a specific run
  revert <slug> --phase <p>    Undo just phase p (research|outline|draft|verify|log)
  revert --last                Undo most recent pipeline activity, any slug
  revert <slug> --list         Show runs for slug with summaries
  revert <slug> --dry-run      Show what would be reverted; no commits
  history <slug>               Show pipeline-relevant commits for a page
                                 --json (machine-readable output)
                                 --no-pipeline (exclude pipeline commits)
                                 --pipeline-only (default)
  history --recent [N]         Last N pipeline commits across all slugs (default 50)

Search:
  rebuild-search              Rebuild the search index from disk
                                (use after editing pages outside the API)
  rebuild-search --check      Exit non-zero if the index is stale (no rebuild)

Migrations:
  migrate [--dry-run] [--page <slug>] [--force]
                              Apply pending schema migrations to all pages.
                              Use after pulling a code update that bumps
                              CURRENT_SCHEMA_VERSION.

Diagnostics:
  doctor                      Diagnose dev-env: server reachability, workspace,
                                versions. Exit 1 on problems.
        [--fix]                 Auto-correct safe issues (e.g. update server URL
                                to a discovered alive port)

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

  // Stale-bundle nag. Only runs in the bundled-CLI case (process.argv[1]
  // ending in `.cjs`); when developing via tsx the source IS the bundle,
  // so the check has nothing meaningful to say. Failures (missing dir,
  // permission denied) are swallowed inside the check; if anything goes
  // sideways, the user runs an old wai for one invocation — not the end
  // of the world. Better that than crashing wai's startup over a stat
  // call.
  const bundlePath = process.argv[1] ?? '';
  if (bundlePath.endsWith('.cjs')) {
    const srcRoot = join(dirname(bundlePath), '..', 'src');
    const freshness = checkBundleFreshness(bundlePath, srcRoot, {
      stat: (p) => { try { return statSync(p); } catch { return null; } },
      readdir: (p) => { try { return readdirSync(p); } catch { return null; } },
    });
    if (freshness.stale && freshness.message) {
      process.stderr.write(`${freshness.message}\n`);
    }
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

        // Parse --kind flag if provided, otherwise use --as-agent or default to 'human'
        let kind: NoteKind;
        if (typeof args.flags.kind === 'string') {
          const validKinds: NoteKind[] = ['human', 'agent', 'interview', 'research', 'transcript'];
          if (!validKinds.includes(args.flags.kind as NoteKind)) {
            process.stderr.write(`note: invalid --kind value: ${args.flags.kind}\n`);
            process.exit(2);
          }
          kind = args.flags.kind as NoteKind;
        } else if (args.flags['as-agent'] || process.env.WHOAMI_NOTE_KIND === 'agent') {
          kind = 'agent';
        } else {
          kind = 'human';
        }

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
        const parseSeverity = (v: unknown): Severity | null => {
          if (typeof v !== 'string') return null;
          if (v !== 'info' && v !== 'warn' && v !== 'error') {
            process.stderr.write(`check: --min-severity must be info, warn, or error (got "${v}")\n`);
            return null;
          }
          return v as Severity;
        };
        const onlyList = parseList(args.flags.only);
        const includeConsistency = onlyList?.includes('consistency') ?? false;
        const includeCitation = onlyList?.includes('citation') ?? false;
        const minSeverity = parseSeverity(args.flags['min-severity']);
        if (args.flags['min-severity'] !== undefined && minSeverity === null) {
          return 2;
        }
        const code = await runCheck({
          rootDir: root,
          json: !!args.flags.json,
          fix: !!args.flags.fix,
          only: onlyList,
          failOn: parseList(args.flags['fail-on']),
          minSeverity,
          loadState: loadRepoState,
          detectors: [
            detectFormatDrift,
            detectDataDrift,
            detectSchemaDrift,
            detectCoverageDrift,
            detectPlacesDrift,
            detectNameTranDrift,
            detectStaleCanonicalSha,
            detectPipelineFrontmatterDrift,
            detectTalkThreadShape,
            detectTalkPageFormat,
            ...(includeConsistency ? [detectConsistencyDrift, detectInfoboxNameDrift] : []),
            ...(includeCitation ? [detectCitationDrift] : []),
          ],
          write,
          writeErr: (s) => process.stderr.write(s),
          writeFile: (file, content) => writeFileSync(file, content),
        });
        return code;
      }
      case 'audit': {
        const sub = args.positional[0];
        if (sub !== 'dates') {
          process.stderr.write(`audit: unknown subcommand '${sub ?? ''}'. Known: dates.\n`);
          return 2;
        }
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const code = runAuditDates({
          rootDir: root,
          json: !!args.flags.json,
          write,
        });
        return code;
      }
      case 'i18n': {
        const sub = args.positional[0];
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        if (sub === 'status') {
          await runI18nStatus({ rootDir: root, write });
          return 0;
        }
        if (sub === 'sync') {
          const slug = args.positional[1];
          const locale = args.positional[2];
          if (!slug || !locale) {
            process.stderr.write('Usage: wai i18n sync <slug> <locale> [--stub] [--no-talk] [--talk-only]\n');
            return 2;
          }
          // Default: the real agent translator invokes the harness
          // (`writing-articles` / `translate` template). `--stub` flips
          // back to the offline echo translator for tests, dry runs,
          // and CI where no harness is available.
          const useStub = !!args.flags.stub;
          const translator = useStub
            ? (await import('./commands/i18n-sync-stub.js')).stubTranslator
            : (await import('./commands/agent-translator.js')).agentTranslator;
          // Talk-page translation: stub path echoes; agent path invokes
          // the `translate-talk` template in `writing-articles` via the
          // harness adapter.
          const talkTranslator = useStub
            ? (await import('./commands/i18n-sync-stub.js')).stubTalkTranslator
            : (await import('./commands/agent-translator.js')).agentTalkTranslator;
          await runI18nSync({
            rootDir: root,
            slug,
            locale,
            translator,
            talkTranslator,
            includeTalk: !args.flags['no-talk'],
            talkOnly: !!args.flags['talk-only'],
            write,
          });
          return 0;
        }
        process.stderr.write(`i18n: unknown subcommand '${sub ?? ''}'. Known: status, sync.\n`);
        return 2;
      }
      case 'grep-claims': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const phrase = args.positional[0];
        if (!phrase) {
          process.stderr.write('grep-claims: phrase required (e.g., wai grep-claims "Defense of Kyiv" --variants "За оборону Києва,defended Kyiv")\n');
          return 2;
        }
        const variantArg = args.flags.variants;
        const variants = typeof variantArg === 'string'
          ? variantArg.split(',').map(s => s.trim()).filter(s => s.length > 0)
          : [];
        const code = runGrepClaims({
          rootDir: root,
          phrases: [phrase, ...variants],
          includeSources: args.flags['no-sources'] !== true,
          includeTalk: args.flags['no-talk'] !== true,
          caseInsensitive: args.flags['case-sensitive'] !== true,
          json: !!args.flags.json,
          write,
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
          pagesDir: resolve(root, 'pages', 'en'),
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
      case 'narrative': {
        const slug = args.positional[0];
        if (!slug) {
          process.stderr.write('narrative: slug required\n');
          return 2;
        }
        // Reject --file without a path argument
        if (args.flags.file !== undefined && typeof args.flags.file !== 'string') {
          process.stderr.write('narrative: --file requires a path\n');
          return 2;
        }
        const printFlag = !!args.flags.print;
        const fileFlag = typeof args.flags.file === 'string' ? args.flags.file : undefined;
        const mode: NarrativeMode = printFlag ? 'print' : (fileFlag !== undefined ? 'ingest' : 'edit');
        const rootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const code = await runNarrative({
          rootDir,
          slug,
          mode,
          ingestPath: fileFlag,
          readFile: (p) => existsSync(p) ? readFileSync(p, 'utf8') : null,
          writeFile: (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
          exists: existsSync,
          editInEditor: async (initial) => editInEditor(initial),
          gitAdd: (paths) => { execSync(`git -C ${shellEscape(rootDir)} add ${paths.map(shellEscape).join(' ')}`); },
          gitCommit: (msg) => { execSync(`git -C ${shellEscape(rootDir)} commit -m ${shellEscape(msg)}`); },
          gitHasUncommittedChanges: () => execSync(`git -C ${shellEscape(rootDir)} status --porcelain`).toString().trim().length > 0,
          now: () => new Date().toISOString().slice(0, 10),
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
      case 'transcribe': {
        const slug = args.positional[0];
        if (!slug) {
          process.stderr.write('transcribe: usage — wai transcribe <slug> <audio> | wai transcribe <slug> --dir <path>\n');
          return 2;
        }
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          process.stderr.write('transcribe: OPENAI_API_KEY is not set\n');
          return 4;
        }
        const validLangs = ['en', 'ru', 'he', 'auto'] as const;
        type ValidLang = typeof validLangs[number];
        const langArg = args.flags.lang ?? 'auto';
        if (typeof langArg !== 'string' || !(validLangs as readonly string[]).includes(langArg)) {
          process.stderr.write(`transcribe: --lang must be one of en|ru|he|auto\n`);
          return 2;
        }
        const speakerArg = typeof args.flags.speaker === 'string' ? args.flags.speaker : undefined;
        const dateArg = typeof args.flags.date === 'string' ? args.flags.date : undefined;
        const rootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');

        const dirPath = typeof args.flags.dir === 'string' ? args.flags.dir : undefined;
        const audioPath = args.positional[1];

        if (dirPath && audioPath) {
          process.stderr.write('transcribe: pass either an audio path OR --dir, not both\n');
          return 2;
        }
        if (!dirPath && !audioPath) {
          process.stderr.write('transcribe: usage — wai transcribe <slug> <audio> | wai transcribe <slug> --dir <path>\n');
          return 2;
        }

        const perFileDeps = {
          rootDir,
          slug,
          lang: langArg as ValidLang,
          speaker: speakerArg,
          date: dateArg,
          readFileBinary: (p: string) => existsSync(p) ? readFileSync(p) : null,
          writeFileBinary: (p: string, b: Uint8Array) => { writeFileSync(p, b); },
          mkdirP: (p: string) => mkdirSync(p, { recursive: true }),
          gitAdd: (paths: string[]) => { execSync(`git -C ${shellEscape(rootDir)} add ${paths.map(shellEscape).join(' ')}`); },
          gitCommit: (msg: string) => { execSync(`git -C ${shellEscape(rootDir)} commit -m ${shellEscape(msg)}`); },
          gitHasUncommittedChanges: () => execSync(`git -C ${shellEscape(rootDir)} status --porcelain`).toString().trim().length > 0,
          appendNote: async (s: string, text: string, o: { kind: 'transcript' }) => {
            const c = new ApiClient(getServer());
            await c.note(s, text, { kind: o.kind });
          },
          transcriber: whisperTranscriber({ apiKey }),
          now: () => new Date().toISOString().slice(0, 10),
          write: (s: string) => process.stdout.write(s),
          writeErr: (s: string) => process.stderr.write(s),
        };

        if (dirPath) {
          const code = await runTranscribeDir({
            rootDir,
            slug,
            dirPath,
            lang: langArg as ValidLang,
            listAudio: (d: string) => readdirSync(d).filter(f => /\.(m4a|mp3|wav|aac|flac)$/i.test(f)).map(f => join(d, f)),
            runOne: async (ap: string) => runTranscribe({ ...perFileDeps, audioPath: ap, write: () => {}, writeErr: () => {} }),
            writeFile: (p: string, c: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
            write: (s: string) => process.stdout.write(s),
            writeErr: (s: string) => process.stderr.write(s),
          });
          return code;
        }

        const code = await runTranscribe({ ...perFileDeps, audioPath: audioPath! });
        return code;
      }
      case 'interview': {
        const slug = args.positional[0];
        if (!slug) {
          process.stderr.write('interview: slug required\n');
          return 2;
        }
        const maxQuestions = typeof args.flags.questions === 'string'
          ? parseInt(args.flags.questions, 10) || 8
          : 8;
        let harness;
        try {
          harness = selectHarness(process.env.WHOAMI_HARNESS as 'claude-code' | 'codex' | 'opencode' | undefined);
        } catch (e) {
          if (e instanceof HarnessUnsupportedError) {
            process.stderr.write(`interview: ${e.message}\n`);
            return 11;
          }
          throw e;
        }
        const interviewClient = new ApiClient(getServer());
        const rootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const interviewCode = await runInterview({
          slug,
          maxQuestions,
          harness,
          loadEvidence: async (s) => {
            const talkPage = await interviewClient.read(`${s}.talk`).catch(() => null);
            const talk = (talkPage as { body?: string } | null)?.body ?? '';

            const narrPath = join(rootDir, 'pages', `${s}.narrative.md`);
            const narrative = existsSync(narrPath) ? readFileSync(narrPath, 'utf8') : null;

            let derived: string | null = null;
            const pagePath = join(rootDir, 'pages', `${s}.md`);
            if (existsSync(pagePath)) {
              const pageText = readFileSync(pagePath, 'utf8');
              const m = pageText.match(/gedcom:\s*\n[\s\S]*?record:\s*(\S+)/);
              if (m) {
                const yml = join(rootDir, 'genealogy', 'derived', `${m[1]}.yml`);
                if (existsSync(yml)) derived = readFileSync(yml, 'utf8');
              }
            }
            return { derived, talk, narrative };
          },
          editInEditor: async (initial) => editInEditor(initial),
          appendNote: async (s, text, o) => {
            await interviewClient.note(s, text, { kind: o.kind });
          },
          write: (s) => process.stdout.write(s),
          writeErr: (s) => process.stderr.write(s),
        });
        return interviewCode;
      }
      case 'author': {
        const authorRootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');

        let authorHarness;
        try {
          authorHarness = selectHarness(process.env.WHOAMI_HARNESS as 'claude-code' | 'codex' | 'opencode' | undefined);
        } catch (e) {
          if (e instanceof HarnessUnsupportedError) {
            process.stderr.write(`author: ${e.message}\n`);
            return 11;
          }
          throw e;
        }

        const authorClient = new ApiClient(getServer());

        // Shared runAuthor wiring for both single-slug and cohort paths.
        const makeRunAuthorOpts = (slug: string, resume: boolean) => ({
          rootDir: authorRootDir,
          slug,
          resume,
          noWeb: !!args.flags['no-web'],
          skipEpisodes: !!args.flags['skip-episodes'],
          dryRun: !!args.flags['dry-run'],
          branch: typeof args.flags.branch === 'string' ? args.flags.branch : undefined,
          harness: authorHarness,
          client: authorClient,
          readFile: (p: string) => existsSync(p) ? readFileSync(p, 'utf8') : null,
          writeFile: (p: string, c: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
          exists: existsSync,
          gitLog: (root: string, grep: string) => execSync(`git -C ${shellEscape(root)} log --all --format='%B%n' --grep ${shellEscape(grep)}`).toString(),
          gitAdd: (paths: string[]) => { execSync(`git -C ${shellEscape(authorRootDir)} add ${paths.map(shellEscape).join(' ')}`); },
          gitCommit: (subject: string, body: string) => { execSync(`git -C ${shellEscape(authorRootDir)} commit --allow-empty -m ${shellEscape(subject)} -m ${shellEscape(body)}`); },
          gitHasUncommittedChanges: () => execSync(`git -C ${shellEscape(authorRootDir)} status --porcelain`).toString().trim().length > 0,
          gitIsRepo: () => existsSync(join(authorRootDir, '.git')),
          findDerivedBySlug: (slug: string) => {
            const derivedDir = join(authorRootDir, 'genealogy', 'derived');
            if (!existsSync(derivedDir)) return null;
            for (const file of readdirSync(derivedDir)) {
              if (!file.endsWith('.yml')) continue;
              const filePath = join(derivedDir, file);
              const text = readFileSync(filePath, 'utf8');
              const nameMatch = text.match(/^name:\s*(.+)$/m);
              if (!nameMatch) continue;
              const name = nameMatch[1]!.trim();
              if (toSlug(name) === slug) {
                return { record: file.slice(0, -'.yml'.length), raw: text };
              }
            }
            return null;
          },
          healthz: async () => { try { await authorClient.healthz(); return true; } catch { return false; } },
          now: () => new Date().toISOString().slice(0, 10),
          write: (s: string) => process.stdout.write(s),
          writeErr: (s: string) => process.stderr.write(s),
          runCheck: async (checkArgs: { only: string[]; fix?: boolean; slugFilter?: string }) => {
            const detectorMap: Record<string, Detector> = {
              format: detectFormatDrift,
              data: detectDataDrift,
              schema: detectSchemaDrift,
              coverage: detectCoverageDrift,
              consistency: detectConsistencyDrift,
              citation: detectCitationDrift,
            };
            const requested = checkArgs.only as FindingCategory[];
            const selected = requested.map(c => detectorMap[c]).filter((d): d is Detector => d !== undefined);
            const checkState = await loadRepoState(authorRootDir);
            const result = await runDetectors({
              state: checkState,
              detectors: selected,
              only: requested,
              fix: !!checkArgs.fix,
              writeFile: (file, content) => writeFileSync(file, content),
              writeErr: (s) => process.stderr.write(s),
              reload: () => loadRepoState(authorRootDir),
            });
            // Filter to findings about this run's slug — pre-existing findings
            // on unrelated pages must not block authoring of a new page. The
            // page-level wai check is the place to surface repo-wide drift;
            // verify here is a guardrail for *this run's* output.
            let findings = result.findings;
            if (checkArgs.slugFilter) {
              const pageFile = join(authorRootDir, 'pages', `${checkArgs.slugFilter}.md`);
              const talkFile = join(authorRootDir, 'pages', `${checkArgs.slugFilter}.talk.md`);
              findings = findings.filter(f => f.location?.file === pageFile || f.location?.file === talkFile);
            }
            return {
              exitCode: findings.length > 0 && !checkArgs.fix ? 1 : 0,
              findingCount: findings.length,
              fixedCount: result.fixedCount,
            };
          },
        });

        const cohortRaw = typeof args.flags.cohort === 'string' ? args.flags.cohort : undefined;
        if (cohortRaw) {
          const selector = parseSelector(cohortRaw);
          const slugs = await resolveCohort(selector, {
            rootDir: authorRootDir,
            listExistingPages: (root) => {
              const pagesDir = join(root, 'pages', 'en');
              if (!existsSync(pagesDir)) return [];
              return readdirSync(pagesDir)
                .filter(f => f.endsWith('.md') && !f.endsWith('.talk.md') && !f.endsWith('.narrative.md'))
                .map(f => f.slice(0, -'.md'.length));
            },
            listDerivedSlugs: async (root) => {
              const derivedDir = join(root, 'genealogy', 'derived');
              if (!existsSync(derivedDir)) return [];
              const results: string[] = [];
              for (const file of readdirSync(derivedDir)) {
                if (!file.endsWith('.yml')) continue;
                const filePath = join(derivedDir, file);
                const text = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
                if (!text) continue;
                const nameMatch = text.match(/^name:\s*(.+)$/m);
                if (!nameMatch) continue;
                const name = nameMatch[1]!.trim();
                if (!name) continue;
                results.push(toSlug(name));
              }
              return results;
            },
            readFile: (p) => existsSync(p) ? readFileSync(p, 'utf8') : null,
          });

          if (slugs.length === 0) {
            process.stdout.write('cohort: zero slugs resolved; nothing to do\n');
            process.exit(0);
          }

          const yes = args.flags.yes === true || process.env.WHOAMI_AUTO === '1';
          if (slugs.length > 100 && !yes) {
            process.stderr.write(`cohort: ${slugs.length} slugs requires --yes\n`);
            process.exit(2);
          }
          if (slugs.length > 25 && !yes) {
            process.stderr.write(`cohort: ${slugs.length} slugs resolved; pass --yes to proceed\n`);
            process.exit(2);
          }

          const parallel = typeof args.flags.parallel === 'string' ? parseInt(args.flags.parallel, 10) : 1;
          const orderArg = typeof args.flags.order === 'string' ? args.flags.order : 'chronological';
          const order = (orderArg === 'alphabetical' || orderArg === 'file' || orderArg === 'chronological') ? orderArg : 'chronological';
          const resumeRunId = typeof args.flags['resume-run'] === 'string' ? args.flags['resume-run'] : undefined;

          const cohortCode = await runAuthorCohort({
            slugs,
            parallel,
            order,
            resumeRunId,
            runOne: async (slug, runOpts) => runAuthor(makeRunAuthorOpts(slug, runOpts.resume)),
            journal: {
              rootDir: authorRootDir,
              appendFile: (p, c) => { mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, c); },
              mkdirP: (p) => mkdirSync(p, { recursive: true }),
            },
            readFile: (p) => existsSync(p) ? readFileSync(p, 'utf8') : null,
            writeFailedFile: (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
            rootDir: authorRootDir,
            write: (s) => process.stdout.write(s),
            writeErr: (s) => process.stderr.write(s),
            now: () => new Date().toISOString(),
          });
          return cohortCode;
        }

        // Single-slug path (unchanged).
        const slug = args.positional[0];
        if (!slug) {
          process.stderr.write('author: slug required\n');
          return 2;
        }
        const resume = !!args.flags.resume;

        const authorCode = await runAuthor(makeRunAuthorOpts(slug, resume));
        return authorCode;
      }
      case 'revert': {
        const revertRootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');

        const runFlag = typeof args.flags.run === 'string' ? args.flags.run : undefined;
        const phaseFlag = typeof args.flags.phase === 'string' ? args.flags.phase : undefined;
        const lastFlag = !!args.flags.last;
        const listFlag = !!args.flags.list;
        const dryRunFlag = !!args.flags['dry-run'];

        // Validate mutually exclusive flags
        const modeFlagCount = [runFlag, phaseFlag, lastFlag, listFlag].filter(Boolean).length;
        if (modeFlagCount > 1) {
          process.stderr.write('revert: --run, --phase, --last, and --list are mutually exclusive\n');
          return 2;
        }

        let revertMode: RevertMode;
        if (lastFlag) {
          revertMode = { kind: 'last' };
        } else {
          const revertSlug = args.positional[0];
          if (!revertSlug) {
            process.stderr.write('revert: slug required (or use --last)\n');
            return 2;
          }
          if (listFlag) {
            revertMode = { kind: 'list', slug: revertSlug };
          } else if (runFlag) {
            revertMode = { kind: 'slug-run', slug: revertSlug, runId: runFlag };
          } else if (phaseFlag) {
            revertMode = { kind: 'slug-phase', slug: revertSlug, phase: phaseFlag };
          } else {
            revertMode = { kind: 'slug-latest', slug: revertSlug };
          }
        }

        const revertCode = await runRevert(revertMode, {
          rootDir: revertRootDir,
          gitLog: (root, gitArgs) => execSync(
            `git -C ${shellEscape(root)} log ${gitArgs.map(shellEscape).join(' ')}`,
          ).toString(),
          gitRevert: (root, shas, message) => {
            execSync(
              `git -C ${shellEscape(root)} revert --no-commit ${shas.map(shellEscape).join(' ')} && git -C ${shellEscape(root)} commit -m ${shellEscape(message)}`,
            );
          },
          dryRun: dryRunFlag,
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return revertCode;
      }
      case 'history': {
        const historyRootDir = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');

        const slug = args.positional[0];
        const recent = args.flags.recent === true || typeof args.flags.recent === 'string';
        const format = args.flags.json === true ? 'json' : 'table';
        const filter = args.flags['no-pipeline'] === true ? 'no-pipeline' : 'pipeline-only';
        const recentLimit = recent
          ? (typeof args.flags.recent === 'string' ? parseInt(args.flags.recent, 10) : 50)
          : undefined;

        const historyCode = await runHistory({
          rootDir: historyRootDir,
          slug,
          format,
          filter,
          recent: recentLimit,
          gitLog: (root, gitArgs) => execSync(
            `git -C ${shellEscape(root)} log ${gitArgs.map(shellEscape).join(' ')}`,
          ).toString(),
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return historyCode;
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
      case 'doctor': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const configuredUrl = getServer();
        const code = await runDoctor({
          configuredUrl,
          candidates: commonServerCandidates(configuredUrl),
          probeServers,
          fetchVersion: async (url) => {
            const res = await fetch(`${url}/api/version`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<{ apiVersion: string; version: string; startedAt: string }>;
          },
          cliVersion: VERSION,
          workspaceRoot: root,
          fs: { exists: (p) => existsSync(p) },
          fix: !!args.flags.fix,
          setServer,
          write,
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
