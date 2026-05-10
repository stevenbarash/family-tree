# Article-authoring pipeline — Plan 1 of 3: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the evidence-drawer subsystem of the article-authoring pipeline — the input commands and infrastructure the orchestrator (Plan 2) will compose. After Plan 1, the user can fill the per-slug evidence drawer (research notes, narrative file, audio transcripts, Q&A interviews), with each input committed to the data repo.

**Architecture:** Three new standalone commands (`wai narrative`, `wai transcribe`, `wai interview`) and an HTTP-client extension (`wai note --kind`) write to `$WHOAMI_ROOT` directly or via the existing API. A new `cli/src/harness/` module defines the harness-adapter contract and ships the Claude Code adapter; `wai interview` is the first user. A new `plugins/whoami/skills/writing-articles/` bundle ships the SKILL.md and the `interview` prompt template. `wai author` is **not** in this plan.

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`. CLI bundles via esbuild. No new runtime dependencies; Whisper API is called via `fetch`.

**Spec reference:** `docs/superpowers/specs/2026-05-10-article-authoring-pipeline-design.md` (rev 1 at commit `6d9a15b`).

---

## Scope

**In scope:**
- `cli/src/commands/note.ts` — extend `kind` enum to add `interview` / `research` / `transcript` / `audio` and forward to API.
- `cli/src/commands/narrative.ts` — new standalone command writing `pages/<slug>.narrative.md` in `$WHOAMI_ROOT` and committing.
- `cli/src/commands/transcribe.ts` — new standalone command: copy audio, call Whisper, append research note, commit.
- `cli/src/harness/types.ts`, `cli/src/harness/claude-code.ts` — harness-adapter contract and Claude Code implementation.
- `cli/src/commands/interview.ts` — new HTTP-client command that drives the harness for question generation, opens `$EDITOR`, parses Q&A, posts each answered pair as a `wai note --kind=interview`.
- `cli/src/index.ts` — wire all four new commands; update help text.
- `plugins/whoami/skills/writing-articles/SKILL.md` — minimum-viable skill.
- `plugins/whoami/skills/writing-articles/prompt-templates/interview.md` — template (the only one needed in Plan 1).
- `CHANGELOG.md` and `docs/superpowers/plans/README.md` — entries.

**Out of scope (Plan 2):**
- `wai author` orchestrator and its phases (research / outline / draft / verify / log).
- `wai check --include consistency` and the consistency category in core.
- The four other prompt templates (`research-questions`, `outline`, `draft-person`, `draft-episode`).
- Renderer and search filters for `*.narrative.md` (added in Plan 2 once narrative.md is consumed).

**Out of scope (Plan 3):**
- `wai author --cohort`, `wai revert`, `wai history`.

## File structure

```
cli/src/commands/note.ts                       MODIFY. Extend kind enum.
cli/src/commands/narrative.ts                  NEW. Standalone command.
cli/src/commands/transcribe.ts                 NEW. Standalone command.
cli/src/commands/interview.ts                  NEW. HTTP + harness-driver command.
cli/src/harness/types.ts                       NEW. Adapter contract types.
cli/src/harness/claude-code.ts                 NEW. Claude Code adapter implementation.
cli/src/harness/index.ts                       NEW. Adapter selection by WHOAMI_HARNESS env.
cli/src/api-client.ts                          MODIFY. Allow new `kind` values on note().
cli/src/index.ts                               MODIFY. Wire new subcommands.
cli/test/note.test.ts                          MODIFY. Cover new kinds.
cli/test/narrative.test.ts                     NEW.
cli/test/transcribe.test.ts                    NEW.
cli/test/harness/claude-code.test.ts           NEW.
cli/test/interview.test.ts                     NEW.
plugins/whoami/skills/writing-articles/SKILL.md
                                               NEW. Plan 1 minimum.
plugins/whoami/skills/writing-articles/prompt-templates/interview.md
                                               NEW. Used in Plan 1.
CHANGELOG.md                                   MODIFY. Unreleased entries.
docs/superpowers/plans/README.md               MODIFY. Add plan rows.
```

## Conventions adhered to

- All new CLI commands export a `run<Name>` function with injected I/O for testability.
- Standalone commands (`narrative`, `transcribe`) take a `rootDir` argument (`$WHOAMI_ROOT`); HTTP-client commands (`interview`) take an `ApiClient`.
- Whisper and harness calls are interfaces with concrete implementations + test fakes.
- Tests use `node:test` and `node:assert/strict`. No live network.
- Stdout is parseable; progress chatter goes to stderr.
- Exit codes: `0` success, non-zero per spec table for each command.
- Commits in tests use a `gitCommit` injected function; never run real git in tests.

---

## Task 1: Extend `wai note --kind` to accept new agent-note kinds

The spec adds three new sub-types of agent-authored notes: `interview`, `research`, `transcript`. The existing `kind` enum in `cli/src/commands/note.ts` is `'human' | 'agent'`. We expand it.

**Files:**
- Modify: `cli/src/commands/note.ts`
- Modify: `cli/src/api-client.ts`
- Modify: `cli/test/note.test.ts`

- [ ] **Step 1: Write failing tests for new kinds**

In `cli/test/note.test.ts`, add tests for each new kind. Append after existing tests:

```typescript
test('note: append accepts kind=interview', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 'q&a body', kind: 'interview', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note.length, 1);
  assert.equal(c.calls.note[0]!.kind, 'interview');
});

test('note: append accepts kind=research', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 'src', kind: 'research', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note[0]!.kind, 'research');
});

test('note: append accepts kind=transcript', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 't', kind: 'transcript', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note[0]!.kind, 'transcript');
});
```

Update the `Calls` and `FakeClient` interfaces at the top of `cli/test/note.test.ts` so `kind` accepts the new values:

```typescript
type NoteKind = 'human' | 'agent' | 'interview' | 'research' | 'transcript';

interface Calls {
  note: { slug: string; note: string; by?: string; kind?: NoteKind }[];
  // …rest unchanged
}
```

- [ ] **Step 2: Run tests and confirm they fail**

```
cd cli && npx tsx --test test/note.test.ts
```

Expected: TypeScript errors on `kind: 'interview'` etc. (the existing `NoteKind` union doesn't include them).

- [ ] **Step 3: Extend the kind union in `note.ts`**

In `cli/src/commands/note.ts`, change the `kind` field on `NoteOptions`:

```typescript
export type NoteKind = 'human' | 'agent' | 'interview' | 'research' | 'transcript';

export interface NoteOptions {
  slug: string;
  mode: Mode;
  note?: string;
  id?: string;
  by?: string;
  kind?: NoteKind;
  json?: boolean;
  client: Pick<ApiClient, 'note' | 'editNote' | 'deleteNote' | 'restoreNote' | 'listNotes'>;
  write: (s: string) => void;
}
```

Then update the `appendOpts` block inside `case 'append'`:

```typescript
const appendOpts: { by?: string; kind?: NoteKind } = {};
if (opts.by !== undefined) appendOpts.by = opts.by;
if (opts.kind !== undefined) appendOpts.kind = opts.kind;
```

- [ ] **Step 4: Extend the `ApiClient.note` signature in `api-client.ts`**

Find the `note()` method on `ApiClient` and the `NoteSummary` type. Update the `kind` parameter type to the new union (export it from this file too):

```typescript
export type NoteKind = 'human' | 'agent' | 'interview' | 'research' | 'transcript';

