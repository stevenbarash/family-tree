# Article-authoring pipeline — Plan 2 of 3: Authoring core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `wai author <slug>` — the single-slug orchestrator that turns the evidence drawer into committed person + episode pages. Adds the consistency category to `wai check`. Adds renderer/search filters for `*.narrative.md`.

**Architecture:** A new TypeScript orchestrator (`cli/src/commands/author.ts`) drives seven phases (gather, research, outline, draft-person, draft-episode, verify, log) by composing the existing primitives (`wai note`, `wai write`, `wai create`, `wai check`) and the harness adapter from Plan 1. Each phase that mutates state produces one or more git commits in `$WHOAMI_ROOT` with structured trailers. Phase resumability comes from reading those trailers via `git log`. The four remaining prompt templates land in the `writing-articles` skill bundle alongside this work.

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`. Composes Plan 1's harness adapter (`cli/src/harness/`) and the existing `wai check` detector framework in `core/src/checks/`.

**Spec reference:** `docs/superpowers/specs/2026-05-10-article-authoring-pipeline-design.md` (rev 1 at commit `6d9a15b`).

**Plan 1 reference:** `docs/superpowers/plans/2026-05-10-article-pipeline-plan-1-foundation.md` (shipped at commit `5c58422`).

---

## Scope

**In scope:**

1. **Harness adapter template routing** (Task 1) — resolve the Plan 1 TODO. The adapter must read `SKILL.md` + `prompt-templates/<template>.md` from disk and append both to the system prompt when invoked. Plan 1's adapter ships with a literal-string fallback that breaks once multiple templates exist.
2. **Four remaining prompt templates** (Task 2) — `research-questions`, `outline`, `draft-person`, `draft-episode` — each with its own `outputSchema` and instructions.
3. **Pre-flight + phase scaffold** (Task 3) — `runAuthor` skeleton: argument parsing, pre-flight checks (uncommitted-changes guard, healthz, `WHOAMI_HARNESS` validation, branch handling), the seven-phase loop, the structured commit-trailer helper, and `--dry-run`.
4. **Phase 1 gather** (Task 4) — read derived YAML, talk page, narrative file, audio-transcript notes; assemble an evidence-drawer object. Pure function; testable without I/O.
5. **Phase 2 research** (Task 5) — call harness with `research-questions`, run the queries via WebSearch/WebFetch, validate sources, write each surviving claim to the talk page as `kind=research` notes, commit.
6. **Phase 3 outline** (Task 6) — call harness with `outline`, append the drafting plan to the talk page under `## Drafting plan`, commit.
7. **Phase 4 draft person** (Task 7) — call harness with `draft-person`, write `pages/<slug>.md`, commit.
8. **Phase 5 draft episode** (Task 8) — for each episode in the outline, call harness with `draft-episode`, write `pages/<episode-slug>.md`, commit per episode.
9. **`wai check --include consistency`** (Task 9) — fifth detector category covering self-contradiction, cross-page contradiction, footnote↔claim mismatch, GEDCOM↔page mismatch, bibliography↔inline mismatch, orphaned footnotes.
10. **Phase 6 verify + Phase 7 log** (Task 10) — run `wai check --fix --only format,schema` then `wai check --only consistency`. On consistency findings, exit 5. Else write the agent-log entry and commit.
11. **`--resume`** (Task 11) — read pipeline-run trailer from `git log`, fast-forward to the next unstarted phase. Cold-start support (no prior commits → start fresh).
12. **Renderer + search filters for `*.narrative.md`** (Task 12) — one-line additions to `frontend/lib/` and `core/src/search/` excluding the new file kind.
13. **CHANGELOG + plan-index** (Task 13).

**Out of scope (Plan 3):**
- `wai author --cohort` batch mode.
- `wai revert` and `wai history` ergonomic commands.

**Out of scope (deferred entirely):**
- Codex / OpenCode harness adapters.
- SQLite for the consistency fact map.
- `--background` daemon mode.
- Local Whisper fallback.

## File structure

```
cli/src/commands/author.ts                     NEW. Orchestrator.
cli/src/commands/author/                        NEW dir. One file per phase.
  gather.ts                                    NEW. Pure evidence-drawer assembler.
  research.ts                                  NEW. Web research + note appending.
  outline.ts                                   NEW. Harness call + drafting plan write.
  draft-person.ts                              NEW. Person-page draft.
  draft-episode.ts                             NEW. Episode-page draft.
  verify.ts                                    NEW. wai check + consistency loop.
  log.ts                                       NEW. Agent-log entry.
  pipeline-run.ts                              NEW. Trailer parsing + resume detection.
cli/src/commands/author.test.ts                NEW. Orchestrator integration test.
cli/src/commands/check.ts                      MODIFY. Accept `consistency` category.
cli/src/harness/claude-code.ts                 MODIFY. Resolve template TODO.
cli/test/harness/claude-code.test.ts           MODIFY. Test template loading.
cli/test/commands/author/*.test.ts             NEW. One per phase.
cli/src/index.ts                               MODIFY. Wire `wai author` subcommand.
core/src/checks/types.ts                       MODIFY. Add 'consistency' to FindingCategory.
core/src/checks/consistency-drift.ts           NEW. The fifth detector.
core/test/checks/consistency-drift.test.ts     NEW.
core/src/search/                               MODIFY one line. Exclude *.narrative.md.
frontend/lib/                                  MODIFY one line. Exclude *.narrative.md.
plugins/whoami/skills/writing-articles/SKILL.md
                                               MODIFY. Reflect that all five templates exist.
plugins/whoami/skills/writing-articles/prompt-templates/research-questions.md
                                               NEW.
plugins/whoami/skills/writing-articles/prompt-templates/outline.md
                                               NEW.
plugins/whoami/skills/writing-articles/prompt-templates/draft-person.md
                                               NEW.
plugins/whoami/skills/writing-articles/prompt-templates/draft-episode.md
                                               NEW.
CHANGELOG.md                                   MODIFY. Unreleased entries.
docs/superpowers/plans/README.md               MODIFY. Plan-status row.
```

## Conventions adhered to