// in ApiClient.note(...):
async note(slug: string, body: string, opts?: { by?: string; kind?: NoteKind }): Promise<{ slug: string; date: string; id: string }> { /* existing impl */ }
```

If a `NoteSummary.kind` field exists, update it the same way.

- [ ] **Step 5: Run tests, all pass**

```
cd cli && npx tsx --test test/note.test.ts
```

Expected: all tests pass, including the three new ones.

- [ ] **Step 6: Update CLI flag parsing in `index.ts`**

Find the `note` subcommand in `cli/src/index.ts` (the section that reads `--as-agent` and constructs `NoteOptions`). Add a `--kind` flag:

```typescript
// inside the note subcommand handler, after --as-agent parsing:
const kindIdx = args.indexOf('--kind');
let kind: NoteKind | undefined;
if (kindIdx !== -1) {
  const v = args[kindIdx + 1];
  if (v !== 'human' && v !== 'agent' && v !== 'interview' && v !== 'research' && v !== 'transcript') {
    process.stderr.write(`note: invalid --kind value: ${v}\n`);
    process.exit(2);
  }
  kind = v;
} else if (asAgent) {
  kind = 'agent';
}
```

Update the help text (the `HELP` constant) to add a one-line note about the new flag:

```
  note <slug> --kind <k> ...   Tag the note as kind=<k>; one of: human, agent,
                                 interview, research, transcript
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/note.ts cli/src/api-client.ts cli/src/index.ts cli/test/note.test.ts
git commit -m "feat(cli): extend wai note --kind with interview/research/transcript"
```

---

## Task 2: `wai narrative` — write/edit per-slug narrative file

A standalone command that opens (or creates) `pages/<slug>.narrative.md` in `$WHOAMI_ROOT`, lets the user edit it in `$EDITOR`, and commits the change. Spec reference: § "wai narrative" command contract.

**Files:**
- Create: `cli/src/commands/narrative.ts`
- Create: `cli/test/narrative.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write the failing test for create-from-empty**

Create `cli/test/narrative.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNarrative } from '../src/commands/narrative.js';

interface Files {
  reads: Record<string, string>;
  writes: Record<string, string>;
}

interface GitCalls {
  add: string[];
  commits: string[];
}

function fakeIo() {
  const files: Files = { reads: {}, writes: {} };
  const git: GitCalls = { add: [], commits: [] };
  let editorBuffer = '';
  return {
    files,
    git,
    setEditorBuffer: (b: string) => { editorBuffer = b; },
    deps: {
      readFile: (p: string) => { return files.reads[p] ?? null; },
      writeFile: (p: string, content: string) => { files.writes[p] = content; },
      exists: (p: string) => p in files.reads || p in files.writes,
      editInEditor: async (initial: string) => editorBuffer || initial,
      gitAdd: (paths: string[]) => { git.add.push(...paths); },
      gitCommit: (message: string) => { git.commits.push(message); },
      gitHasUncommittedChanges: () => false,
      now: () => '2026-05-10',
    },
  };
}

test('narrative: creates new file with frontmatter when slug has no narrative.md', async () => {
  const { files, git, setEditorBuffer, deps } = fakeIo();
  setEditorBuffer('---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-10\nupdated: 2026-05-10\n---\n\nFamily memory of Aidele in Teofipol.\n');
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /title: Aidele/);
  assert.deepEqual(git.add, ['/repo/pages/aidele.narrative.md']);
  assert.equal(git.commits.length, 1);
  assert.match(git.commits[0]!, /^narrative\(aidele\): create/);
});

test('narrative: updates existing file', async () => {
  const { files, git, setEditorBuffer, deps } = fakeIo();
  files.reads['/repo/pages/aidele.narrative.md'] = '---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-09\nupdated: 2026-05-09\n---\n\nold body\n';
  setEditorBuffer('---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-09\nupdated: 2026-05-10\n---\n\nnew body\n');
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /new body/);
  assert.match(git.commits[0]!, /^narrative\(aidele\): update/);
});

test('narrative: --print emits to stdout, no commit', async () => {
  const { files, git, deps } = fakeIo();
  files.reads['/repo/pages/aidele.narrative.md'] = '---\ntitle: Aidele\n---\n\nbody text\n';
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'print', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(out, /body text/);
  assert.equal(git.commits.length, 0);
  assert.equal(Object.keys(files.writes).length, 0);
});

test('narrative: --file ingests an existing file and commits', async () => {
  const { files, git, deps } = fakeIo();
  files.reads['/incoming/aidele-memoir.md'] = '---\ntitle: Aidele\n---\n\nimported body\n';
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'ingest', ingestPath: '/incoming/aidele-memoir.md', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /imported body/);
  assert.match(git.commits[0]!, /^narrative\(aidele\): create/);
});

test('narrative: aborts with exit 7 when repo has uncommitted changes', async () => {
  const { deps } = fakeIo();
  let err = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, gitHasUncommittedChanges: () => true, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 7);
  assert.match(err, /uncommitted/);
});
```

- [ ] **Step 2: Run, confirm tests fail**

```
cd cli && npx tsx --test test/narrative.test.ts
```

Expected: module not found.

- [ ] **Step 3: Write the implementation**

Create `cli/src/commands/narrative.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests, all pass**

```
cd cli && npx tsx --test test/narrative.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Wire `narrative` into `cli/src/index.ts`**

Add the import:

```typescript
import { runNarrative } from './commands/narrative.js';
```

Add the subcommand handler, mirroring the pattern other standalone commands use (read `WHOAMI_ROOT` from env or arg, build `deps` from `node:fs` and a small git wrapper):

```typescript
} else if (cmd === 'narrative') {
  const slug = args[1];
  if (!slug) {
    process.stderr.write('narrative: slug required\n');
    process.exit(2);
  }
  const printIdx = args.indexOf('--print');
  const fileIdx = args.indexOf('--file');
  const mode: NarrativeMode = printIdx !== -1 ? 'print' : (fileIdx !== -1 ? 'ingest' : 'edit');
  const ingestPath = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
  const rootDir = process.env.WHOAMI_ROOT ?? join(process.env.HOME!, 'whoami');
  const code = await runNarrative({
    rootDir,
    slug,
    mode,
    ingestPath,
    readFile: (p) => existsSync(p) ? readFileSync(p, 'utf8') : null,
    writeFile: (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
    exists: existsSync,
    editInEditor: async (initial) => editInEditor(initial, '.md'),
    gitAdd: (paths) => execSync(`git -C ${rootDir} add ${paths.map(shellEscape).join(' ')}`),
    gitCommit: (msg) => execSync(`git -C ${rootDir} commit -m ${shellEscape(msg)}`),
    gitHasUncommittedChanges: () => execSync(`git -C ${rootDir} status --porcelain`).toString().trim().length > 0,
    now: () => new Date().toISOString().slice(0, 10),
    write: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
  });
  process.exit(code);
}
```

You may need to add imports: `dirname` from `node:path`, `execSync` from `node:child_process`. If `shellEscape` isn't already a utility, add a tiny one:

```typescript
function shellEscape(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
```

Add the help-text line:

```
  narrative <slug>             Edit or create pages/<slug>.narrative.md
                                 --file F to ingest an existing file
                                 --print to write current contents to stdout
```

- [ ] **Step 6: Type-check + tests**

```
cd cli && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/narrative.ts cli/src/index.ts cli/test/narrative.test.ts
git commit -m "feat(cli): add wai narrative for per-slug family-narrative file"
```

---

## Task 3: Whisper transcriber abstraction

Before `wai transcribe` exists as a command, isolate the Whisper API call as an injectable interface. This lets the command be tested without network and lets us swap implementations later (e.g. `whisper.cpp` per the deferred decision).

**Files:**
- Create: `cli/src/transcriber.ts`
- Create: `cli/test/transcriber.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cli/test/transcriber.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whisperTranscriber } from '../src/transcriber.js';

test('whisperTranscriber: posts audio to OpenAI and parses response', async () => {
  let captured: { url: string; body: FormData; auth: string } | null = null;
  const fakeFetch = async (url: string, init: { body: FormData; headers: Record<string, string> }) => {
    captured = { url, body: init.body, auth: init.headers['Authorization']! };
    return new Response(JSON.stringify({ text: 'transcribed body', language: 'en' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  const out = await t.transcribe({ audio: new Uint8Array([1, 2, 3]).buffer, filename: 'voice.m4a', lang: 'auto' });
  assert.equal(out.text, 'transcribed body');
  assert.equal(out.lang, 'en');
  assert.equal(captured!.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(captured!.auth, 'Bearer sk-test');
});

test('whisperTranscriber: forwards explicit lang hint to OpenAI', async () => {
  let lang = '';
  const fakeFetch = async (_url: string, init: { body: FormData; headers: Record<string, string> }) => {
    lang = init.body.get('language')?.toString() ?? '';
    return new Response(JSON.stringify({ text: 'привет', language: 'ru' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  const out = await t.transcribe({ audio: new ArrayBuffer(0), filename: 'voice.m4a', lang: 'ru' });
  assert.equal(lang, 'ru');
  assert.equal(out.lang, 'ru');
});

test('whisperTranscriber: surfaces non-200 as Error', async () => {
  const fakeFetch = async () => new Response('quota', { status: 429 });
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  await assert.rejects(t.transcribe({ audio: new ArrayBuffer(0), filename: 'v.m4a', lang: 'auto' }), /429/);
});
```

- [ ] **Step 2: Run, fail**

```
cd cli && npx tsx --test test/transcriber.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/transcriber.ts`:

```typescript
export type Lang = 'en' | 'ru' | 'he' | 'auto';

export interface TranscribeRequest {
  audio: ArrayBuffer;
  filename: string;
  lang: Lang;
}

export interface TranscribeResult {
  text: string;
  lang: string; // ISO code reported by Whisper (e.g. 'en', 'ru', 'he')
}

export interface Transcriber {
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
}

export interface WhisperOptions {
  apiKey: string;
  fetch?: typeof fetch;
}

export function whisperTranscriber(opts: WhisperOptions): Transcriber {
  const f = opts.fetch ?? fetch;
  return {
    async transcribe(req) {
      const form = new FormData();
      form.set('file', new Blob([req.audio]), req.filename);
      form.set('model', 'whisper-1');
      form.set('response_format', 'verbose_json');
      if (req.lang !== 'auto') form.set('language', req.lang);
      const res = await f('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${opts.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Whisper API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as { text: string; language?: string };
      return { text: data.text, lang: data.language ?? 'unknown' };
    },
  };
}
```

- [ ] **Step 4: Run, pass**

```
cd cli && npx tsx --test test/transcriber.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/transcriber.ts cli/test/transcriber.test.ts
git commit -m "feat(cli): add Whisper transcriber abstraction"
```

---

## Task 4: `wai transcribe` command (single-file mode)

Composes the transcriber abstraction with audio-file copying, talk-page note appending, and a git commit.

**Files:**
- Create: `cli/src/commands/transcribe.ts`
- Create: `cli/test/transcribe.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write failing tests for happy path + missing API key**

Create `cli/test/transcribe.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTranscribe } from '../src/commands/transcribe.js';
import type { Transcriber } from '../src/transcriber.js';

function fakeIo() {
  const writes: Record<string, string | Uint8Array> = {};
  const reads: Record<string, Uint8Array> = {};
  const adds: string[] = [];
  const commits: string[] = [];
  const noteCalls: { slug: string; text: string; kind: string }[] = [];
  let uncommitted = false;
  const fakeTranscriber: Transcriber = {
    transcribe: async (_req) => ({ text: 'fake transcript', lang: 'en' }),
  };
  return {
    writes, reads, adds, commits, noteCalls,
    setUncommitted: (v: boolean) => { uncommitted = v; },
    deps: {
      readFileBinary: (p: string) => reads[p] ?? null,
      writeFileBinary: (p: string, b: Uint8Array) => { writes[p] = b; },
      mkdirP: (_p: string) => {},
      gitAdd: (paths: string[]) => { adds.push(...paths); },
      gitCommit: (msg: string) => { commits.push(msg); },
      gitHasUncommittedChanges: () => uncommitted,
      appendNote: async (slug: string, text: string, opts: { kind: string }) => { noteCalls.push({ slug, text, kind: opts.kind }); },
      transcriber: fakeTranscriber,
      now: () => '2026-05-10',
    },
  };
}

test('transcribe: copies audio, transcribes, appends note, commits', async () => {
  const { reads, writes, adds, commits, noteCalls, deps } = fakeIo();
  reads['/in/voice.m4a'] = new Uint8Array([1, 2, 3, 4]);
  let out = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/voice.m4a', lang: 'auto', speaker: 'Steven', date: '2026-05-08',
    ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(writes['/repo/assets/audio/aidele/voice.m4a'], new Uint8Array([1, 2, 3, 4]));
  assert.equal(noteCalls.length, 1);
  assert.equal(noteCalls[0]!.kind, 'transcript');
  assert.match(noteCalls[0]!.text, /fake transcript/);
  assert.deepEqual(adds, ['/repo/assets/audio/aidele/voice.m4a']);
  assert.match(commits[0]!, /^transcribe\(aidele\): voice\.m4a/);
});

test('transcribe: aborts with exit 3 when audio file is missing', async () => {
  const { deps } = fakeIo();
  let err = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/nope.m4a', lang: 'auto',
    ...deps, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 3);
  assert.match(err, /not found/);
});

test('transcribe: aborts with exit 7 when repo dirty', async () => {
  const { reads, deps, setUncommitted } = fakeIo();
  reads['/in/voice.m4a'] = new Uint8Array([0]);
  setUncommitted(true);
  let err = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/voice.m4a', lang: 'auto',
    ...deps, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 7);
  assert.match(err, /uncommitted/);
});
```

- [ ] **Step 2: Run, fail**

```
cd cli && npx tsx --test test/transcribe.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/commands/transcribe.ts`:

```typescript
import { join, basename } from 'node:path';
import type { Transcriber, Lang } from '../transcriber.js';