- `runAuthor` and per-phase functions follow the injected-I/O pattern (`Plan 1` uses this consistently).
- Each phase function returns `{ committed: boolean, summary: string }` so the orchestrator can log progress and decide whether to record a commit.
- The orchestrator never commits directly — phases produce file-write effects, the orchestrator runs them through a single committer.
- Tests stub the harness adapter with canned responses (the same pattern Plan 1's `wai interview` test used).
- Commits use the trailer format from the spec (`pipeline-run`, `phase`, `slug`, `inputs`, `sources`, `fabrication-guard`).
- Conventional commits: lowercase after the prefix, no trailing period, no `Co-Authored-By`.

---

## Task 1: Resolve Plan 1's harness template-routing TODO

The Plan 1 final review flagged that `cli/src/harness/claude-code.ts` passes `req.skill` (e.g. `'writing-articles'`) literally to `--append-system-prompt`, which appends the literal string rather than loading skill content. With one template (`interview`) and a small `outputSchema` the model could infer its job, but Plan 2 ships four more templates. The adapter must read SKILL.md + prompt-templates/<template>.md from disk.

**Files:**
- Modify: `cli/src/harness/claude-code.ts`
- Modify: `cli/test/harness/claude-code.test.ts`

- [ ] **Step 1: Add a `skillsDir` resolver to `ClaudeCodeOptions`**

In `cli/src/harness/claude-code.ts`, extend `ClaudeCodeOptions`:

```typescript
export interface ClaudeCodeOptions {
  spawn?: SpawnFn;
  binary?: string;
  /**
   * Root directory containing skill bundles (one folder per skill).
   * Required to resolve `<skillsDir>/<skill>/SKILL.md` and
   * `<skillsDir>/<skill>/prompt-templates/<template>.md`. Defaults to
   * `plugins/whoami/skills` resolved relative to the CLI binary's
   * runtime directory; callers can override via env or option.
   */
  skillsDir?: string;
  /** Optional hook for tests; default reads from the filesystem. */
  readSkillFile?: (path: string) => string | null;
}
```

- [ ] **Step 2: Update `claudeCodeAdapter` to read and concatenate**

Replace the args construction with code that reads both files (when `skillsDir` is provided or resolvable) and concatenates them as a single appended-system-prompt string. If either file is missing, return `{ ok: false, error, retryable: false }` (it's a configuration error, not a transient one).

```typescript
export function claudeCodeAdapter(opts: ClaudeCodeOptions = {}): HarnessAdapter {
  const spawn = opts.spawn ?? defaultSpawn;
  const binary = opts.binary ?? 'claude';
  const skillsDir = opts.skillsDir ?? defaultSkillsDir();
  const readFile = opts.readSkillFile ?? defaultReadSkillFile;
  return {
    async invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>> {
      const skillPath = `${skillsDir}/${req.skill}/SKILL.md`;
      const templatePath = `${skillsDir}/${req.skill}/prompt-templates/${req.template}.md`;
      const skillContent = readFile(skillPath);
      if (skillContent === null) {
        return { ok: false, error: `harness: skill not found at ${skillPath}`, retryable: false };
      }
      const templateContent = readFile(templatePath);
      if (templateContent === null) {
        return { ok: false, error: `harness: template not found at ${templatePath}`, retryable: false };
      }
      const systemPrompt = `${skillContent}\n\n---\n\n${templateContent}`;
      const stdin = JSON.stringify({ skill: req.skill, template: req.template, context: req.context });
      const args = ['--print', '--output-format', 'json', '--append-system-prompt', systemPrompt];
      // …rest of invoke unchanged (spawn → parse → validate → return)
    },
  };
}

function defaultSkillsDir(): string {
  // Resolve relative to the CLI binary. The bundled CLI lives at <repo>/cli/dist/wai.cjs;
  // the plugins live at <repo>/plugins/whoami/skills.
  const here = new URL('.', import.meta.url).pathname;
  return `${here}../../plugins/whoami/skills`;
}

function defaultReadSkillFile(path: string): string | null {
  try { return require('node:fs').readFileSync(path, 'utf8'); } catch { return null; }
}
```

- [ ] **Step 3: Update existing tests + add coverage**

In `cli/test/harness/claude-code.test.ts`, modify the existing three tests to inject a `readSkillFile` fake that returns canned content. Add two new tests:

```typescript
test('claude-code adapter: passes concatenated skill+template content as system prompt', async () => {
  let appendedPrompt = '';
  const spawn = async (_cmd: string, args: string[], _stdin: string) => {
    const i = args.indexOf('--append-system-prompt');
    appendedPrompt = args[i + 1] ?? '';
    return { stdout: JSON.stringify({ result: '{"questions":[]}' }), stderr: '', code: 0 };
  };
  const a = claudeCodeAdapter({
    spawn,
    skillsDir: '/skills',
    readSkillFile: (p) => p.endsWith('SKILL.md') ? 'SKILL CONTENT' : 'TEMPLATE CONTENT',
  });
  await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {},
    outputSchema: { type: 'object', required: ['questions'] },
  });
  assert.match(appendedPrompt, /SKILL CONTENT/);
  assert.match(appendedPrompt, /TEMPLATE CONTENT/);
});

test('claude-code adapter: returns ok=false when skill file is missing', async () => {
  const a = claudeCodeAdapter({
    spawn: async () => ({ stdout: '', stderr: '', code: 0 }),
    skillsDir: '/skills',
    readSkillFile: () => null, // every read fails
  });
  const res = await a.invoke({
    skill: 'writing-articles', template: 'interview', context: {}, outputSchema: {},
  });
  assert.equal(res.ok, false);
  if (!res.ok) { assert.match(res.error, /skill not found/); assert.equal(res.retryable, false); }
});
```

- [ ] **Step 4: Remove the TODO comment**

The TODO block in `cli/src/harness/claude-code.ts` is now resolved; delete it.

- [ ] **Step 5: Run typecheck + tests**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 6: Commit**

```bash
git add cli/src/harness/claude-code.ts cli/test/harness/claude-code.test.ts
git commit -m "feat(cli): harness adapter loads skill + template content"
```

---

## Task 2: Four remaining prompt templates

Add the prompt-template files for `research-questions`, `outline`, `draft-person`, `draft-episode`. Each is a Markdown file with frontmatter `name`, `description`, and `outputSchema`. The body is the template's instructions to the model.

**Files (all NEW):**
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/research-questions.md`
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/outline.md`
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/draft-person.md`
- Create: `plugins/whoami/skills/writing-articles/prompt-templates/draft-episode.md`

- [ ] **Step 1: Create `research-questions.md`**

Frontmatter:

```yaml
---
name: research-questions
description: Generate web search queries from gaps in the evidence drawer for a person.
outputSchema:
  type: object
  required: [queries]
  properties:
    queries:
      type: array
      items:
        type: object
        required: [text, gap]
        properties:
          text: { type: string }
          gap: { type: string }
---
```

Body:

```markdown
# Research-questions template

You will be given the evidence drawer for one person:

- `derived` — GEDCOM-derived YAML with name, dates, places, parents, spouses, children.
- `talk` — current `<slug>.talk.md` content (research notes, gap threads).
- `narrative` — current `<slug>.narrative.md` content if present.

Your job: generate 5–15 web search queries that could fill gaps in the
record. Good queries:

- Reach for events, places, occupations, communities, migrations,
  political contexts that the GEDCOM hints at but doesn't elaborate.
- Use specific names and dates where possible: "Yad Vashem Eidel
  Ayzman Teofipol 1928 census" beats "Eidel Ayzman".
- Prefer queries that hit the *reliable defaults* the project trusts:
  Yad Vashem, JewishGen, archive.org, official municipal records,
  peer-reviewed history, primary documents.
- Don't repeat queries already discussed in the talk page.
- Each query is paired with a `gap` field — a one-line description of
  what the query is trying to answer. The orchestrator uses this when
  recording the resulting research notes.

Cap at the limit specified in `context.maxQueries` (default 12).

Return JSON matching `outputSchema`.
```

- [ ] **Step 2: Create `outline.md`**

Frontmatter:

```yaml
---
name: outline
description: Plan the article structure (person hub + episode spinoffs) from gathered evidence and research notes.
outputSchema:
  type: object
  required: [person, episodes]
  properties:
    person:
      type: object
      required: [lead, sections]
      properties:
        lead: { type: string }
        sections:
          type: array
          items:
            type: object
            required: [heading, gist]
            properties:
              heading: { type: string }
              gist: { type: string }
    episodes:
      type: array
      items:
        type: object
        required: [slug, title, scope]
        properties:
          slug: { type: string }
          title: { type: string }
          scope: { type: string }
---
```

Body:

```markdown
# Outline template

Given the gathered evidence drawer plus the research notes from Phase
2, produce a drafting plan for the person's article and any episode
pages worth spinning off.

## Person hub

- `lead` — three sentences: identity → relationship to the wiki owner
  → arc. No editorial framing, no statistics in the lead.
- `sections` — heading + one-line gist of what the section covers.
  Common sections: Family, Life, Death, Names, Notes, References.
  Don't invent sections that won't have content.

## Episode spinoffs

Apply the spinoff heuristic: 3+ research notes / voice notes /
narrative paragraphs telling a connected story; OR an event with a
clear arc that needs more than two paragraphs to tell; OR a
wartime/migration/persecution event warranting its own page on
accuracy grounds.

For each episode:

- `slug` — kebab-case, format `<person>-and-<event>` (e.g.
  `aidele-and-the-bazaliya-road`).
- `title` — Title Case, matches the episode-page convention.
- `scope` — one paragraph describing what this episode covers and the
  evidence it draws on. The orchestrator passes this to `draft-episode`.

If no episode spinoffs are warranted, return `episodes: []`.
```

- [ ] **Step 3: Create `draft-person.md`**

Frontmatter:

```yaml
---
name: draft-person
description: Draft the full markdown body of a person page from gathered evidence, research notes, and outline.
outputSchema:
  type: object
  required: [body]
  properties:
    body: { type: string }
    redlinks:
      type: array
      items: { type: string }
---
```

Body:

```markdown
# Draft-person template

Produce the full markdown body for the person page, including
frontmatter (`title`, `owner`, `editors`, `type: person`, `aliases`,
`categories`, `gedcom: { file, record, snapshot }`, `created`).

The wiki's editorial guide applies (loaded as part of this skill —
read it before drafting). Specifically: documentary voice, third
person, past tense, no editorializing, no words from
`editorial-guide/words-to-watch.md`, footnotes for every claim that
isn't GEDCOM-derived, citation directives in the standard shapes
(`::cite-message`, `::cite-vault`, etc.).

Person-page conventions:

- Lead paragraph: identity → relationship to the wiki owner → arc.
  Three sentences max. No statistics in the lead.
- Sections per the outline; mention episode pages with a one-sentence
  summary plus a wikilink (`[[<episode-slug>|<title>]]`).
- `## References` for inline footnotes.
- `## Bibliography` with `::cite-vault{...}` for full vault snapshots.
- `## See also` for related person/episode pages.

`redlinks` — list any wikilinks you used that don't yet have pages
(GEDCOM-derived names of relatives, cited but un-pageified episodes).
The orchestrator records these in the talk page so the user can
backfill.
```

- [ ] **Step 4: Create `draft-episode.md`**

Frontmatter:

```yaml
---
name: draft-episode
description: Draft the full markdown body of an episode page (more narrative latitude than person pages, but still factual and footnoted).
outputSchema:
  type: object
  required: [body]
  properties:
    body: { type: string }
    redlinks:
      type: array
      items: { type: string }
---
```

Body:

```markdown
# Draft-episode template

Produce the full markdown body for an episode page about the scope
described in `context.scope`. Frontmatter: `title`, `type: episode`,
`subject` (slug of the person), `categories`, `created`.

Episode pages have **more narrative latitude than person pages** but
remain third-person and factual. Storytelling comes from sequencing,
detail, and well-chosen quotes — not from adjectives.

Editorial constraints (loaded from `editorial-guide`):

- Three-stream weaving rule: every *claim* (a date, a place, an
  action, a relationship, an attribution) must trace to one of the
  three input streams (relations, narrative, external research).
  Connective and summary prose between cited claims is permitted.
- No inventing details to dress up data ("the cold November wind…").
- No period color the records don't license. Name a regime only when
  the record names it or the regime materially shaped the event.
- No filling silences with plausible guesses — gaps go on the talk
  page as `::open` threads.
- No first-person family voice.

Episode page structure:

- Lead paragraph: when, where, who, what.
- Body sections in chronological or thematic order.
- `## References` and `## Bibliography` per the editorial guide.
- Wikilinks back to the person page and to any related episodes.

`redlinks` — list any wikilinks you used that don't yet have pages.
```

- [ ] **Step 5: Update `SKILL.md` — drop "only interview implemented" caveat**

In `plugins/whoami/skills/writing-articles/SKILL.md`, find the line:

> In Plan 1 only the `interview` template is implemented. Other templates land in Plan 2 alongside `wai author`.

Replace with:

> All five templates are implemented. The harness adapter resolves
> `prompt-templates/<template>.md` automatically when invoked.

- [ ] **Step 6: Commit**

```bash
git add plugins/whoami/skills/writing-articles/
git commit -m "feat(plugin): add four authoring templates to writing-articles skill"
```

(No tests for prompt content — they're scored by the eval suite, not unit tests.)

---

## Task 3: `wai author` skeleton + pre-flight + commit-trailer helper

Build the orchestrator's outer shell: argument parsing, pre-flight checks, the seven-phase loop dispatcher, the commit trailer helper. Phases 1-7 are stubs at this task; they're filled in by Tasks 4-10.

**Files:**
- Create: `cli/src/commands/author.ts`
- Create: `cli/src/commands/author/pipeline-run.ts`
- Create: `cli/test/commands/author.test.ts`
- Modify: `cli/src/index.ts` to wire the subcommand.

- [ ] **Step 1: `pipeline-run.ts` — trailer formatting + parsing**

Create `cli/src/commands/author/pipeline-run.ts`:

```typescript
import { randomUUID } from 'node:crypto';

export interface CommitTrailer {
  pipelineRun: string;
  phase: number;
  slug: string;
  inputs: ReadonlyArray<'derived' | 'talk' | 'narrative' | 'audio' | 'web'>;
  sources?: number;
  fabricationGuard: 'pass' | 'fail';
}

export function newRunId(): string {
  return randomUUID();
}

export function formatTrailer(t: CommitTrailer): string {
  const lines = [
    `pipeline-run: ${t.pipelineRun}`,
    `phase: ${t.phase}`,
    `slug: ${t.slug}`,
    `inputs: ${t.inputs.join(',')}`,
  ];
  if (t.sources !== undefined) lines.push(`sources: ${t.sources}`);
  lines.push(`fabrication-guard: ${t.fabricationGuard}`);
  return lines.join('\n');
}

/** Parse the most-recent pipeline trailer from `git log` text. */
export function parseLatestTrailer(gitLogText: string): CommitTrailer | null {
  const m = gitLogText.match(/^pipeline-run:\s+(\S+)\nphase:\s+(\d+)\nslug:\s+(\S+)\ninputs:\s+(\S+)(?:\nsources:\s+(\d+))?\nfabrication-guard:\s+(pass|fail)/m);
  if (!m) return null;
  return {
    pipelineRun: m[1]!,
    phase: parseInt(m[2]!, 10),
    slug: m[3]!,
    inputs: m[4]!.split(',') as CommitTrailer['inputs'],
    sources: m[5] !== undefined ? parseInt(m[5], 10) : undefined,
    fabricationGuard: m[6] as 'pass' | 'fail',
  };
}

export function findResumePoint(gitLogText: string, slug: string): { runId: string; nextPhase: number } | null {
  const lines = gitLogText.split('\n');
  // Walk newest → oldest looking for the most recent commit for this slug.
  for (let i = 0; i < lines.length - 5; i++) {
    if (!lines[i]?.startsWith('pipeline-run:')) continue;
    const block = lines.slice(i, i + 6).join('\n');
    const t = parseLatestTrailer(block);
    if (t && t.slug === slug) {
      return { runId: t.pipelineRun, nextPhase: t.phase + 1 };
    }
  }
  return null;
}
```

- [ ] **Step 2: Tests for `pipeline-run.ts`**

Create `cli/test/commands/author/pipeline-run.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTrailer, parseLatestTrailer, findResumePoint, newRunId } from '../../../src/commands/author/pipeline-run.js';

test('formatTrailer: emits all fields in the expected order', () => {
  const out = formatTrailer({
    pipelineRun: '7c4a',
    phase: 2,
    slug: 'aidele',
    inputs: ['derived', 'talk', 'web'],
    sources: 12,
    fabricationGuard: 'pass',
  });
  assert.equal(out, 'pipeline-run: 7c4a\nphase: 2\nslug: aidele\ninputs: derived,talk,web\nsources: 12\nfabrication-guard: pass');
});

test('formatTrailer: omits sources when undefined', () => {
  const out = formatTrailer({
    pipelineRun: '7c4a', phase: 1, slug: 'aidele', inputs: ['derived'], fabricationGuard: 'pass',
  });
  assert.match(out, /^pipeline-run: 7c4a\nphase: 1\nslug: aidele\ninputs: derived\nfabrication-guard: pass$/);
});

test('parseLatestTrailer: round-trips a formatted trailer', () => {
  const orig = { pipelineRun: '7c4a', phase: 4, slug: 'aidele', inputs: ['derived','talk','narrative'] as const, sources: 9, fabricationGuard: 'pass' as const };
  const parsed = parseLatestTrailer(formatTrailer(orig));
  assert.deepEqual(parsed, orig);
});

test('findResumePoint: returns the most recent run for the slug', () => {
  const log = [
    'pipeline-run: r2', 'phase: 3', 'slug: aidele', 'inputs: derived,talk', 'sources: 5', 'fabrication-guard: pass',
    '',
    'pipeline-run: r1', 'phase: 7', 'slug: kelman-ayzman', 'inputs: derived,talk', 'fabrication-guard: pass',
  ].join('\n');
  const r = findResumePoint(log, 'aidele');
  assert.deepEqual(r, { runId: 'r2', nextPhase: 4 });
});