export interface TranscribeOptions {
  rootDir: string;
  slug: string;
  audioPath: string;
  lang: Lang;
  speaker?: string;
  date?: string;
  readFileBinary: (path: string) => Uint8Array | null;
  writeFileBinary: (path: string, content: Uint8Array) => void;
  mkdirP: (path: string) => void;
  gitAdd: (paths: string[]) => void;
  gitCommit: (message: string) => void;
  gitHasUncommittedChanges: () => boolean;
  appendNote: (slug: string, text: string, opts: { kind: 'transcript' }) => Promise<void>;
  transcriber: Transcriber;
  now: () => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runTranscribe(opts: TranscribeOptions): Promise<number> {
  const audio = opts.readFileBinary(opts.audioPath);
  if (audio === null) {
    opts.writeErr(`transcribe: ${opts.audioPath} not found\n`);
    return 3;
  }
  if (opts.gitHasUncommittedChanges()) {
    opts.writeErr(`transcribe: ${opts.rootDir} has uncommitted changes; commit or stash first\n`);
    return 7;
  }
  const filename = basename(opts.audioPath);
  const dest = join(opts.rootDir, 'assets', 'audio', opts.slug, filename);

  opts.mkdirP(join(opts.rootDir, 'assets', 'audio', opts.slug));
  opts.writeFileBinary(dest, audio);

  let result;
  try {
    result = await opts.transcriber.transcribe({
      audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
      filename,
      lang: opts.lang,
    });
  } catch (e) {
    opts.writeErr(`transcribe: API failure — ${(e as Error).message}\n`);
    return 5;
  }

  const noteText = formatTranscriptNote(result.text, {
    audio: filename,
    speaker: opts.speaker,
    date: opts.date,
    lang: result.lang,
  });
  await opts.appendNote(opts.slug, noteText, { kind: 'transcript' });

  opts.gitAdd([dest]);
  opts.gitCommit(`transcribe(${opts.slug}): ${filename}`);
  opts.write(`transcribe: ${filename} → ${dest}, lang=${result.lang}, ${result.text.length} chars\n`);
  return 0;
}

function formatTranscriptNote(text: string, meta: { audio: string; speaker?: string; date?: string; lang: string }): string {
  const lines: string[] = [];
  lines.push(`Transcript of \`${meta.audio}\`${meta.speaker ? ` (speaker: ${meta.speaker})` : ''}${meta.date ? ` recorded ${meta.date}` : ''}, lang=${meta.lang}:`);
  lines.push('');
  lines.push(text.trim());
  return lines.join('\n');
}
```

- [ ] **Step 4: Run, pass**

```
cd cli && npx tsx --test test/transcribe.test.ts
```

- [ ] **Step 5: Wire into `index.ts`**

Add the import and subcommand handler:

```typescript
import { runTranscribe } from './commands/transcribe.js';
import { whisperTranscriber } from './transcriber.js';
```

```typescript
} else if (cmd === 'transcribe') {
  const slug = args[1];
  const audioPath = args[2];
  if (!slug || !audioPath) {
    process.stderr.write('transcribe: usage — wai transcribe <slug> <audio>\n');
    process.exit(2);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    process.stderr.write('transcribe: OPENAI_API_KEY is not set\n');
    process.exit(4);
  }
  function flagValue(name: string): string | undefined {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  }
  const langArg = (flagValue('--lang') ?? 'auto') as 'en' | 'ru' | 'he' | 'auto';
  const speakerArg = flagValue('--speaker');
  const dateArg = flagValue('--date');
  const rootDir = process.env.WHOAMI_ROOT ?? join(process.env.HOME!, 'whoami');
  const client = new ApiClient(getServer());
  const code = await runTranscribe({
    rootDir,
    slug,
    audioPath,
    lang: langArg,
    speaker: speakerArg,
    date: dateArg,
    readFileBinary: (p) => existsSync(p) ? readFileSync(p) : null,
    writeFileBinary: (p, b) => { writeFileSync(p, b); },
    mkdirP: (p) => mkdirSync(p, { recursive: true }),
    gitAdd: (paths) => execSync(`git -C ${rootDir} add ${paths.map(shellEscape).join(' ')}`),
    gitCommit: (msg) => execSync(`git -C ${rootDir} commit -m ${shellEscape(msg)}`),
    gitHasUncommittedChanges: () => execSync(`git -C ${rootDir} status --porcelain`).toString().trim().length > 0,
    appendNote: async (slug, text, o) => { await client.note(slug, text, { kind: o.kind }); },
    transcriber: whisperTranscriber({ apiKey }),
    now: () => new Date().toISOString().slice(0, 10),
    write: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
  });
  process.exit(code);
}
```

Add help text:

```
  transcribe <slug> <audio>    Transcribe via OpenAI Whisper, append as
                                 research note on <slug>.talk
                                 --lang en|ru|he|auto (default: auto)
                                 --speaker NAME, --date YYYY-MM-DD
```

- [ ] **Step 6: Run all tests, typecheck**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/transcribe.ts cli/src/index.ts cli/test/transcribe.test.ts
git commit -m "feat(cli): add wai transcribe (single-file) for voice-note ingestion"
```

---

## Task 5: Harness adapter contract

Define the type contract from the spec's "Harness adapter" section. Adapter is an interface that takes a structured request and returns either a parsed result or a structured error. The Claude Code adapter is Task 6.

**Files:**
- Create: `cli/src/harness/types.ts`
- Create: `cli/src/harness/index.ts`

- [ ] **Step 1: Define the contract**

Create `cli/src/harness/types.ts`:

```typescript
export type HarnessTemplate =
  | 'research-questions'
  | 'outline'
  | 'draft-person'
  | 'draft-episode'
  | 'interview';

export interface HarnessRequest<T = unknown> {
  /** Skill bundle name; v1 always 'writing-articles' */
  skill: string;
  /** Template name (matches a file in skill's prompt-templates/). */
  template: HarnessTemplate;
  /** Arbitrary template-specific input. */
  context: T;
  /** JSON Schema fragment the response is validated against. */
  outputSchema: object;
}

export type HarnessResponse<R> =
  | { ok: true; result: R }
  | { ok: false; error: string; retryable: boolean };

export interface HarnessAdapter {
  invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>>;
}

export type HarnessName = 'claude-code' | 'codex' | 'opencode';
```

Create `cli/src/harness/index.ts`:

```typescript
import type { HarnessAdapter, HarnessName } from './types.js';
import { claudeCodeAdapter } from './claude-code.js';

export function selectHarness(name: HarnessName | undefined): HarnessAdapter {
  const choice = name ?? 'claude-code';
  switch (choice) {
    case 'claude-code':
      return claudeCodeAdapter();
    case 'codex':
    case 'opencode':
      throw new HarnessUnsupportedError(choice);
    default:
      throw new HarnessUnsupportedError(choice);
  }
}

export class HarnessUnsupportedError extends Error {
  constructor(public readonly harness: string) {
    super(`WHOAMI_HARNESS=${harness} not yet supported in v1; use claude-code`);
    this.name = 'HarnessUnsupportedError';
  }
}

export type { HarnessAdapter, HarnessRequest, HarnessResponse, HarnessTemplate, HarnessName } from './types.js';
```