test('findResumePoint: returns null when slug has no prior run', () => {
  const log = 'pipeline-run: r1\nphase: 7\nslug: someone\ninputs: derived\nfabrication-guard: pass';
  assert.equal(findResumePoint(log, 'aidele'), null);
});

test('newRunId: produces a valid UUID', () => {
  const id = newRunId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
```

- [ ] **Step 3: `author.ts` skeleton**

Create `cli/src/commands/author.ts`:

```typescript
import { newRunId, findResumePoint, formatTrailer, type CommitTrailer } from './author/pipeline-run.js';
import type { HarnessAdapter } from '../harness/types.js';
import type { ApiClient } from '../api-client.js';
import type { Transcriber } from '../transcriber.js';

export interface AuthorOptions {
  rootDir: string;
  slug: string;
  resume: boolean;
  noWeb: boolean;
  skipEpisodes: boolean;
  dryRun: boolean;
  branch?: string;
  harness: HarnessAdapter;
  client: ApiClient;
  // Phase-injectable fakes for tests:
  gather: (slug: string, deps: PhaseDeps) => Promise<EvidenceDrawer>;
  research?: (drawer: EvidenceDrawer, deps: PhaseDeps) => Promise<PhaseResult>;
  outline?: (drawer: EvidenceDrawer, deps: PhaseDeps) => Promise<PhaseResult & { plan: OutlinePlan }>;
  draftPerson?: (plan: OutlinePlan, drawer: EvidenceDrawer, deps: PhaseDeps) => Promise<PhaseResult>;
  draftEpisodes?: (plan: OutlinePlan, drawer: EvidenceDrawer, deps: PhaseDeps) => Promise<PhaseResult[]>;
  verify?: (deps: PhaseDeps) => Promise<PhaseResult>;
  log?: (deps: PhaseDeps) => Promise<PhaseResult>;
  // Real I/O:
  readFile: (p: string) => string | null;
  writeFile: (p: string, c: string) => void;
  exists: (p: string) => boolean;
  gitLog: (rootDir: string, grep: string) => string;
  gitAdd: (paths: string[]) => void;
  gitCommit: (subject: string, body: string) => void;
  gitHasUncommittedChanges: () => boolean;
  gitIsRepo: () => boolean;
  healthz: () => Promise<boolean>;
  now: () => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export interface PhaseDeps { /* common deps phase functions need: client, transcriber, web fetch, etc. */ }
export interface EvidenceDrawer { /* defined fully in Task 4 */ }
export interface OutlinePlan { /* defined in Task 6 */ }
export interface PhaseResult {
  changedFiles: ReadonlyArray<string>;
  commitSubject: string;
  trailer: Omit<CommitTrailer, 'pipelineRun'>;
  summary: string;
}

export async function runAuthor(opts: AuthorOptions): Promise<number> {
  // Pre-flight
  if (!opts.gitIsRepo()) { opts.writeErr(`author: ${opts.rootDir} is not a git repo\n`); return 8; }
  if (opts.gitHasUncommittedChanges()) { opts.writeErr(`author: ${opts.rootDir} has uncommitted changes\n`); return 7; }
  if (!await opts.healthz()) { opts.writeErr(`author: frontend server not reachable\n`); return 14; }

  // Resume detection
  let runId: string;
  let startPhase: number;
  if (opts.resume) {
    const log = opts.gitLog(opts.rootDir, `slug: ${opts.slug}`);
    const found = findResumePoint(log, opts.slug);
    if (found) {
      runId = found.runId;
      startPhase = found.nextPhase;
      opts.write(`author: resuming run ${runId} at phase ${startPhase}\n`);
    } else {
      runId = newRunId();
      startPhase = 1;
      opts.write(`author: no prior run for ${opts.slug}; starting fresh (run ${runId})\n`);
    }
  } else {
    runId = newRunId();
    startPhase = 1;
  }

  if (opts.dryRun) {
    opts.write(`author --dry-run: would run phases ${startPhase}..7 for ${opts.slug} (run ${runId})\n`);
    return 0;
  }

  // Phase loop scaffold (Task 4-10 fill these in).
  // For Task 3, just print "phase N: <name>" lines and return 0.
  const PHASES = [
    { n: 1, name: 'gather' },
    { n: 2, name: 'research' },
    { n: 3, name: 'outline' },
    { n: 4, name: 'draft (person)' },
    { n: 5, name: 'draft (episodes)' },
    { n: 6, name: 'verify' },
    { n: 7, name: 'log' },
  ];
  for (const p of PHASES) {
    if (p.n < startPhase) continue;
    opts.write(`[${p.n}/7] ${p.name} … (skeleton; Plan 2 tasks 4-10 fill this in)\n`);
  }
  return 0;
}
```

- [ ] **Step 4: Wire in `index.ts`**

Add the subcommand handler. Default the harness via `selectHarness`. Resolve the same `rootDir` pattern used elsewhere. Build the I/O dependencies (git, healthz, etc.) with real `execSync`/`readFileSync`/etc. Add help text:

```
  author <slug>                Generate the article for <slug>
                                 --no-web (skip web research)
                                 --skip-episodes (only the person hub)
                                 --resume (continue from last commit)
                                 --dry-run (print plan; no commits)
                                 --branch <name> (commit on a new branch)
```

- [ ] **Step 5: Skeleton-only test**

Create `cli/test/commands/author.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAuthor } from '../../src/commands/author.js';

function fakeOpts(over: Partial<Parameters<typeof runAuthor>[0]> = {}): Parameters<typeof runAuthor>[0] {
  return {
    rootDir: '/repo', slug: 'aidele', resume: false, noWeb: false, skipEpisodes: false, dryRun: false,
    harness: { invoke: async () => ({ ok: true, result: {} }) },
    client: {} as never,
    gather: async () => ({} as never),
    readFile: () => null, writeFile: () => {}, exists: () => false,
    gitLog: () => '', gitAdd: () => {}, gitCommit: () => {},
    gitHasUncommittedChanges: () => false, gitIsRepo: () => true,
    healthz: async () => true,
    now: () => '2026-05-10',
    write: () => {}, writeErr: () => {},
    ...over,
  };
}

test('author: aborts with 8 when not a git repo', async () => {
  let err = '';
  const code = await runAuthor(fakeOpts({ gitIsRepo: () => false, writeErr: (s) => { err += s; } }));
  assert.equal(code, 8);
  assert.match(err, /not a git repo/);
});

test('author: aborts with 7 when uncommitted changes', async () => {
  const code = await runAuthor(fakeOpts({ gitHasUncommittedChanges: () => true }));
  assert.equal(code, 7);
});

test('author: aborts with 14 when healthz fails', async () => {
  const code = await runAuthor(fakeOpts({ healthz: async () => false }));
  assert.equal(code, 14);
});

test('author --dry-run: prints plan; returns 0', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ dryRun: true, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /would run phases 1\.\.7/);
});

test('author --resume: cold start when no prior run', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => '', write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /starting fresh/);
});

test('author --resume: picks up at next phase', async () => {
  const log = 'pipeline-run: r1\nphase: 3\nslug: aidele\ninputs: derived,talk\nfabrication-guard: pass';
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => log, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /resuming run r1 at phase 4/);
});
```

- [ ] **Step 6: Run typecheck + tests**

```
cd cli && npm run typecheck && npm test
```

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/author.ts cli/src/commands/author/pipeline-run.ts cli/src/index.ts cli/test/commands/author.test.ts cli/test/commands/author/pipeline-run.test.ts
git commit -m "feat(cli): wai author skeleton + pre-flight + commit trailers"
```

---

## Task 4: Phase 1 — gather

Pure function that reads the four local input streams (derived YAML, talk page, narrative file, transcript notes) into a typed `EvidenceDrawer`.

**Files:**
- Create: `cli/src/commands/author/gather.ts`
- Create: `cli/test/commands/author/gather.test.ts`

- [ ] **Step 1: Define `EvidenceDrawer` and the gather function**

Create `cli/src/commands/author/gather.ts`:

```typescript
export interface EvidenceDrawer {
  slug: string;
  derived: { record: string; raw: string } | null;
  talkBody: string | null;
  researchNotes: ReadonlyArray<{ id: string; date: string; text: string; kind: string }>;
  narrativeBody: string | null;
  transcripts: ReadonlyArray<{ id: string; audioFile: string; lang: string; text: string }>;
  inputs: ReadonlyArray<'derived' | 'talk' | 'narrative' | 'audio'>;
}

export interface GatherDeps {
  rootDir: string;
  readFile: (p: string) => string | null;
  /** Returns the page metadata + body, or null if missing. */
  readPage: (slug: string) => Promise<{ frontmatter: Record<string, unknown>; body: string } | null>;
  /** Returns the talk-page body + parsed research notes. */
  readTalk: (slug: string) => Promise<{ body: string; notes: ReadonlyArray<{ id: string; date: string; text: string; kind: string }> } | null>;
}

export async function gather(slug: string, deps: GatherDeps): Promise<EvidenceDrawer> {
  const inputs: EvidenceDrawer['inputs'] = [];
  let derived: EvidenceDrawer['derived'] = null;
  let talkBody: string | null = null;
  let researchNotes: EvidenceDrawer['researchNotes'] = [];
  let narrativeBody: string | null = null;
  let transcripts: EvidenceDrawer['transcripts'] = [];

  // Derived YAML — resolve via the page's frontmatter `gedcom.record` field.
  const page = await deps.readPage(slug).catch(() => null);
  if (page) {
    const rec = (page.frontmatter as { gedcom?: { record?: string } }).gedcom?.record;
    if (rec) {
      const ymlPath = `${deps.rootDir}/genealogy/derived/${rec}.yml`;
      const raw = deps.readFile(ymlPath);
      if (raw !== null) {
        derived = { record: rec, raw };
        inputs.push('derived');
      }
    }
  }

  const talk = await deps.readTalk(slug).catch(() => null);
  if (talk) {
    talkBody = talk.body;
    researchNotes = talk.notes.filter(n => n.kind !== 'transcript'); // transcripts split out
    transcripts = talk.notes
      .filter(n => n.kind === 'transcript')
      .map(n => parseTranscriptNote(n));
    if (talk.notes.length > 0) inputs.push('talk');
    if (transcripts.length > 0) inputs.push('audio');
  }

  const narr = deps.readFile(`${deps.rootDir}/pages/${slug}.narrative.md`);
  if (narr !== null) {
    narrativeBody = narr;
    inputs.push('narrative');
  }

  return { slug, derived, talkBody, researchNotes, narrativeBody, transcripts, inputs };
}

function parseTranscriptNote(n: { id: string; date: string; text: string; kind: string }): { id: string; audioFile: string; lang: string; text: string } {
  // Notes from `wai transcribe` follow the format:
  //   "Transcript of `<filename>` ..., lang=<iso>:\n\n<body>"
  const m = n.text.match(/^Transcript of `([^`]+)`.*?lang=(\w+):\n\n([\s\S]*)$/);
  if (!m) return { id: n.id, audioFile: '?', lang: '?', text: n.text };
  return { id: n.id, audioFile: m[1]!, lang: m[2]!, text: m[3]!.trim() };
}
```

- [ ] **Step 2: Tests**

Create `cli/test/commands/author/gather.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gather } from '../../../src/commands/author/gather.js';

const baseDeps = {
  rootDir: '/repo',
  readFile: (_p: string) => null,
  readPage: async () => null,
  readTalk: async () => null,
};

test('gather: empty drawer when nothing exists', async () => {
  const d = await gather('aidele', baseDeps);
  assert.deepEqual(d.inputs, []);
  assert.equal(d.derived, null);
  assert.equal(d.talkBody, null);
  assert.equal(d.narrativeBody, null);
  assert.deepEqual(d.researchNotes, []);
  assert.deepEqual(d.transcripts, []);
});

test('gather: pulls derived YAML via page frontmatter gedcom.record', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readPage: async () => ({ frontmatter: { gedcom: { record: 'I123' } }, body: '' }),
    readFile: (p) => p === '/repo/genealogy/derived/I123.yml' ? 'name: Aidele\n' : null,
  });
  assert.equal(d.derived?.record, 'I123');
  assert.match(d.derived!.raw, /name: Aidele/);
  assert.deepEqual(d.inputs, ['derived']);
});

test('gather: separates transcript notes from research notes', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readTalk: async () => ({
      body: '',
      notes: [
        { id: 'n1', date: '2026-05-01', text: 'Yad Vashem confirms birthplace.', kind: 'research' },
        { id: 'n2', date: '2026-05-02', text: 'Transcript of `voice.m4a` (speaker: Steven), lang=en:\n\nbody text', kind: 'transcript' },
      ],
    }),
  });
  assert.equal(d.researchNotes.length, 1);
  assert.equal(d.transcripts.length, 1);
  assert.equal(d.transcripts[0]!.audioFile, 'voice.m4a');
  assert.equal(d.transcripts[0]!.lang, 'en');
  assert.equal(d.transcripts[0]!.text, 'body text');
  assert.deepEqual(d.inputs, ['talk', 'audio']);
});

test('gather: picks up narrative file', async () => {
  const d = await gather('aidele', {
    ...baseDeps,
    readFile: (p) => p === '/repo/pages/aidele.narrative.md' ? 'body of narrative' : null,
  });
  assert.equal(d.narrativeBody, 'body of narrative');
  assert.deepEqual(d.inputs, ['narrative']);
});
```

- [ ] **Step 3: Wire `gather` into the orchestrator**

In `cli/src/commands/author.ts`, replace the skeleton phase loop's gather slot with a call to `gather()`. The orchestrator's `opts.gather` is now optional (defaulted to the real implementation when not injected by tests).

- [ ] **Step 4: Run typecheck + tests**

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/author/gather.ts cli/src/commands/author.ts cli/test/commands/author/gather.test.ts
git commit -m "feat(cli): wai author phase 1 — gather evidence drawer"
```

---

## Task 5: Phase 2 — research (web search + footnotes)

Call the harness with `research-questions`, run each query via `WebSearch`/`WebFetch`, validate sources against the reliability heuristic, append surviving claims as `kind=research` notes, commit.

**Files:**
- Create: `cli/src/commands/author/research.ts`
- Create: `cli/test/commands/author/research.test.ts`

- [ ] **Step 1: Failing tests**

The research phase has many moving parts. Test in isolation:

- Harness returns N queries → for each, the phase calls `runQuery(query)`.
- Query results are filtered by `isReliableSource(url)` → only URLs from the allowlist (Yad Vashem, JewishGen, archive.org, official municipal records, peer-reviewed history) survive.
- For each surviving claim, the phase produces a research-note string with the URL trailer.
- Notes are appended via `client.note(slug, text, { kind: 'research' })`.
- Phase returns `PhaseResult` with `inputs: [...evidenceDrawer.inputs, 'web']`, `sources: <count>`, `commitSubject: research(<slug>): N sources, M candidate claims drafted`.