- [ ] **Step 2: Commit (no tests yet — types only)**

```bash
git add cli/src/harness/types.ts cli/src/harness/index.ts
git commit -m "feat(cli): scaffold harness adapter contract"
```

---

## Task 6: Claude Code harness adapter implementation

Spawns `claude --print --output-format json --append-system-prompt <skill>` with the structured request piped to stdin; parses the JSON response and validates against `outputSchema`.

**Files:**
- Create: `cli/src/harness/claude-code.ts`
- Create: `cli/test/harness/claude-code.test.ts`

- [ ] **Step 1: Write failing tests using a fake spawn**

Create `cli/test/harness/claude-code.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCodeAdapter } from '../../src/harness/claude-code.js';

function fakeSpawn(stdoutText: string, stderrText = '', code = 0) {
  return async (_cmd: string, _args: string[], _stdin: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    return { stdout: stdoutText, stderr: stderrText, code };
  };
}

test('claude-code adapter: parses successful JSON response', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"questions":["q1","q2"]}' }));
  const a = claudeCodeAdapter({ spawn });
  const res = await a.invoke<unknown, { questions: string[] }>({
    skill: 'writing-articles',
    template: 'interview',
    context: { slug: 'aidele' },
    outputSchema: { type: 'object', required: ['questions'], properties: { questions: { type: 'array' } } },
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.result.questions, ['q1', 'q2']);
  }
});

test('claude-code adapter: returns ok=false on non-zero exit', async () => {
  const spawn = fakeSpawn('', 'something broke', 2);
  const a = claudeCodeAdapter({ spawn });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {}, outputSchema: {},
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /something broke/);
    assert.equal(res.retryable, true);
  }
});

test('claude-code adapter: returns ok=false when result fails outputSchema', async () => {
  const spawn = fakeSpawn(JSON.stringify({ result: '{"unrelated":1}' }));
  const a = claudeCodeAdapter({ spawn });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /schema/);
    assert.equal(res.retryable, false);
  }
});
```

- [ ] **Step 2: Run, fail**

```
cd cli && npx tsx --test test/harness/claude-code.test.ts
```

- [ ] **Step 3: Implement the adapter (with a minimal JSON-Schema validator)**

Create `cli/src/harness/claude-code.ts`:

```typescript
import type { HarnessAdapter, HarnessRequest, HarnessResponse } from './types.js';

type SpawnFn = (cmd: string, args: string[], stdin: string) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface ClaudeCodeOptions {
  spawn?: SpawnFn;
  binary?: string;
}

export function claudeCodeAdapter(opts: ClaudeCodeOptions = {}): HarnessAdapter {
  const spawn = opts.spawn ?? defaultSpawn;
  const binary = opts.binary ?? 'claude';
  return {
    async invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>> {
      const stdin = JSON.stringify({
        skill: req.skill,
        template: req.template,
        context: req.context,
      });
      const args = ['--print', '--output-format', 'json', '--append-system-prompt', req.skill];
      let proc: { stdout: string; stderr: string; code: number };
      try {
        proc = await spawn(binary, args, stdin);
      } catch (e) {
        return { ok: false, error: `harness spawn failed: ${(e as Error).message}`, retryable: true };
      }
      if (proc.code !== 0) {
        return { ok: false, error: proc.stderr.trim() || `harness exited with code ${proc.code}`, retryable: true };
      }
      let outer: { result?: string };
      try {
        outer = JSON.parse(proc.stdout);
      } catch (e) {
        return { ok: false, error: `harness stdout is not JSON: ${(e as Error).message}`, retryable: false };
      }
      if (typeof outer.result !== 'string') {
        return { ok: false, error: `harness response missing string \`result\` field`, retryable: false };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(outer.result);
      } catch (e) {
        return { ok: false, error: `harness inner result is not JSON: ${(e as Error).message}`, retryable: false };
      }
      const schemaError = validateAgainstSchema(parsed, req.outputSchema);
      if (schemaError) {
        return { ok: false, error: `harness response failed schema: ${schemaError}`, retryable: false };
      }
      return { ok: true, result: parsed as R };
    },
  };
}

/**
 * Minimal JSON Schema validator. Supports: type, required, properties (recursive).
 * Anything else passes. Replace with a proper validator (ajv) only if needed.
 */
function validateAgainstSchema(data: unknown, schema: unknown): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const s = schema as { type?: string; required?: string[]; properties?: Record<string, unknown> };
  if (s.type === 'object') {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return `expected object, got ${data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data}`;
    }
    const obj = data as Record<string, unknown>;
    for (const key of s.required ?? []) {
      if (!(key in obj)) return `missing required key ${key}`;
    }
    for (const [key, propSchema] of Object.entries(s.properties ?? {})) {
      if (key in obj) {
        const e = validateAgainstSchema(obj[key], propSchema);
        if (e) return `${key}: ${e}`;
      }
    }
    return null;
  }
  if (s.type === 'array') {
    if (!Array.isArray(data)) return `expected array, got ${typeof data}`;
    return null;
  }
  if (s.type === 'string') {
    return typeof data === 'string' ? null : `expected string, got ${typeof data}`;
  }
  return null;
}

const defaultSpawn: SpawnFn = async (cmd, args, stdin) => {
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
};
```

- [ ] **Step 4: Run, pass**

```
cd cli && npx tsx --test test/harness/claude-code.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/harness/claude-code.ts cli/test/harness/claude-code.test.ts
git commit -m "feat(cli): claude-code harness adapter with schema validation"
```

---

## Task 7: `writing-articles` skill bundle (Plan 1 minimum)

Create the skill scaffolding plus the single template `wai interview` needs. Other templates land in Plan 2.

**Files:**
- Create: `plugins/whoami/skills/writing-articles/SKILL.md`
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/interview.md`

- [ ] **Step 1: Write SKILL.md (Plan 1 scope only — pipeline phases land in Plan 2)**

Create `plugins/whoami/skills/writing-articles/SKILL.md`:

```markdown
---
name: writing-articles
description: Multi-stream article authoring for whoami.wiki — research synthesis, episode-spinoff judgment, person-vs-episode drafting. Composes with editorial-guide.
user-invocable: false
---

# Writing articles

This skill assumes you have already loaded `editorial-guide`. It adds:
how to research, how to decide person-vs-episode, and how to weave the
three input streams (relations / family narrative / external research)
into prose.

## Preconditions

- The evidence drawer for the slug (derived YAML, talk-page research
  notes, narrative file, audio transcripts) has been gathered by the
  caller and is provided in the request `context`.
- Web access is available (research template only).
- `editorial-guide` is loaded and applies to all drafted prose.

## Templates

The harness adapter calls this skill with one of five templates:

- `research-questions` — Phase 2; emit web-search queries from gaps.
- `outline` — Phase 3; emit drafting plan + episode spinoffs.
- `draft-person` — Phase 4; emit person-page markdown.
- `draft-episode` — Phase 5; emit episode-page markdown (one call per
  episode).
- `interview` — used by `wai interview`; emit Q&A questions tailored
  to gaps in the evidence drawer.

In Plan 1 only the `interview` template is implemented. Other
templates land in Plan 2 alongside `wai author`.

## Three-stream weaving rule

Every *claim* (a factual assertion: a date, a place, an action, a
relationship, an attribution) must be traceable to at least one input
stream — relations, narrative, or external research. Connective and
summary prose — sentences that sequence claims, transition between
sections, or compress an arc into a paragraph — is permitted and
necessary for readable episode pages. Speculation that fills a silence
with a guess is forbidden; gaps are recorded as `::open` threads on
the talk page.

## Forbidden, even on episode pages

- Inventing details to dress up data ("the cold November wind…").
- Period color the records don't license. Name a regime only when the
  record names it or it materially shaped the event.
- Filling silences with plausible guesses.
- First-person family voice. The wiki is third-person across all kinds.

## Self-check before saving (semantic only)

- Every claim has a footnote, OR is GEDCOM-derived, OR is from the
  evidence drawer with the source identifiable.
- No words from `editorial-guide/words-to-watch.md` survived.
- The page reads as a coherent narrative — no orphan paragraphs, no
  abrupt subject changes between sections.

Mechanical checks (footnote integrity, references/bibliography
placement, wikilink resolution, frontmatter shape) are **not**
duplicated here. `wai check` enforces them; `wai author` Phase 6
surfaces any findings.
```

- [ ] **Step 2: Write the `interview` template**

Create `plugins/whoami/skills/writing-articles/prompt-templates/interview.md`:

```markdown
---
name: interview
description: Generate targeted Q&A questions about a person, drawing from gaps in the evidence drawer.
outputSchema:
  type: object
  required: [questions]
  properties:
    questions:
      type: array
      items:
        type: object
        required: [text]
        properties:
          text:
            type: string
          rationale:
            type: string
---

# Interview template

You will be given the evidence drawer for one person:

- `derived` — GEDCOM-derived YAML (name, dates, parents, spouses,
  children, places).
- `talk` — current `<slug>.talk.md` content (research notes,
  open/closed gap threads).
- `narrative` — current `<slug>.narrative.md` content if present.

Your job: generate **targeted questions** about this person that the
existing record can't answer. Good questions:

- Reach for personality, relationships, daily life, occupations,
  migrations, decisions — not facts the GEDCOM already has.
- Are specific enough to prompt a memory ("How did Aidele end up in
  Teofipol?") rather than open-ended ("Tell me about her").
- Don't ask about people the user clearly has no connection to (a
  great-great-aunt's husband's brother).
- Don't repeat questions already asked in `talk`'s research notes.

Cap at the limit specified in `context.maxQuestions` (default 8).

Return JSON matching the `outputSchema`:

```json
{
  "questions": [
    { "text": "How did Aidele's family come to settle in Teofipol?", "rationale": "Birthplace recorded but origin family not." },
    { "text": "What did her work as a hatter look like in 1928?", "rationale": "Census records the trade but no detail." }
  ]
}
```
```

- [ ] **Step 3: Commit**

```bash
git add plugins/whoami/skills/writing-articles/
git commit -m "feat(plugin): scaffold writing-articles skill with interview template"
```

---

## Task 8: `wai interview` command

Drives the harness for question generation, opens `$EDITOR` with the prefilled Q&A markdown, parses the user's answers on save, and posts each non-empty answer as a `wai note --kind=interview`.

**Files:**
- Create: `cli/src/commands/interview.ts`
- Create: `cli/test/interview.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/test/interview.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInterview } from '../src/commands/interview.js';
import type { HarnessAdapter } from '../src/harness/types.js';

interface Calls {
  notes: { slug: string; text: string; kind: string }[];
}

function fakeHarness(questions: { text: string; rationale?: string }[]): HarnessAdapter {
  return {
    invoke: async () => ({ ok: true, result: { questions } }),
  };
}

function failingHarness(error: string, retryable = true): HarnessAdapter {
  return { invoke: async () => ({ ok: false, error, retryable }) };
}

const baseDeps = (calls: Calls) => ({
  appendNote: async (slug: string, text: string, opts: { kind: string }) => { calls.notes.push({ slug, text, kind: opts.kind }); },
  loadEvidence: async () => ({ derived: { name: 'Aidele' }, talk: '', narrative: null }),
});

test('interview: writes Q+A buffer to $EDITOR; saves answered pairs as kind=interview notes', async () => {
  const calls: Calls = { notes: [] };
  const harness = fakeHarness([
    { text: 'How did Aidele come to Teofipol?', rationale: 'Origin family undocumented' },
    { text: 'What was her work like?', rationale: 'Trade recorded but no detail' },
  ]);
  let bufferGivenToEditor = '';
  const code = await runInterview({
    slug: 'aidele',
    maxQuestions: 8,
    harness,
    editInEditor: async (initial) => {
      bufferGivenToEditor = initial;
      return initial.replace(/<answer>\s*<\/answer>/g, (_m, _o, idx, _s) => idx < 200 ? '<answer>\nfirst answer\n</answer>' : '<answer>\n</answer>');
    },
    ...baseDeps(calls),
    write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(bufferGivenToEditor, /How did Aidele come to Teofipol\?/);
  assert.equal(calls.notes.length, 1);
  assert.equal(calls.notes[0]!.kind, 'interview');
  assert.match(calls.notes[0]!.text, /How did Aidele come to Teofipol\?/);
  assert.match(calls.notes[0]!.text, /first answer/);
});

test('interview: drops blank answers; commits zero notes when all blank', async () => {
  const calls: Calls = { notes: [] };
  const harness = fakeHarness([{ text: 'Q?' }, { text: 'Q2?' }]);
  const code = await runInterview({
    slug: 'aidele', maxQuestions: 8, harness,
    editInEditor: async (initial) => initial,
    ...baseDeps(calls), write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 3); // editor exited empty
  assert.equal(calls.notes.length, 0);
});

test('interview: returns exit 6 when harness fails', async () => {
  const calls: Calls = { notes: [] };
  const code = await runInterview({
    slug: 'aidele', maxQuestions: 8,
    harness: failingHarness('claude-code crashed', true),
    editInEditor: async () => '',
    ...baseDeps(calls), write: () => {}, writeErr: () => {},
  });
  assert.equal(code, 6);
});
```

- [ ] **Step 2: Run, fail**

```
cd cli && npx tsx --test test/interview.test.ts
```

- [ ] **Step 3: Implement**

Create `cli/src/commands/interview.ts`:

```typescript
import type { HarnessAdapter } from '../harness/types.js';

interface Question { text: string; rationale?: string }

export interface InterviewOptions {
  slug: string;
  maxQuestions: number;
  harness: HarnessAdapter;
  loadEvidence: (slug: string) => Promise<{ derived: unknown; talk: string; narrative: string | null }>;
  editInEditor: (initial: string) => Promise<string>;
  appendNote: (slug: string, text: string, opts: { kind: 'interview' }) => Promise<void>;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, rationale: { type: 'string' } } },
    },
  },
};

export async function runInterview(opts: InterviewOptions): Promise<number> {
  const evidence = await opts.loadEvidence(opts.slug);
  const res = await opts.harness.invoke<unknown, { questions: Question[] }>({
    skill: 'writing-articles',
    template: 'interview',
    context: { slug: opts.slug, maxQuestions: opts.maxQuestions, evidence },
    outputSchema: OUTPUT_SCHEMA,
  });
  if (!res.ok) {
    opts.writeErr(`interview: harness failed — ${res.error}\n`);
    return 6;
  }
  const buffer = renderQAs(opts.slug, res.result.questions);
  const edited = await opts.editInEditor(buffer);
  const answers = parseAnswers(edited);
  if (answers.length === 0) {
    opts.writeErr(`interview: no answers entered\n`);
    return 3;
  }
  for (const a of answers) {
    const noteText = `**Q:** ${a.question}\n\n**A:** ${a.answer}`;
    await opts.appendNote(opts.slug, noteText, { kind: 'interview' });
  }
  opts.write(`interview: saved ${answers.length} of ${res.result.questions.length} answer${answers.length === 1 ? '' : 's'} to ${opts.slug}.talk\n`);
  return 0;
}

function renderQAs(slug: string, questions: Question[]): string {
  const out: string[] = [];
  out.push(`<!-- Interview for ${slug}. Fill in <answer> blocks; blank answers are dropped on save. -->`);
  out.push('');
  for (const q of questions) {
    out.push(`### ${q.text}`);
    if (q.rationale) out.push(`*Why this is asked: ${q.rationale}*`);
    out.push('');
    out.push('<answer>');
    out.push('');
    out.push('</answer>');
    out.push('');
  }
  return out.join('\n');
}

function parseAnswers(text: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const re = /^### (.+?)\n(?:\*Why.*?\*\n)?(?:\n)?<answer>\n([\s\S]*?)\n<\/answer>/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const q = m[1]!.trim();
    const a = m[2]!.trim();
    if (a !== '') out.push({ question: q, answer: a });
  }
  return out;
}
```

- [ ] **Step 4: Run, pass**

```
cd cli && npx tsx --test test/interview.test.ts
```

- [ ] **Step 5: Wire into `index.ts`**

```typescript
import { runInterview } from './commands/interview.js';
import { selectHarness, HarnessUnsupportedError } from './harness/index.js';
```

```typescript
} else if (cmd === 'interview') {
  const slug = args[1];
  if (!slug) { process.stderr.write('interview: slug required\n'); process.exit(2); }
  const qIdx = args.indexOf('--questions');
  const maxQuestions = qIdx !== -1 ? parseInt(args[qIdx + 1] ?? '8', 10) : 8;
  let harness;
  try {
    harness = selectHarness(process.env.WHOAMI_HARNESS as 'claude-code' | 'codex' | 'opencode' | undefined);
  } catch (e) {
    if (e instanceof HarnessUnsupportedError) {
      process.stderr.write(`interview: ${e.message}\n`);
      process.exit(11);
    }
    throw e;
  }
  const client = new ApiClient(getServer());
  const code = await runInterview({
    slug,
    maxQuestions,
    harness,
    loadEvidence: async (slug) => {
      // Talk page: via the API (already does slug → file resolution).
      const talkPage = await client.read(`${slug}.talk`).catch(() => null);
      const talk = talkPage?.body ?? '';

      // Narrative file: lives at $WHOAMI_ROOT/pages/<slug>.narrative.md.
      const rootDir = process.env.WHOAMI_ROOT ?? join(process.env.HOME!, 'whoami');
      const narrPath = join(rootDir, 'pages', `${slug}.narrative.md`);
      const narrative = existsSync(narrPath) ? readFileSync(narrPath, 'utf8') : null;

      // Derived YAML: resolve via the page's own frontmatter `gedcom.record`
      // when a page exists. If no page exists yet, leave derived null;
      // Plan 2's evidence loader will search the derived/ dir directly.
      let derived: string | null = null;
      const pagePath = join(rootDir, 'pages', `${slug}.md`);
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
    editInEditor: async (initial) => editInEditor(initial, '.md'),
    appendNote: async (slug, text, o) => { await client.note(slug, text, { kind: o.kind }); },
    write: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
  });
  process.exit(code);
}
```

If a `findDerivedYml` helper doesn't already exist, add a tiny one inline that walks `genealogy/derived/*.yml` and returns the path whose `name:` field matches the slug; if it doesn't match a derived record, returns `null` (not fatal — the interview can still draw on `talk`/`narrative`). If you can't easily implement that lookup in this PR, omit the `derived` field entirely from the loaded evidence — Plan 2 will replace this with the proper evidence loader.

Add help text:

```
  interview <slug>             Generate Q&A questions via the harness;
                                 captures answers as kind=interview notes
                                 --questions N (default: 8)
```

- [ ] **Step 6: Run all tests + typecheck**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/interview.ts cli/src/index.ts cli/test/interview.test.ts
git commit -m "feat(cli): add wai interview, the first harness-driven command"
```

---

## Task 9: `wai transcribe --dir` batch mode

Adds directory ingestion to the existing transcribe command. Failures on individual files are journaled to a `<run-id>-failed.txt` file and don't abort the rest.

**Files:**
- Modify: `cli/src/commands/transcribe.ts`
- Modify: `cli/src/index.ts`
- Modify: `cli/test/transcribe.test.ts`

- [ ] **Step 1: Write failing tests for the batch wrapper**

Append to `cli/test/transcribe.test.ts`:

```typescript
import { runTranscribeDir } from '../src/commands/transcribe.js';

test('transcribe --dir: processes every audio file; commits each', async () => {
  const { reads, writes, commits, deps } = fakeIo();
  reads['/in/a.m4a'] = new Uint8Array([1]);
  reads['/in/b.m4a'] = new Uint8Array([2]);
  let listed: string[] = ['/in/a.m4a', '/in/b.m4a'];
  let out = '';
  const code = await runTranscribeDir({
    rootDir: '/repo', slug: 'aidele', dirPath: '/in', lang: 'auto',
    listAudio: (_d) => listed,
    runOne: async (audioPath) => {
      // delegate to runTranscribe with the same fake deps
      return runTranscribeFromTest({ rootDir: '/repo', slug: 'aidele', audioPath, lang: 'auto', deps });
    },
    writeFile: (p, c) => { writes[p] = c; },
    write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(commits.length, 2);
  assert.match(out, /2 transcribed/);
});

async function runTranscribeFromTest(args: { rootDir: string; slug: string; audioPath: string; lang: 'auto' | 'en' | 'ru' | 'he'; deps: any }) {
  return runTranscribe({ ...args, ...args.deps, write: () => {}, writeErr: () => {} });
}

test('transcribe --dir: failures journaled, command exits 5', async () => {
  const { reads, writes, deps } = fakeIo();
  reads['/in/a.m4a'] = new Uint8Array([1]);
  // /in/b.m4a missing on purpose
  let out = '';
  const code = await runTranscribeDir({
    rootDir: '/repo', slug: 'aidele', dirPath: '/in', lang: 'auto',
    listAudio: () => ['/in/a.m4a', '/in/b.m4a'],
    runOne: async (audioPath) => runTranscribe({ rootDir: '/repo', slug: 'aidele', audioPath, lang: 'auto', ...deps, write: () => {}, writeErr: () => {} }),
    writeFile: (p, c) => { writes[p] = c; },
    write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 5);
  const failedPath = Object.keys(writes).find(p => p.includes('transcribe-runs') && p.endsWith('-failed.txt'));
  assert(failedPath, 'expected -failed.txt to be written');
  assert.match(writes[failedPath!] as string, /b\.m4a/);
});
```

- [ ] **Step 2: Run, fail**

```
cd cli && npx tsx --test test/transcribe.test.ts
```

- [ ] **Step 3: Implement `runTranscribeDir`**

Append to `cli/src/commands/transcribe.ts`:

```typescript
export interface TranscribeDirOptions {
  rootDir: string;
  slug: string;
  dirPath: string;
  lang: Lang;
  listAudio: (dir: string) => string[];
  runOne: (audioPath: string) => Promise<number>;
  writeFile: (path: string, content: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runTranscribeDir(opts: TranscribeDirOptions): Promise<number> {
  const audios = opts.listAudio(opts.dirPath);
  const runId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const failed: { path: string; code: number }[] = [];
  let ok = 0;
  for (const a of audios) {
    const code = await opts.runOne(a);
    if (code === 0) ok += 1; else failed.push({ path: a, code });
  }
  if (failed.length > 0) {
    const failedPath = `${opts.rootDir}/data/transcribe-runs/${runId}-failed.txt`;
    const lines = failed.map(f => `${f.path}\texit=${f.code}`);
    opts.writeFile(failedPath, lines.join('\n') + '\n');
    opts.write(`transcribe: ${ok} transcribed, ${failed.length} failed (see ${failedPath})\n`);
    return 5;
  }
  opts.write(`transcribe: ${ok} transcribed\n`);
  return 0;
}
```

- [ ] **Step 4: Run, pass**

```
cd cli && npx tsx --test test/transcribe.test.ts
```

- [ ] **Step 5: Wire `--dir` into `index.ts`**

In the `transcribe` subcommand handler (added in Task 4), branch when `--dir` is the second positional or a `--dir <path>` flag:

```typescript
} else if (cmd === 'transcribe') {
  const slug = args[1];
  if (!slug) { /* …existing… */ }
  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1) {
    const dirPath = args[dirIdx + 1];
    if (!dirPath) { process.stderr.write('transcribe: --dir requires a path\n'); process.exit(2); }
    // Build the same deps object as the single-file path, then call runTranscribeDir:
    const code = await runTranscribeDir({
      rootDir, slug, dirPath, lang: langArg,
      listAudio: (d) => readdirSync(d).filter(f => /\.(m4a|mp3|wav|aac|flac)$/i.test(f)).map(f => join(d, f)),
      runOne: (audioPath) => runTranscribe({ /* same deps as single-file branch */ rootDir, slug, audioPath, lang: langArg, /* … */ } as any),
      writeFile: (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); },
      write: (s) => process.stdout.write(s),
      writeErr: (s) => process.stderr.write(s),
    });
    process.exit(code);
  }
  // …single-file branch unchanged…
}
```

The duplicated dep-building is ugly; if you've factored a helper out to construct the single-file deps object, reuse it from both branches.

Add help text update:

```
  transcribe <slug> --dir D    Batch-transcribe every audio file in D