Write the tests with a fake harness, fake `runQuery`, fake `appendNote`. Verify:
1. Happy path: 5 queries, 3 yield reliable claims, 7 unreliable dropped → 3 notes appended, summary matches.
2. Zero usable sources for unknown person, no local evidence → return PhaseResult with `sources: 0` plus a flag telling the orchestrator to exit 4.
3. Some results contradictory → both kept as notes; phase doesn't exit early.

(Full test code in step 3 of the implementation.)

- [ ] **Step 2: Implement `cli/src/commands/author/research.ts`**

```typescript
import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';
import type { ApiClient } from '../../api-client.js';

const RELIABLE_HOSTS = [
  'yadvashem.org', 'collections.yadvashem.org',
  'jewishgen.org',
  'archive.org', 'web.archive.org',
  'familysearch.org', 'ancestry.com', // primary records
  '.edu', '.gov', '.gov.', // any government / academic domain
];

export interface ResearchDeps {
  harness: HarnessAdapter;
  webSearch: (query: string) => Promise<ReadonlyArray<{ title: string; url: string; snippet: string }>>;
  webFetch: (url: string) => Promise<string | null>;
  client: ApiClient;
  isReliableSource?: (url: string) => boolean;
}

export interface ResearchResult {
  candidateClaims: ReadonlyArray<{ text: string; url: string; gap: string }>;
  unreliableDropped: number;
  sourcesQueried: number;
  refuseToFabricate: boolean;
}

export async function research(drawer: EvidenceDrawer, maxQueries: number, deps: ResearchDeps): Promise<ResearchResult> {
  const isReliable = deps.isReliableSource ?? defaultIsReliable;
  const harnessRes = await deps.harness.invoke<unknown, { queries: { text: string; gap: string }[] }>({
    skill: 'writing-articles',
    template: 'research-questions',
    context: { slug: drawer.slug, drawer, maxQueries },
    outputSchema: { type: 'object', required: ['queries'] },
  });
  if (!harnessRes.ok) throw new Error(`research: harness failed — ${harnessRes.error}`);
  const queries = harnessRes.result.queries.slice(0, maxQueries);

  const candidates: { text: string; url: string; gap: string }[] = [];
  let dropped = 0;
  for (const q of queries) {
    const results = await deps.webSearch(q.text);
    for (const r of results) {
      if (!isReliable(r.url)) { dropped++; continue; }
      const fetched = await deps.webFetch(r.url);
      if (!fetched) { dropped++; continue; }
      const claim = q.gap; // for v1, the claim text is the gap description; agent-side claim extraction lands later
      candidates.push({ text: claim, url: r.url, gap: q.gap });
    }
  }

  const refuseToFabricate = candidates.length === 0
    && drawer.derived === null
    && drawer.researchNotes.length === 0
    && drawer.narrativeBody === null
    && drawer.transcripts.length === 0;

  return { candidateClaims: candidates, unreliableDropped: dropped, sourcesQueried: queries.length, refuseToFabricate };
}

function defaultIsReliable(url: string): boolean {
  try {
    const u = new URL(url);
    return RELIABLE_HOSTS.some(h => u.hostname.endsWith(h.replace(/^\./, '')) || u.hostname.includes(h));
  } catch { return false; }
}

export function formatResearchNote(claim: { text: string; url: string; gap: string }, accessedAt: string): string {
  return `${claim.text}\n\nGap: ${claim.gap}\n\nSource: ${claim.url} (accessed ${accessedAt})`;
}
```

- [ ] **Step 3: Tests**

Create `cli/test/commands/author/research.test.ts` with the three test cases above. Use fake `webSearch` / `webFetch` returning canned results, fake harness returning a fixed query list, fake API client capturing `note` calls.

- [ ] **Step 4: Wire into the orchestrator**

In `author.ts`, the Phase 2 dispatch invokes `research()`, then loops `result.candidateClaims` and calls `client.note(slug, formatResearchNote(claim, now()), { kind: 'research' })` per surviving claim. If `result.refuseToFabricate` is true, write to writeErr and return exit 4. Else format the commit subject as `research(<slug>): <sourcesQueried> sources, <candidateClaims.length> candidate claims drafted` and call `gitCommit`.

- [ ] **Step 5: Run typecheck + tests**

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/author/research.ts cli/src/commands/author.ts cli/test/commands/author/research.test.ts
git commit -m "feat(cli): wai author phase 2 — web research with footnote discipline"
```

---

## Task 6: Phase 3 — outline

Call the harness with `outline`, append the drafting plan to the talk page under `## Drafting plan`, commit.

**Files:**
- Create: `cli/src/commands/author/outline.ts`
- Create: `cli/test/commands/author/outline.test.ts`

- [ ] **Step 1: `OutlinePlan` type + outline function**

```typescript
import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';

export interface OutlinePlan {
  person: { lead: string; sections: ReadonlyArray<{ heading: string; gist: string }> };
  episodes: ReadonlyArray<{ slug: string; title: string; scope: string }>;
}

export async function outline(drawer: EvidenceDrawer, harness: HarnessAdapter): Promise<OutlinePlan> {
  const res = await harness.invoke<unknown, OutlinePlan>({
    skill: 'writing-articles',
    template: 'outline',
    context: { slug: drawer.slug, drawer },
    outputSchema: {
      type: 'object',
      required: ['person', 'episodes'],
      properties: {
        person: { type: 'object', required: ['lead', 'sections'] },
        episodes: { type: 'array' },
      },
    },
  });
  if (!res.ok) throw new Error(`outline: harness failed — ${res.error}`);
  return res.result;
}

export function formatOutlineForTalk(plan: OutlinePlan): string {
  const lines: string[] = [];
  lines.push('## Drafting plan');
  lines.push('');
  lines.push('**Person hub**');
  lines.push('');
  lines.push(`Lead: ${plan.person.lead}`);
  lines.push('');
  lines.push('Sections:');
  for (const s of plan.person.sections) lines.push(`- ${s.heading}: ${s.gist}`);
  lines.push('');
  if (plan.episodes.length > 0) {
    lines.push('**Episode spinoffs**');
    lines.push('');
    for (const e of plan.episodes) lines.push(`- [[${e.slug}|${e.title}]]: ${e.scope}`);
  } else {
    lines.push('**Episode spinoffs**: none');
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Tests** with fake harness; verify the talk-page text format.

- [ ] **Step 3: Wire into orchestrator** — Phase 3 calls `outline()` then `formatOutlineForTalk()` then writes the result via `wai write <slug>.talk` (extending the existing talk content). Commit subject: `outline(<slug>): person + N episode(s)`.

- [ ] **Step 4: Run typecheck + tests**

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/author/outline.ts cli/src/commands/author.ts cli/test/commands/author/outline.test.ts
git commit -m "feat(cli): wai author phase 3 — outline drafting plan"
```

---

## Task 7: Phase 4 — draft person

Call harness with `draft-person`, write `pages/<slug>.md`, commit.

**Files:**
- Create: `cli/src/commands/author/draft-person.ts`
- Create: `cli/test/commands/author/draft-person.test.ts`

- [ ] **Step 1: Function**

```typescript
import type { EvidenceDrawer } from './gather.js';
import type { OutlinePlan } from './outline.js';
import type { HarnessAdapter } from '../../harness/types.js';

export async function draftPerson(plan: OutlinePlan, drawer: EvidenceDrawer, harness: HarnessAdapter): Promise<{ body: string; redlinks: ReadonlyArray<string> }> {
  const res = await harness.invoke<unknown, { body: string; redlinks?: string[] }>({
    skill: 'writing-articles',
    template: 'draft-person',
    context: { slug: drawer.slug, plan, drawer },
    outputSchema: {
      type: 'object',
      required: ['body'],
      properties: { body: { type: 'string' }, redlinks: { type: 'array' } },
    },
  });
  if (!res.ok) throw new Error(`draft-person: harness failed — ${res.error}`);
  return { body: res.result.body, redlinks: res.result.redlinks ?? [] };
}
```

- [ ] **Step 2: Test** with a fake harness; assert that the function passes `plan` and `drawer` into the harness context and returns the parsed body + redlinks.

- [ ] **Step 3: Wire into orchestrator** — Phase 4 calls `draftPerson()` then `client.create(slug, body, { summary: 'pipeline draft' })` (or `client.write` if the page exists from a prior run). Records the redlinks list in the run journal. Commit subject: `draft(<slug>): person page`.

- [ ] **Step 4: Run typecheck + tests + Commit**

```bash
git add cli/src/commands/author/draft-person.ts cli/src/commands/author.ts cli/test/commands/author/draft-person.test.ts
git commit -m "feat(cli): wai author phase 4 — draft person page"
```

---

## Task 8: Phase 5 — draft episodes

Same shape as Phase 4 but iterates `plan.episodes`. Each episode is its own commit.

**Files:**
- Create: `cli/src/commands/author/draft-episode.ts`
- Create: `cli/test/commands/author/draft-episode.test.ts`

- [ ] **Step 1: Function**

```typescript
export async function draftEpisode(episode: OutlinePlan['episodes'][number], drawer: EvidenceDrawer, plan: OutlinePlan, harness: HarnessAdapter): Promise<{ body: string; redlinks: ReadonlyArray<string> }> {
  const res = await harness.invoke<unknown, { body: string; redlinks?: string[] }>({
    skill: 'writing-articles',
    template: 'draft-episode',
    context: { episode, drawer, plan },
    outputSchema: {
      type: 'object',
      required: ['body'],
      properties: { body: { type: 'string' }, redlinks: { type: 'array' } },
    },
  });
  if (!res.ok) throw new Error(`draft-episode: harness failed for ${episode.slug} — ${res.error}`);
  return { body: res.result.body, redlinks: res.result.redlinks ?? [] };
}
```

- [ ] **Step 2: Tests** with fake harness; assert one harness call per episode.

- [ ] **Step 3: Wire into orchestrator** — Phase 5 loops `plan.episodes`. Per episode: `draftEpisode()` → `client.create(episode.slug, body, ...)` → commit `draft(<episode-slug>): episode page`. Skip phase entirely if `--skip-episodes` was passed.

- [ ] **Step 4: Run typecheck + tests + Commit**

```bash
git add cli/src/commands/author/draft-episode.ts cli/src/commands/author.ts cli/test/commands/author/draft-episode.test.ts
git commit -m "feat(cli): wai author phase 5 — draft episode pages"
```

---

## Task 9: `wai check --include consistency` extension

Adds the fifth detector category. Detectors live in `core/src/checks/` per existing convention. The detector parses all pages once, builds a fact map, and emits findings for the six finding types in the spec.

**Files:**
- Modify: `core/src/checks/types.ts` — add `'consistency'` to `FindingCategory`.
- Create: `core/src/checks/consistency-drift.ts` — the detector.
- Create: `core/test/checks/consistency-drift.test.ts` — tests.
- Modify: `cli/src/commands/check.ts` — wire the detector when `consistency` is included.
- Modify: `cli/src/index.ts` — add `--include consistency` flag parsing.

- [ ] **Step 1: Add `'consistency'` to `FindingCategory`**

In `core/src/checks/types.ts`, extend the union:

```typescript
export type FindingCategory = 'format' | 'data' | 'schema' | 'coverage' | 'consistency';
```

- [ ] **Step 2: Implement the detector**

Create `core/src/checks/consistency-drift.ts`. The function takes the existing `RepoState` and emits findings:

```typescript
import type { Detector, Finding, RepoState } from './types.js';

export const detectConsistencyDrift: Detector = (state) => {
  const findings: Finding[] = [];

  // Build fact map: subject + attribute → [(value, source, sourceFile, line)]
  const factMap = buildFactMap(state);

  // Self-contradictions within a page (e.g., lead says 1881, infobox says 1887, no corrections entry).
  for (const page of state.pages) {
    findings.push(...detectSelfContradictions(page, state));
  }

  // Cross-page contradictions.
  findings.push(...detectCrossPageContradictions(factMap));

  // Footnote integrity (orphaned footnotes, references referenced but not defined).
  for (const page of state.pages) {
    findings.push(...detectFootnoteOrphans(page));
  }

  // Bibliography ↔ inline citation pairing.
  for (const page of state.pages) {
    findings.push(...detectBibliographyMismatch(page));
  }

  // GEDCOM ↔ page mismatch (page says one date, derived/yml says another, no corrections entry).
  for (const page of state.pages) {
    findings.push(...detectGedcomMismatch(page, state));
  }

  return findings;
};

// Helper functions follow — each one ~15-30 lines, focused on one finding type.
function buildFactMap(state: RepoState): Map<string, ...> { /* … */ }
function detectSelfContradictions(page: ..., state: RepoState): Finding[] { /* … */ }
function detectCrossPageContradictions(factMap: ...): Finding[] { /* … */ }
function detectFootnoteOrphans(page: ...): Finding[] { /* … */ }
function detectBibliographyMismatch(page: ...): Finding[] { /* … */ }
function detectGedcomMismatch(page: ..., state: RepoState): Finding[] { /* … */ }
```

For each helper, the test file should contain a fixture state that exercises the finding's positive and negative cases. Don't try to write all six in one go — start with `detectFootnoteOrphans` (simplest, fully local to a page), commit it, then add the others one at a time.

- [ ] **Step 3: Tests**

Create `core/test/checks/consistency-drift.test.ts` covering each finding type with a small fixture state (a `RepoState` constructed in-memory with 2-3 pages and a stub GEDCOM).

For each finding type:
- One test that triggers the finding.
- One test that doesn't trigger it.
- One test that demonstrates the `corrections:` entry suppresses the finding (where applicable).

- [ ] **Step 4: Wire into `wai check`**

In `cli/src/index.ts`, the existing `wai check` subcommand reads `--only` and `--include` flags. Extend to recognize `consistency`. When the resolved category set includes consistency, add `detectConsistencyDrift` to the detectors array.

In `cli/src/commands/check.ts`, ensure the consistency category is rejected by the `--fix` flag (consistency findings are never auto-fixed):

```typescript
if (opts.fix && opts.only?.includes('consistency')) {
  opts.writeErr(`check --fix --only consistency: consistency findings are never auto-fixed; drop --fix or change --only\n`);
  return 2;
}
```

- [ ] **Step 5: Update help text** for `wai check`:

```
  check                        Run drift detectors against the data repo
                                 --only <c1,c2,...>   limit to listed categories
                                 --include <c1,...>   add categories to defaults
                                 --fix                auto-fix format/schema findings
                                 Categories: format, data, schema, coverage, consistency
                                 Default set: format, data, schema, coverage (NOT consistency)
```

- [ ] **Step 6: Run typecheck + all tests + Commit**

```bash
git add core/src/checks/types.ts core/src/checks/consistency-drift.ts core/test/checks/consistency-drift.test.ts cli/src/commands/check.ts cli/src/index.ts
git commit -m "feat(check): consistency category for wai check"
```

---

## Task 10: Phase 6 verify + Phase 7 log

Phase 6 runs `wai check --fix --only format,schema` then `wai check --only consistency`. Auto-fix format/schema; on consistency findings, exit 5 (the user resolves manually and resumes). Phase 7 writes the agent-log entry to the talk page.

**Files:**
- Create: `cli/src/commands/author/verify.ts`
- Create: `cli/src/commands/author/log.ts`
- Create: `cli/test/commands/author/verify.test.ts`
- Create: `cli/test/commands/author/log.test.ts`

- [ ] **Step 1: Phase 6 implementation**