```

- [ ] **Step 6: Run all tests, typecheck**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/transcribe.ts cli/src/index.ts cli/test/transcribe.test.ts
git commit -m "feat(cli): wai transcribe --dir batch mode with failure journal"
```

---

## Task 10: CHANGELOG entries and plan-status README rows

Document Plan 1's deliverables in the standard places.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add CHANGELOG entries under `## [Unreleased]`**

Open `CHANGELOG.md` and add (insert in date order; the existing format is bulleted entries grouped by date or under a single Unreleased section):

```markdown
- **2026-05-10** — `wai narrative <slug>`: edit, ingest, or print
  `pages/<slug>.narrative.md` (the new family-narrative input file).
  Each save commits in `$WHOAMI_ROOT`. Aborts with exit 7 if the data
  repo has uncommitted changes.
- **2026-05-10** — `wai transcribe <slug> <audio>`: transcribe via
  OpenAI Whisper API, copy audio under `assets/audio/<slug>/`, append
  the transcript as a `kind=transcript` research note. `--dir` batch
  mode lands on the same date.
- **2026-05-10** — `wai interview <slug>`: harness-driven Q&A round.
  Generates targeted questions from gaps in the evidence drawer, opens
  `$EDITOR` with a fillable buffer, posts each answered pair as a
  `kind=interview` note. First user of the harness adapter.
- **2026-05-10** — `wai note --kind <k>` accepts new sub-kinds for
  agent-authored notes: `interview`, `research`, `transcript`. Existing
  `human` and `agent` values continue to work; the renderer treats the
  new kinds as agent notes.
- **2026-05-10** — Harness adapter (`cli/src/harness/`): the new
  LLM-driver class of CLI command, defined by an `invoke` contract
  (request → `{ ok, result | error }`). v1 ships the Claude Code
  adapter; Codex and OpenCode return exit 11 ("not yet supported").
- **2026-05-10** — `plugins/whoami/skills/writing-articles/`: skill
  bundle with the `interview` prompt template. Rest of the templates
  land alongside `wai author` in Plan 2.
```

- [ ] **Step 2: Add the plan row to the index**

Open `docs/superpowers/plans/README.md` and add a row in the table:

```markdown
| 🚧 | [`2026-05-10-article-pipeline-plan-1-foundation.md`](./2026-05-10-article-pipeline-plan-1-foundation.md) | Article pipeline — Plan 1: Foundation | Evidence-drawer commands (`wai narrative`, `wai transcribe`, `wai interview`), `wai note --kind` extension, harness adapter, `writing-articles` skill scaffold. Sequenced before Plans 2 and 3. |
```

- [ ] **Step 3: Final smoke**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index entries for article pipeline plan 1"
```

---

## Done with Plan 1

After Task 10 is complete, the user can:

- Drop a free-form narrative for any person via `wai narrative <slug>`.
- Transcribe voice notes (in English, Russian, or Hebrew) via
  `wai transcribe <slug> <audio>` — single file or `--dir`.
- Run targeted Q&A interviews via `wai interview <slug>` and have
  answers automatically captured as research notes.
- Existing `wai note` continues to accept the older `kind` values plus
  the three new agent-note sub-kinds.

Plan 2 (next) builds `wai author <slug>` on this foundation: it reads
the same evidence drawer this plan fills, calls the same harness
adapter, and produces the actual articles.