```typescript
export interface VerifyDeps {
  rootDir: string;
  runCheck: (args: { only: string[]; fix?: boolean }) => Promise<{ exitCode: number; findings: Finding[]; fixed: number }>;
}

export interface VerifyResult {
  formatFixes: number;
  schemaFixes: number;
  consistencyFindings: number;
  filesTouched: ReadonlyArray<string>;
  blocked: boolean; // true → orchestrator exits 5
}

export async function verify(deps: VerifyDeps): Promise<VerifyResult> {
  // Format + schema: auto-fix.
  const formatRes = await deps.runCheck({ only: ['format', 'schema'], fix: true });
  // Consistency: read-only audit.
  const consistencyRes = await deps.runCheck({ only: ['consistency'] });
  return {
    formatFixes: formatRes.fixed,
    schemaFixes: 0, // split between format/schema if needed
    consistencyFindings: consistencyRes.findings.length,
    filesTouched: [], // collect from formatRes.findings.fix.file values
    blocked: consistencyRes.findings.length > 0,
  };
}
```

- [ ] **Step 2: Phase 7 implementation**

```typescript
export function formatAgentLog(slug: string, runId: string, summary: { phases: number; episodes: number; sources: number }, now: string): string {
  return [
    '## Agent log',
    '',
    `### ${now} — pipeline run ${runId}`,
    `- Phases completed: ${summary.phases}/7`,
    `- Episodes drafted: ${summary.episodes}`,
    `- Sources cited: ${summary.sources}`,
    '',
  ].join('\n');
}
```

- [ ] **Step 3: Tests**

Phase 6: fake `runCheck` that returns canned format and consistency results; assert the result shape and that `blocked` flips correctly.
Phase 7: snapshot the agent-log markdown.

- [ ] **Step 4: Wire into orchestrator**

In `author.ts`, after Phase 5: call `verify(...)`. If `result.blocked`, write findings to writeErr and return exit 5. Otherwise commit `verify(<slug>): N format, M consistency`.
Phase 7: append `formatAgentLog(...)` to the talk page; commit `log(<slug>): pipeline complete (run <runId>)`.

- [ ] **Step 5: Run typecheck + tests + Commit**

```bash
git add cli/src/commands/author/verify.ts cli/src/commands/author/log.ts cli/src/commands/author.ts cli/test/commands/author/verify.test.ts cli/test/commands/author/log.test.ts
git commit -m "feat(cli): wai author phases 6-7 — verify + log"
```

---

## Task 11: `--resume` integration test

`--resume` was scaffolded in Task 3 (cold-start + next-phase logic in `pipeline-run.ts`). This task adds an integration test that exercises a full resume cycle: run partial pipeline, kill mid-run, resume, verify pickup.

**Files:**
- Modify: `cli/test/commands/author.test.ts` — add a resume integration test.

- [ ] **Step 1: Test**

```typescript
test('author --resume: skips phases already committed', async () => {
  const log = [
    'pipeline-run: r1', 'phase: 4', 'slug: aidele', 'inputs: derived,talk', 'sources: 9', 'fabrication-guard: pass',
  ].join('\n');
  const phaseCalls: number[] = [];
  let out = '';
  const code = await runAuthor(fakeOpts({
    resume: true,
    gitLog: () => log,
    write: (s) => { out += s; },
    // Inject test phases that record their invocation:
    gather: async (_s) => { phaseCalls.push(1); return {} as never; },
    research: async () => { phaseCalls.push(2); return mockPhaseResult(); },
    outline: async () => { phaseCalls.push(3); return { ...mockPhaseResult(), plan: emptyPlan() }; },
    draftPerson: async () => { phaseCalls.push(4); return mockPhaseResult(); },
    draftEpisodes: async () => { phaseCalls.push(5); return []; },
    verify: async () => { phaseCalls.push(6); return mockPhaseResult(); },
    log: async () => { phaseCalls.push(7); return mockPhaseResult(); },
  }));
  // Started at phase 4+1=5, so phases 5,6,7 ran. Phases 1-4 were skipped.
  assert.deepEqual(phaseCalls, [5, 6, 7]);
});
```

(Add `mockPhaseResult` and `emptyPlan` helpers as needed.)

- [ ] **Step 2: Run + Commit**

```bash
git add cli/test/commands/author.test.ts
git commit -m "test(cli): wai author --resume integration test"
```

---

## Task 12: Renderer + search filters for `*.narrative.md`

One-line additions in `core/` and `frontend/`.

**Files:**
- Modify: `core/src/search/` — exclude `*.narrative.md` from the index.
- Modify: `frontend/lib/` — exclude `*.narrative.md` from page routing.

- [ ] **Step 1: `core/` filter**

Find the function that decides whether a markdown file is indexable (likely in `core/src/search/index.ts` or `core/src/pages/list.ts`). Look for the existing `*.talk.md` exclusion. Add the same exclusion for `*.narrative.md`. Add a one-liner to a relevant existing test.

- [ ] **Step 2: `frontend/` filter**

Find the page-routing list (likely in `frontend/lib/pages.ts` or `frontend/lib/list.ts`). Look for the existing talk-page exclusion. Add `*.narrative.md` to the same filter.

- [ ] **Step 3: Run all tests across packages**

```
cd core && npm test
cd frontend && npm test
```

- [ ] **Step 4: Commit**

```bash
git add core/src/search/* frontend/lib/* core/test/* frontend/test/*
git commit -m "feat(core,frontend): exclude *.narrative.md from search and routing"
```

(Adjust commit scope based on what files actually changed.)

---

## Task 13: CHANGELOG + plan-index entries

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: CHANGELOG entries**

Under the existing `## [Unreleased]` `### Added` section, prepend:

```markdown
- **`wai author <slug>`** *(2026-05-XX)*. Single-slug article-authoring
  pipeline. Reads the evidence drawer, runs harness-driven research /
  outline / draft phases, runs `wai check --include consistency` to
  verify, commits per phase to the data repo with structured trailers.
  `--resume` continues from the last completed phase. `--no-web`,
  `--skip-episodes`, `--dry-run`, `--branch` flags supported. Refuses
  to fabricate when no usable evidence exists (exit 4).
- **`wai check --include consistency`** *(2026-05-XX)*. Fifth detector
  category: self-contradictions, cross-page contradictions,
  footnote↔claim mismatches, GEDCOM↔page mismatches,
  bibliography↔inline mismatches, orphaned footnotes. Read-only;
  `--fix` is rejected for this category.
- **Renderer + search filter** *(2026-05-XX)*: `pages/<slug>.narrative.md`
  is excluded from page routing and the search index. The narrative
  file is an authoring input only; it never appears at a URL.
- **Four prompt templates** added to `writing-articles`:
  `research-questions`, `outline`, `draft-person`, `draft-episode`.
  Together with the `interview` template from Plan 1, all five
  templates referenced by the harness contract are now implemented.
- **Harness adapter** *(update)*: now reads `SKILL.md` +
  `prompt-templates/<template>.md` from disk and concatenates them as
  the appended system prompt. Resolves the Plan 1 limitation noted as
  TODO.
```

- [ ] **Step 2: Plan-index row**

```markdown
| 🚧 | [`2026-05-10-article-pipeline-plan-2-author-core.md`](./2026-05-10-article-pipeline-plan-2-author-core.md) | Article pipeline — Plan 2: Authoring core | `wai author <slug>` orchestrator (gather, research, outline, draft, verify, log). `wai check --include consistency`. Renderer/search filters for narrative files. Sequenced after Plan 1; before Plan 3. |
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index entries for article pipeline plan 2"
```

---

## Done with Plan 2

After Task 13 the user can run `wai author <slug>` against any individual on the family tree and get an article + episode pages out the other side, with the full paper trail in `$WHOAMI_ROOT`'s git history and consistency findings surfaced via `wai check`. Plan 3 (final) adds the cohort batch mode plus the `wai revert` and `wai history` ergonomic commands.
