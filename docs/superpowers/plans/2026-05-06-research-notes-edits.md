# Research Notes — Edits, Authorship, Soft-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable per-note identity, authorship (human vs. agent), edit support with last-edit timestamps, and a wiki-style soft-delete to the existing research-notes feature on talk pages.

**Architecture:** A trailing HTML comment on each `## Research notes` bullet carries the metadata (`id`, `by`, `kind`, `at`, optional `editedAt`/`editedBy` and `deletedAt`/`deletedBy`). Markdown stays the source of truth for prose; git is the deep revision store. The core module gets four new pure functions (`parseResearchNotes`, `editResearchNote`, `softDeleteResearchNote`, `restoreResearchNote`); `appendResearchNote` is extended to write the trailer. New server endpoints (`PATCH`/`DELETE` on `/api/notes/[slug]/[id]`, `POST` on `/api/notes/[slug]/[id]/restore`) and matching CLI flags wrap the core. The UI panel switches from a freeform markdown render of the section to a structured per-note view with edit/delete/restore affordances.

**Tech Stack:** TypeScript, Node `tsx --test`, Next.js 16 App Router, Zod (request validation), React Server Components.

**Spec:** `docs/superpowers/specs/2026-05-06-research-notes-edits-design.md`.

---

## File structure

| File                                                              | Status   | Responsibility                                        |
| ----------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| `core/src/pages/research-notes.ts`                                | Modify   | Pure parse/append/edit/soft-delete/restore + types/errors |
| `core/src/pages/index.ts`                                         | Modify   | Re-export new types and errors                        |
| `core/test/pages/research-notes.test.ts`                          | Modify   | Extend tests for trailer, parse, edit, delete, restore |
| `frontend/lib/server-services.ts`                                 | Modify   | id generator, edit/soft-delete/restore on disk, `buildNotesView` |
| `frontend/lib/api-errors.ts`                                      | Modify   | Map new core errors to status codes                   |
| `frontend/app/api/notes/[slug]/route.ts`                          | Modify   | POST accepts `by`/`kind`, returns id                  |
| `frontend/app/api/notes/[slug]/[id]/route.ts`                     | Create   | PATCH (edit), DELETE (soft-delete)                    |
| `frontend/app/api/notes/[slug]/[id]/restore/route.ts`             | Create   | POST (restore)                                        |
| `frontend/components/research-notes/panel.tsx`                    | Modify   | Render structured `NoteView[]`                        |
| `frontend/components/research-notes/note-item.tsx`                | Create   | One bullet's prose + byline + actions                 |
| `frontend/components/research-notes/edit-note-form.tsx`           | Create   | Inline textarea editor                                |
| `frontend/components/research-notes/add-note-form.tsx`            | Modify   | "Your name" field + localStorage                      |
| `frontend/components/research-notes/relative-time.ts`             | Create   | Tiny "2h ago" formatter helper                        |
| `frontend/app/[slug]/page.tsx`                                    | Modify   | Pass `NoteView[]` to panel                            |
| `frontend/app/family/tree/page.tsx`                               | Modify   | Pass `NoteView[]` to panel                            |
| `cli/src/api-client.ts`                                           | Modify   | `note` returns id; new `editNote`/`deleteNote`/`restoreNote`/`listNotes` |
| `cli/src/commands/note.ts`                                        | Modify   | `--edit`/`--delete`/`--restore`/`--list`/`--as-agent` modes |
| `cli/src/index.ts`                                                | Modify   | Dispatch + help text                                  |
| `cli/test/note.test.ts`                                           | Modify   | Tests for new flag combos                             |
| `plugins/whoami/agents/editor.md`                                 | Modify   | Paragraph about trailer + retraction                  |

---

## Phase 1 · Core (pure functions, TDD)

### Task 1: Types, errors, and `parseResearchNotes`

**Files:**
- Modify: `core/src/pages/research-notes.ts`
- Test:   `core/test/pages/research-notes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `core/test/pages/research-notes.test.ts`:

```ts
import {
  parseResearchNotes,
  type Note,
  NoteNotFoundError,
  NoteDeletedError,
  NoteAlreadyDeletedError,
} from '../../src/pages/research-notes.ts';

test('parseResearchNotes: empty body → empty array', () => {
  assert.deepEqual(parseResearchNotes(''), []);
  assert.deepEqual(parseResearchNotes('# Talk\n\n## Open\n\n- q\n'), []);
});

test('parseResearchNotes: legacy bullet (no trailer) is read-only', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- aunt sally said x\n';
  const notes = parseResearchNotes(body);
  assert.equal(notes.length, 1);
  const n = notes[0]!;
  assert.equal(n.text, 'aunt sally said x');
  assert.equal(n.date, '2026-05-04');
  assert.equal(n.by, '(unknown)');
  assert.equal(n.kind, 'human');
  assert.equal(n.createdAt, null);
  assert.equal(n.editedAt, null);
  assert.equal(n.deletedAt, null);
  assert.equal(n.isLegacy, true);
  assert.match(n.id, /^n_legacy_2026-05-04_0$/);
});

test('parseResearchNotes: trailered bullet exposes all fields', () => {
  const body =
    '## Research notes\n\n' +
    '### 2026-05-06\n' +
    '- aunt sally said x\n' +
    '  <!-- note id=n_5w3kp9aq by=steven kind=human at=2026-05-06T14:23:00Z -->\n';
  const [n] = parseResearchNotes(body);
  assert.equal(n!.id, 'n_5w3kp9aq');
  assert.equal(n!.by, 'steven');
  assert.equal(n!.kind, 'human');
  assert.equal(n!.createdAt, '2026-05-06T14:23:00Z');
  assert.equal(n!.editedAt, null);
  assert.equal(n!.deletedAt, null);
  assert.equal(n!.isLegacy, false);
  assert.equal(n!.text, 'aunt sally said x');
});

test('parseResearchNotes: edited and deleted fields surface', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z editedAt=2026-05-06T16:00:00Z editedBy=alice -->\n' +
    '- b\n' +
    '  <!-- note id=n_b by=agent kind=agent at=2026-05-06T15:00:00Z deletedAt=2026-05-06T17:00:00Z deletedBy=steven -->\n';
  const notes = parseResearchNotes(body);
  assert.equal(notes[0]!.editedAt, '2026-05-06T16:00:00Z');
  assert.equal(notes[0]!.editedBy, 'alice');
  assert.equal(notes[1]!.kind, 'agent');
  assert.equal(notes[1]!.deletedAt, '2026-05-06T17:00:00Z');
  assert.equal(notes[1]!.deletedBy, 'steven');
});

test('parseResearchNotes: multi-line bullet keeps continuation lines, trailer detached', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- first line\n' +
    '  second line\n' +
    '  third line\n' +
    '  <!-- note id=n_x by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const [n] = parseResearchNotes(body);
  assert.equal(n!.text, 'first line\nsecond line\nthird line');
  assert.equal(n!.id, 'n_x');
});

test('parseResearchNotes: newest day first, in-document order within day', () => {
  const body =
    '## Research notes\n\n' +
    '### 2026-05-06\n- a\n- b\n\n' +
    '### 2026-05-04\n- earlier\n';
  const notes = parseResearchNotes(body);
  assert.deepEqual(notes.map(n => n.text), ['a', 'b', 'earlier']);
  assert.deepEqual(notes.map(n => n.date), ['2026-05-06', '2026-05-06', '2026-05-04']);
});

test('parseResearchNotes: legacy synthetic ids are unique per (date, position)', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- a\n- b\n- c\n';
  const ids = parseResearchNotes(body).map(n => n.id);
  assert.deepEqual(ids, [
    'n_legacy_2026-05-04_0',
    'n_legacy_2026-05-04_1',
    'n_legacy_2026-05-04_2',
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: imports of `parseResearchNotes`, `Note`, the three errors fail to resolve.

- [ ] **Step 3: Implement types, errors, and parser**

Replace the contents of `core/src/pages/research-notes.ts` with the version below. (`appendResearchNote` and `extractResearchNotesSection` are kept; later tasks will swap `appendResearchNote`'s signature.)

```ts
/**
 * Pure helpers for the `## Research notes` section of a talk-page body.
 *
 * - Each bullet may carry a trailing HTML comment that holds the note's
 *   stable id, author, kind (human/agent), and timestamps for create,
 *   edit (latest only), and soft-delete. Bullets without a trailer are
 *   "legacy" notes — parsed read-only with a synthetic id and `(unknown)`
 *   author.
 * - All functions are pure: id and `now` come from the caller, so tests
 *   stay deterministic without injecting a clock or RNG.
 */

export type NoteKind = 'human' | 'agent';

export interface Note {
  id: string;
  date: string;             // YYYY-MM-DD (the day heading)
  text: string;             // bullet prose, sans "- " prefix and trailer (multi-line preserved)
  by: string;               // "(unknown)" for legacy
  kind: NoteKind;           // legacy → 'human'
  createdAt: string | null; // null for legacy
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;        // derived: true iff bullet has no trailer
}

export interface NewNoteInput {
  id: string;       // generated by caller
  text: string;
  by: string;
  kind: NoteKind;
  createdAt: string; // ISO-8601 UTC
}

export class NoteNotFoundError extends Error {
  constructor(public readonly noteId: string) {
    super(`note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
  }
}

export class NoteDeletedError extends Error {
  constructor(public readonly noteId: string) {
    super(`note is deleted: ${noteId}`);
    this.name = 'NoteDeletedError';
  }
}

export class NoteAlreadyDeletedError extends Error {
  constructor(public readonly noteId: string) {
    super(`note is already deleted: ${noteId}`);
    this.name = 'NoteAlreadyDeletedError';
  }
}

const SECTION_RE = /^## Research notes\s*$/;
const DAY_HEADING_RE = /^### (\d{4}-\d{2}-\d{2})\s*$/;
const BULLET_START_RE = /^- (.*)$/;
const TRAILER_RE = /^\s*<!--\s*note\s+(.+?)\s*-->\s*$/;

/**
 * Return every note in the section, newest day first, in-document order
 * within a day. Bullets without a trailer are returned as legacy
 * (synthetic deterministic id, `by="(unknown)"`, `createdAt=null`).
 */
export function parseResearchNotes(body: string): Note[] {
  const lines = body.split('\n');
  const sectionStart = lines.findIndex((l) => SECTION_RE.test(l));
  if (sectionStart === -1) return [];

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) { sectionEnd = i; break; }
  }

  const notes: Note[] = [];
  let currentDate = '';
  let positionInDay = 0;

  let i = sectionStart + 1;
  while (i < sectionEnd) {
    const line = lines[i]!;
    const dayMatch = DAY_HEADING_RE.exec(line);
    if (dayMatch) {
      currentDate = dayMatch[1]!;
      positionInDay = 0;
      i++;
      continue;
    }
    const bulletMatch = BULLET_START_RE.exec(line);
    if (!bulletMatch || !currentDate) {
      i++;
      continue;
    }
    // Bullet block runs from this line through the next bullet, day
    // heading, blank-then-non-continuation, or section end.
    const headText = bulletMatch[1]!;
    const blockLines: string[] = [headText];
    let trailerAttrs: string | null = null;
    let j = i + 1;
    while (j < sectionEnd) {
      const nl = lines[j]!;
      if (BULLET_START_RE.test(nl)) break;
      if (DAY_HEADING_RE.test(nl)) break;
      if (/^## /.test(nl)) break;
      // Blank line is part of the block only if continuation follows.
      if (nl === '') {
        const k = j + 1;
        if (k >= sectionEnd) break;
        const peek = lines[k]!;
        if (peek.startsWith('  ') || TRAILER_RE.test(peek)) {
          blockLines.push('');
          j++;
          continue;
        }
        break;
      }
      const trailerMatch = TRAILER_RE.exec(nl);
      if (trailerMatch) {
        trailerAttrs = trailerMatch[1]!;
        j++;
        continue;
      }
      // Continuation line: drop the two-space indent.
      blockLines.push(nl.startsWith('  ') ? nl.slice(2) : nl);
      j++;
    }

    const text = blockLines.join('\n').replace(/\s+$/, '');
    if (trailerAttrs) {
      const attrs = parseTrailerAttrs(trailerAttrs);
      notes.push({
        id: attrs.id ?? `n_legacy_${currentDate}_${positionInDay}`,
        date: currentDate,
        text,
        by: attrs.by ?? '(unknown)',
        kind: (attrs.kind === 'agent' ? 'agent' : 'human'),
        createdAt: attrs.at ?? null,
        editedAt: attrs.editedAt ?? null,
        editedBy: attrs.editedBy ?? null,
        deletedAt: attrs.deletedAt ?? null,
        deletedBy: attrs.deletedBy ?? null,
        isLegacy: false,
      });
    } else {
      notes.push({
        id: `n_legacy_${currentDate}_${positionInDay}`,
        date: currentDate,
        text,
        by: '(unknown)',
        kind: 'human',
        createdAt: null,
        editedAt: null,
        editedBy: null,
        deletedAt: null,
        deletedBy: null,
        isLegacy: true,
      });
    }
    positionInDay++;
    i = j;
  }
  return notes;
}

function parseTrailerAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tok of s.split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq === -1) continue;
    out[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  return out;
}
```

Keep the existing `appendResearchNote` and `extractResearchNotesSection` exactly as they are for now — the next task replaces `appendResearchNote`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: all parse tests pass. The pre-existing `appendResearchNote` and `extractResearchNotesSection` tests still pass (untouched).

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/research-notes.ts core/test/pages/research-notes.test.ts
git commit -m "feat: parseResearchNotes + note types/errors"
```

---

### Task 2: Extend `appendResearchNote` to write the trailer

**Files:**
- Modify: `core/src/pages/research-notes.ts`
- Test:   `core/test/pages/research-notes.test.ts`

The existing signature `appendResearchNote(body, date, note)` must change to `appendResearchNote(body, input: NewNoteInput, options?: { date?: string })`. The `date` is normally derived from `input.createdAt`'s UTC date, but callers can override (e.g. `wai note --date 2026-05-04`). Existing simple-string tests get rewritten; the day-grouping behavior is preserved.

- [ ] **Step 1: Rewrite the existing `appendResearchNote` tests**

Replace every `appendResearchNote('...', date, note)` test in `core/test/pages/research-notes.test.ts` with the new shape. Below is the full block of replacements — keep the test names so diff stays readable.

```ts
const fixed = (over: Partial<NewNoteInput> = {}): NewNoteInput => ({
  id: over.id ?? 'n_test0001',
  text: over.text ?? 'first note',
  by: over.by ?? 'steven',
  kind: over.kind ?? 'human',
  createdAt: over.createdAt ?? '2026-05-05T12:00:00Z',
});

test('appendResearchNote: empty body grows the section from scratch', () => {
  const out = appendResearchNote('', fixed(), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first note\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: appends section to existing body, preserves prior content', () => {
  const body = '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n';
  const out = appendResearchNote(body, fixed({ text: 'Aunt Sally said Bell Labs' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n\n## Research notes\n\n### 2026-05-05\n- Aunt Sally said Bell Labs\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: new day inserts heading above existing entries', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- earlier note\n';
  const out = appendResearchNote(body, fixed({ id: 'n_n', text: 'newer note' }), { date: '2026-05-05' });
  assert.match(out, /### 2026-05-05\n- newer note\n  <!-- note id=n_n by=steven kind=human at=2026-05-05T12:00:00Z -->\n\n### 2026-05-04\n- earlier note\n/);
});

test('appendResearchNote: same day appends bullet under existing heading', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- first note of the day\n';
  const out = appendResearchNote(body, fixed({ id: 'n_2', text: 'second note of the day' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first note of the day\n- second note of the day\n  <!-- note id=n_2 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: agent kind round-trips into the trailer', () => {
  const out = appendResearchNote('', fixed({ kind: 'agent', by: 'editor-bot' }), { date: '2026-05-05' });
  assert.match(out, /<!-- note id=n_test0001 by=editor-bot kind=agent at=/);
});

test('appendResearchNote: derives date from createdAt UTC when no override', () => {
  const out = appendResearchNote('', fixed({ createdAt: '2026-05-06T03:14:00Z' }));
  assert.match(out, /### 2026-05-06\n/);
});

test('appendResearchNote: multi-line note keeps continuation indent and trailer last', () => {
  const out = appendResearchNote('', fixed({ text: 'first line\nsecond line' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first line\n  second line\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: empty text is captured (not silently dropped)', () => {
  const out = appendResearchNote('', fixed({ text: '' }), { date: '2026-05-05' });
  assert.match(out, /- \(empty\)\n  <!-- note /);
});
```

Delete (or replace inline) the old `appendResearchNote: ...` tests that called the 3-arg form: lines for "trims trailing whitespace", "case-sensitive section detection", "section at end of body without trailing newline", "same day with another section following". The behavior they cover is still covered by the new tests above (whitespace trimming inside the bullet, day-heading insertion semantics) — except case-sensitivity. Replace the case-sensitivity test with:

```ts
test('appendResearchNote: section detection is case-sensitive (## research notes does NOT match)', () => {
  const body = '## research notes\n\n### 2026-05-04\n- something\n';
  const out = appendResearchNote(body, fixed({ id: 'n_n', text: 'newer' }), { date: '2026-05-05' });
  assert.match(out, /## research notes\s+### 2026-05-04/);
  assert.match(out, /## Research notes\s+### 2026-05-05\s+- newer\n  <!-- note /);
});
```

Also update the import line at the top of the test file:

```ts
import {
  appendResearchNote,
  extractResearchNotesSection,
  parseResearchNotes,
  type Note,
  type NewNoteInput,
  NoteNotFoundError,
  NoteDeletedError,
  NoteAlreadyDeletedError,
} from '../../src/pages/research-notes.ts';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: every `appendResearchNote` test fails with a TypeScript signature mismatch (the 3-arg form no longer matches). `parseResearchNotes` and `extractResearchNotesSection` tests still pass.

- [ ] **Step 3: Rewrite `appendResearchNote`**

In `core/src/pages/research-notes.ts`, replace the existing `appendResearchNote` and its private `formatBullet` with:

```ts
export interface AppendOptions {
  /** Day heading to file under (YYYY-MM-DD). Defaults to UTC date of input.createdAt. */
  date?: string;
}

/**
 * Append a single research note to the `## Research notes` section,
 * newest-day-first chronology preserved. Pure: returns a new body string.
 */
export function appendResearchNote(
  body: string,
  input: NewNoteInput,
  options: AppendOptions = {},
): string {
  const date = options.date ?? input.createdAt.slice(0, 10);
  const block = formatBulletBlock(input);
  const lines = body.split('\n');

  const sectionIdx = lines.findIndex((l) => SECTION_RE.test(l));

  if (sectionIdx === -1) {
    const trimmed = body.replace(/\s+$/, '');
    const sep = trimmed.length === 0 ? '' : '\n\n';
    return `${trimmed}${sep}## Research notes\n\n### ${date}\n${block}\n`;
  }

  let endIdx = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) { endIdx = i; break; }
  }

  const todayHeading = `### ${date}`;
  let todayIdx = -1;
  for (let i = sectionIdx + 1; i < endIdx; i++) {
    if (lines[i] === todayHeading) { todayIdx = i; break; }
  }

  if (todayIdx !== -1) {
    let blockEnd = endIdx;
    for (let i = todayIdx + 1; i < endIdx; i++) {
      if (/^### /.test(lines[i]!)) { blockEnd = i; break; }
    }
    let insertAt = blockEnd;
    while (insertAt > todayIdx + 1 && lines[insertAt - 1] === '') insertAt--;
    lines.splice(insertAt, 0, ...block.split('\n'));
    return lines.join('\n');
  }

  let insertAt = sectionIdx + 1;
  while (insertAt < endIdx && lines[insertAt] === '') insertAt++;

  const inserted: string[] = [todayHeading, ...block.split('\n')];
  if (insertAt < endIdx && lines[insertAt] !== '') inserted.push('');
  if (lines[sectionIdx + 1] !== '') inserted.unshift('');
  lines.splice(insertAt, 0, ...inserted);
  return lines.join('\n');
}

function formatBulletBlock(input: NewNoteInput): string {
  const trimmed = input.text.replace(/\s+$/, '').replace(/^\n+/, '');
  const head = trimmed === '' ? '(empty)' : trimmed.split('\n')[0]!;
  const tail = trimmed === ''
    ? []
    : trimmed.split('\n').slice(1).map((l) => (l.length === 0 ? '' : `  ${l}`));
  const trailer = `  ${formatTrailer(input)}`;
  return [`- ${head}`, ...tail, trailer].join('\n');
}

function formatTrailer(input: NewNoteInput): string {
  return `<!-- note id=${input.id} by=${input.by} kind=${input.kind} at=${input.createdAt} -->`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/research-notes.ts core/test/pages/research-notes.test.ts
git commit -m "feat: appendResearchNote writes trailer with id/by/kind/at"
```

---

### Task 3: `editResearchNote`

**Files:**
- Modify: `core/src/pages/research-notes.ts`
- Test:   `core/test/pages/research-notes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
test('editResearchNote: rewrites bullet text and adds editedAt/editedBy', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- old text\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const out = editResearchNote(body, 'n_a', 'new text', 'alice', '2026-05-06T16:00:00Z');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-06\n' +
    '- new text\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z editedAt=2026-05-06T16:00:00Z editedBy=alice -->\n',
  );
});

test('editResearchNote: subsequent edit overwrites editedAt/editedBy (latest-only)', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- v1\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z editedAt=2026-05-06T15:00:00Z editedBy=alice -->\n';
  const out = editResearchNote(body, 'n_a', 'v2', 'bob', '2026-05-06T17:00:00Z');
  assert.match(out, /editedAt=2026-05-06T17:00:00Z editedBy=bob/);
  assert.doesNotMatch(out, /editedAt=2026-05-06T15:00:00Z/);
});

test('editResearchNote: multi-line replacement preserves indent', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const out = editResearchNote(body, 'n_a', 'first\nsecond', 'alice', '2026-05-06T15:00:00Z');
  assert.match(out, /- first\n  second\n  <!-- note /);
});

test('editResearchNote: throws NoteNotFoundError on unknown id', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  assert.throws(
    () => editResearchNote(body, 'n_missing', 'x', 'alice', '2026-05-06T15:00:00Z'),
    NoteNotFoundError,
  );
});

test('editResearchNote: throws NoteDeletedError on a soft-deleted note', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z deletedAt=2026-05-06T15:00:00Z deletedBy=steven -->\n';
  assert.throws(
    () => editResearchNote(body, 'n_a', 'x', 'alice', '2026-05-06T16:00:00Z'),
    NoteDeletedError,
  );
});

test('editResearchNote: legacy (no trailer) bullets are unaddressable', () => {
  const body = '## Research notes\n\n### 2026-05-06\n- old\n';
  assert.throws(
    () => editResearchNote(body, 'n_legacy_2026-05-06_0', 'x', 'alice', '2026-05-06T16:00:00Z'),
    NoteNotFoundError,
  );
});
```

Add the import update if not already present (Task 1's import block already lists everything).

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: `editResearchNote` is undefined.

- [ ] **Step 3: Implement `editResearchNote`**

Add to `core/src/pages/research-notes.ts`:

```ts
/**
 * Rewrite the prose of an existing note (matched by id), updating the
 * trailer's `editedAt`/`editedBy` to the latest edit. Throws if the id
 * is unknown or the note is soft-deleted (caller must restore first).
 */
export function editResearchNote(
  body: string,
  id: string,
  newText: string,
  editor: string,
  editedAt: string,
): string {
  const span = findBulletSpan(body, id);
  if (!span) throw new NoteNotFoundError(id);
  if (span.attrs.deletedAt) throw new NoteDeletedError(id);
  span.attrs.editedAt = editedAt;
  span.attrs.editedBy = editor;
  return spliceBulletBlock(body, span, newText, span.attrs);
}

interface BulletSpan {
  startLine: number;        // index of "- ..." line
  endLineExclusive: number; // first line after the bullet's block (incl trailer)
  attrs: TrailerAttrs;
  trailerLineIndex: number; // index of trailer line within the body
}

interface TrailerAttrs {
  id: string;
  by: string;
  kind: NoteKind;
  at: string;
  editedAt?: string;
  editedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
}

function findBulletSpan(body: string, id: string): BulletSpan | null {
  const lines = body.split('\n');
  const sectionStart = lines.findIndex((l) => SECTION_RE.test(l));
  if (sectionStart === -1) return null;
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) { sectionEnd = i; break; }
  }
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (!BULLET_START_RE.test(lines[i]!)) continue;
    const start = i;
    let trailerLine = -1;
    let j = i + 1;
    while (j < sectionEnd) {
      const nl = lines[j]!;
      if (BULLET_START_RE.test(nl)) break;
      if (DAY_HEADING_RE.test(nl)) break;
      if (/^## /.test(nl)) break;
      if (nl === '') {
        const k = j + 1;
        if (k >= sectionEnd) break;
        const peek = lines[k]!;
        if (peek.startsWith('  ') || TRAILER_RE.test(peek)) { j++; continue; }
        break;
      }
      if (TRAILER_RE.test(nl)) { trailerLine = j; j++; continue; }
      j++;
    }
    if (trailerLine === -1) { i = j - 1; continue; }
    const m = TRAILER_RE.exec(lines[trailerLine]!)!;
    const attrs = parseTrailerAttrs(m[1]!) as Partial<TrailerAttrs>;
    if (attrs.id !== id) { i = j - 1; continue; }
    return {
      startLine: start,
      endLineExclusive: j,
      attrs: {
        id: attrs.id,
        by: attrs.by ?? '(unknown)',
        kind: (attrs.kind === 'agent' ? 'agent' : 'human'),
        at: attrs.at ?? '',
        editedAt: attrs.editedAt,
        editedBy: attrs.editedBy,
        deletedAt: attrs.deletedAt,
        deletedBy: attrs.deletedBy,
      },
      trailerLineIndex: trailerLine,
    };
  }
  return null;
}

function spliceBulletBlock(
  body: string,
  span: BulletSpan,
  newText: string,
  attrs: TrailerAttrs,
): string {
  const lines = body.split('\n');
  const trimmed = newText.replace(/\s+$/, '').replace(/^\n+/, '');
  const head = trimmed === '' ? '(empty)' : trimmed.split('\n')[0]!;
  const tail = trimmed === ''
    ? []
    : trimmed.split('\n').slice(1).map((l) => (l.length === 0 ? '' : `  ${l}`));
  const trailer = `  ${serializeTrailer(attrs)}`;
  const next = [`- ${head}`, ...tail, trailer];
  lines.splice(span.startLine, span.endLineExclusive - span.startLine, ...next);
  return lines.join('\n');
}

function serializeTrailer(attrs: TrailerAttrs): string {
  const parts = [
    `id=${attrs.id}`,
    `by=${attrs.by}`,
    `kind=${attrs.kind}`,
    `at=${attrs.at}`,
  ];
  if (attrs.editedAt) parts.push(`editedAt=${attrs.editedAt}`);
  if (attrs.editedBy) parts.push(`editedBy=${attrs.editedBy}`);
  if (attrs.deletedAt) parts.push(`deletedAt=${attrs.deletedAt}`);
  if (attrs.deletedBy) parts.push(`deletedBy=${attrs.deletedBy}`);
  return `<!-- note ${parts.join(' ')} -->`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: all tests pass (including the previous tasks').

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/research-notes.ts core/test/pages/research-notes.test.ts
git commit -m "feat: editResearchNote with last-edit timestamp"
```

---

### Task 4: `softDeleteResearchNote` and `restoreResearchNote`

**Files:**
- Modify: `core/src/pages/research-notes.ts`
- Test:   `core/test/pages/research-notes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
test('softDeleteResearchNote: adds deletedAt/deletedBy to trailer; bullet text untouched', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- aunt sally said x\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const out = softDeleteResearchNote(body, 'n_a', 'steven', '2026-05-06T17:00:00Z');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-06\n' +
    '- aunt sally said x\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z deletedAt=2026-05-06T17:00:00Z deletedBy=steven -->\n',
  );
});

test('softDeleteResearchNote: throws NoteAlreadyDeletedError if already deleted', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z deletedAt=2026-05-06T15:00:00Z deletedBy=steven -->\n';
  assert.throws(
    () => softDeleteResearchNote(body, 'n_a', 'steven', '2026-05-06T16:00:00Z'),
    NoteAlreadyDeletedError,
  );
});

test('softDeleteResearchNote: NoteNotFoundError on missing id', () => {
  assert.throws(
    () => softDeleteResearchNote('## Research notes\n\n### 2026-05-06\n- x\n', 'n_missing', 's', 't'),
    NoteNotFoundError,
  );
});

test('restoreResearchNote: clears deletedAt/deletedBy', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z deletedAt=2026-05-06T17:00:00Z deletedBy=steven -->\n';
  const out = restoreResearchNote(body, 'n_a');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n',
  );
});

test('restoreResearchNote: throws NoteNotFoundError on missing id', () => {
  assert.throws(
    () => restoreResearchNote('## Research notes\n\n### 2026-05-06\n- x\n', 'n_missing'),
    NoteNotFoundError,
  );
});

test('restoreResearchNote: no-op error when note is not deleted', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  // Defining the v1 contract: restore on a live note throws (callers
  // should check first). Keeps the API symmetrical with delete.
  assert.throws(
    () => restoreResearchNote(body, 'n_a'),
    /not deleted/,
  );
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: `softDeleteResearchNote` and `restoreResearchNote` undefined.

- [ ] **Step 3: Implement**

Add to `core/src/pages/research-notes.ts`:

```ts
/**
 * Soft-delete a note by setting `deletedAt`/`deletedBy` on its trailer.
 * Bullet prose is preserved verbatim (the trailer is the canonical
 * record; the UI strikes through visually based on the parsed flag).
 * Throws if the id is unknown or already deleted.
 */
export function softDeleteResearchNote(
  body: string,
  id: string,
  deleter: string,
  deletedAt: string,
): string {
  const span = findBulletSpan(body, id);
  if (!span) throw new NoteNotFoundError(id);
  if (span.attrs.deletedAt) throw new NoteAlreadyDeletedError(id);
  span.attrs.deletedAt = deletedAt;
  span.attrs.deletedBy = deleter;
  return rewriteTrailer(body, span);
}

/**
 * Clear `deletedAt`/`deletedBy` from a soft-deleted note's trailer.
 * Throws if the id is unknown or the note isn't currently deleted.
 */
export function restoreResearchNote(body: string, id: string): string {
  const span = findBulletSpan(body, id);
  if (!span) throw new NoteNotFoundError(id);
  if (!span.attrs.deletedAt) {
    throw new Error(`note ${id} is not deleted`);
  }
  delete span.attrs.deletedAt;
  delete span.attrs.deletedBy;
  return rewriteTrailer(body, span);
}

function rewriteTrailer(body: string, span: BulletSpan): string {
  const lines = body.split('\n');
  lines[span.trailerLineIndex] = `  ${serializeTrailer(span.attrs)}`;
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsx --test test/pages/research-notes.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add core/src/pages/research-notes.ts core/test/pages/research-notes.test.ts
git commit -m "feat: soft-delete and restore for research notes"
```

---

### Task 5: Re-export new symbols from `core/src/pages/index.ts`

**Files:**
- Modify: `core/src/pages/index.ts`

`research-notes.ts` is already re-exported via `export * from './research-notes.ts';`, so the new symbols flow automatically. Verify and run the package's typecheck.

- [ ] **Step 1: Verify re-export**

```bash
cd /Users/nyetwork/dev/whoami/core
grep "research-notes" src/pages/index.ts
```

Expected: `export * from './research-notes.ts';`. No edit required if present.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/nyetwork/dev/whoami/core
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run full core test suite**

```bash
cd /Users/nyetwork/dev/whoami/core
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Skip commit if no edit was needed.**

---

## Phase 2 · Frontend server-side wiring

### Task 6: Note id generator

**Files:**
- Modify: `frontend/lib/server-services.ts`

The id format is `n_` + 8 lowercase Crockford-base32 chars. We use `crypto.randomBytes` (Node built-in) to generate, and validate uniqueness within the current talk page's notes before writing.

- [ ] **Step 1: Add the generator**

In `frontend/lib/server-services.ts`, near the top of the file (after the imports), add:

```ts
import { randomBytes } from 'node:crypto';

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32 lowercase, no i/l/o/u

/** Generate `n_` + 8 random base32 chars (40 bits, ~1e12 keyspace). */
export function generateNoteId(): string {
  const bytes = randomBytes(5);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ID_ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return `n_${out}`;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Smoke-test the helper**

Add `frontend/lib/note-id.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNoteId } from './server-services';

test('generateNoteId: format', () => {
  for (let i = 0; i < 100; i++) {
    const id = generateNoteId();
    assert.match(id, /^n_[0-9a-hjkmnpqrstvwxyz]{8}$/);
  }
});

test('generateNoteId: unique across 1000 calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateNoteId());
  assert.equal(seen.size, 1000);
});
```

Run:

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsx --test lib/note-id.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/server-services.ts frontend/lib/note-id.test.ts
git commit -m "feat: note id generator (n_ + 8 base32)"
```

---

### Task 7: Wire core errors into `routeError`

**Files:**
- Modify: `frontend/lib/api-errors.ts`

- [ ] **Step 1: Edit `routeError`**

In `frontend/lib/api-errors.ts`, add the import and three branches:

```ts
import {
  NoteNotFoundError,
  NoteDeletedError,
  NoteAlreadyDeletedError,
} from '@core/pages/research-notes.ts';
```

Then inside `routeError`, before the `return errorResponse(fallbackCode, ...)` line, add:

```ts
  if (err instanceof NoteNotFoundError) {
    return errorResponse('note-not-found', 404, { noteId: err.noteId });
  }
  if (err instanceof NoteDeletedError) {
    return errorResponse('note-deleted', 409, { noteId: err.noteId });
  }
  if (err instanceof NoteAlreadyDeletedError) {
    return errorResponse('note-already-deleted', 409, { noteId: err.noteId });
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/api-errors.ts
git commit -m "feat: map note errors to wire codes"
```

---

### Task 8: Update `appendNoteOnDisk` to take `by`/`kind` and return id

**Files:**
- Modify: `frontend/lib/server-services.ts`

The existing function signature `appendNoteOnDisk(slug, note): Promise<string>` becomes `appendNoteOnDisk(slug, input): Promise<{ date: string; id: string }>`. The route updates next.

- [ ] **Step 1: Replace `appendNoteOnDisk`**

In `frontend/lib/server-services.ts`, find the existing block:

```ts
export async function appendNoteOnDisk(slug: string, note: string): Promise<string> {
  const talkSlug = toTalkSlug(slug);
  const date = new Date().toISOString().slice(0, 10);
  return withTalkLock(talkSlug, async () => {
    ...
    const nextBody = appendResearchNote(body, date, note);
    ...
    return date;
  });
}
```

Replace with:

```ts
export interface AppendNoteInput {
  text: string;
  by: string;
  kind: 'human' | 'agent';
}

export interface AppendNoteResult {
  date: string;
  id: string;
}

export async function appendNoteOnDisk(
  slug: string,
  input: AppendNoteInput,
): Promise<AppendNoteResult> {
  const talkSlug = toTalkSlug(slug);
  const now = new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let body = '';
    let meta: PageMeta;
    try {
      const page = await pages.read(talkSlug);
      body = page.body;
      meta = page.meta;
    } catch (err) {
      if (!(err instanceof PageNotFoundError)) throw err;
      meta = defaultPageMeta({ title: `Talk: ${titleCaseFromSlug(talkSlug)}` });
    }
    const id = uniqueIdForBody(body);
    const nextBody = appendResearchNote(body, {
      id,
      text: input.text,
      by: input.by,
      kind: input.kind,
      createdAt,
    }, { date });
    const nextPage: Page = { slug: talkSlug, meta, body: nextBody };
    await pages.write(talkSlug, nextPage, DEFAULT_AUTHOR, `note: ${date}`);
    invalidateListCache();
    return { date, id };
  });
}

function uniqueIdForBody(body: string): string {
  const existing = new Set(parseResearchNotes(body).map((n) => n.id));
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateNoteId();
    if (!existing.has(id)) return id;
  }
  throw new Error('failed to generate unique note id after 10 attempts');
}
```

Update the imports near the top of the file to include the new symbols:

```ts
import {
  appendResearchNote,
  extractResearchNotesSection,
  parseResearchNotes,
  editResearchNote,
  softDeleteResearchNote,
  restoreResearchNote,
  type Note,
} from '@core/pages/research-notes.ts';
```

- [ ] **Step 2: Update the existing route caller signature**

Open `frontend/app/api/notes/[slug]/route.ts` and replace its body so it matches the new `appendNoteOnDisk` shape. (Full replacement covered in Task 11; for this step, change only the call site to keep the build green.)

```ts
const result = await appendNoteOnDisk(slug, {
  text: parsed.data.note,
  by: DEFAULT_AUTHOR.name,    // Task 11 will read from request body
  kind: 'human',
});
return NextResponse.json({ slug: toTalkSlug(slug), date: result.date, id: result.id });
```

Add `import { DEFAULT_AUTHOR } from '@/lib/env';` to the route.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/server-services.ts frontend/app/api/notes/[slug]/route.ts
git commit -m "feat: appendNoteOnDisk takes by/kind, returns id"
```

---

### Task 9: Add `editNoteOnDisk`, `softDeleteNoteOnDisk`, `restoreNoteOnDisk`

**Files:**
- Modify: `frontend/lib/server-services.ts`

The Task 8 import block already pulled in `editResearchNote`, `softDeleteResearchNote`, and `restoreResearchNote`. Add `NoteNotFoundError` to that block:

```ts
import {
  appendResearchNote,
  extractResearchNotesSection,
  parseResearchNotes,
  editResearchNote,
  softDeleteResearchNote,
  restoreResearchNote,
  NoteNotFoundError,
  type Note,
} from '@core/pages/research-notes.ts';
```

- [ ] **Step 1: Add the three on-disk wrappers**

Append to `frontend/lib/server-services.ts`, after `appendNoteOnDisk`:

```ts
export async function editNoteOnDisk(
  slug: string,
  id: string,
  newText: string,
  editor: string,
): Promise<{ id: string; editedAt: string }> {
  const talkSlug = toTalkSlug(slug);
  const editedAt = new Date().toISOString();
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = editResearchNote(page.body, id, newText, editor, editedAt);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: edit ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id, editedAt };
  });
}

export async function softDeleteNoteOnDisk(
  slug: string,
  id: string,
  deleter: string,
): Promise<{ id: string; deletedAt: string }> {
  const talkSlug = toTalkSlug(slug);
  const deletedAt = new Date().toISOString();
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = softDeleteResearchNote(page.body, id, deleter, deletedAt);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: retract ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id, deletedAt };
  });
}

export async function restoreNoteOnDisk(
  slug: string,
  id: string,
): Promise<{ id: string }> {
  const talkSlug = toTalkSlug(slug);
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = restoreResearchNote(page.body, id);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: restore ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id };
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/server-services.ts
git commit -m "feat: edit/softDelete/restore note on disk"
```

---

### Task 10: `buildNotesView` — server-side join from talk body to per-note view

**Files:**
- Modify: `frontend/lib/server-services.ts`

Replaces `renderNotesSection` in the page flow. The new `buildNotesView(talkBody, slugIndex)` returns a per-note structure with the bullet's prose pre-rendered to React (so the client component can stay pure data).

- [ ] **Step 1: Add the function**

Append to `frontend/lib/server-services.ts`:

```ts
export interface NoteView {
  id: string;
  date: string;
  by: string;
  kind: 'human' | 'agent';
  createdAt: string | null;
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;
  /** Raw bullet prose, preserved so the edit form has source text. */
  text: string;
  /** Pre-rendered prose (wikilinks resolved). */
  rendered: ReactElement;
}

export async function buildNotesView(
  talkBody: string,
  index: SlugIndex,
): Promise<NoteView[]> {
  const notes = parseResearchNotes(talkBody);
  const views: NoteView[] = [];
  for (const n of notes) {
    const rendered = await renderMarkdown(n.text, index);
    views.push({
      id: n.id,
      date: n.date,
      by: n.by,
      kind: n.kind,
      createdAt: n.createdAt,
      editedAt: n.editedAt,
      editedBy: n.editedBy,
      deletedAt: n.deletedAt,
      deletedBy: n.deletedBy,
      isLegacy: n.isLegacy,
      text: n.text,
      rendered,
    });
  }
  return views;
}
```

`renderNotesSection` and `extractResearchNotesSection` stay (other callers may use them). They become unused in the panel flow after Task 19 — leave them in place; cleanup is out of scope.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/lib/server-services.ts
git commit -m "feat: buildNotesView for structured panel render"
```

---

## Phase 3 · API routes

### Task 11: Update `POST /api/notes/[slug]` to accept `by`/`kind`

**Files:**
- Modify: `frontend/app/api/notes/[slug]/route.ts`

- [ ] **Step 1: Replace the route**

Overwrite `frontend/app/api/notes/[slug]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { appendNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';
import { DEFAULT_AUTHOR } from '@/lib/env';

const NoteBody = z.object({
  note: z.string().min(1).max(5000),
  by: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).optional(),
  kind: z.enum(['human', 'agent']).optional(),
});

/**
 * POST /api/notes/<slug> — append a dated research note to
 * `<slug>.talk.md`. The slug is the article slug; `.talk` form is also
 * accepted. Body fields:
 *   - note (required): bullet prose
 *   - by (optional): author handle. Falls back to DEFAULT_AUTHOR.name.
 *   - kind (optional): "human" (default) or "agent"
 * Returns the resolved talk slug, the date filed under, and the new
 * note's stable id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  const json = await req.json().catch(() => null);
  const parsed = NoteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const { date, id } = await appendNoteOnDisk(slug, {
      text: parsed.data.note,
      by: parsed.data.by ?? DEFAULT_AUTHOR.name,
      kind: parsed.data.kind ?? 'human',
    });
    return NextResponse.json({ slug: toTalkSlug(slug), date, id });
  } catch (err) {
    return routeError(err, slug, 'note-failed');
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/app/api/notes/[slug]/route.ts
git commit -m "feat: POST /api/notes accepts by/kind, returns id"
```

---

### Task 12: New `PATCH` and `DELETE` at `/api/notes/[slug]/[id]`

**Files:**
- Create: `frontend/app/api/notes/[slug]/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { editNoteOnDisk, softDeleteNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';
import { DEFAULT_AUTHOR } from '@/lib/env';

const NOTE_ID_RE = /^n_[0-9a-z]{8}$/;

const PatchBody = z.object({
  note: z.string().min(1).max(5000),
  by: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).optional(),
});

const DeleteBody = z.object({
  by: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).optional(),
}).optional();

/**
 * PATCH /api/notes/<slug>/<id> — edit the prose of an existing note.
 * Updates `editedAt`/`editedBy` to the latest edit.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await editNoteOnDisk(
      slug,
      id,
      parsed.data.note,
      parsed.data.by ?? DEFAULT_AUTHOR.name,
    );
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, editedAt: result.editedAt });
  } catch (err) {
    return routeError(err, slug, 'note-edit-failed');
  }
}

/**
 * DELETE /api/notes/<slug>/<id> — soft-delete (retract). Bullet prose
 * stays in place; the trailer gains `deletedAt`/`deletedBy`. Reversible
 * via POST /restore.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  const json = await req.json().catch(() => null);
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await softDeleteNoteOnDisk(
      slug,
      id,
      parsed.data?.by ?? DEFAULT_AUTHOR.name,
    );
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, deletedAt: result.deletedAt });
  } catch (err) {
    return routeError(err, slug, 'note-delete-failed');
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/app/api/notes/[slug]/[id]/route.ts
git commit -m "feat: PATCH/DELETE /api/notes/[slug]/[id]"
```

---

### Task 13: New `POST /api/notes/[slug]/[id]/restore`

**Files:**
- Create: `frontend/app/api/notes/[slug]/[id]/restore/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { restoreNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';

const NOTE_ID_RE = /^n_[0-9a-z]{8}$/;

/**
 * POST /api/notes/<slug>/<id>/restore — clear the soft-delete flag on a
 * retracted note.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  try {
    const result = await restoreNoteOnDisk(slug, id);
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id });
  } catch (err) {
    return routeError(err, slug, 'note-restore-failed');
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/app/api/notes/[slug]/[id]/restore/route.ts
git commit -m "feat: POST /api/notes/[slug]/[id]/restore"
```

---

## Phase 4 · CLI

### Task 14: Extend `ApiClient` with note methods

**Files:**
- Modify: `cli/src/api-client.ts`

- [ ] **Step 1: Update existing `note` method and add new methods**

Replace the existing `async note(...)` method in `cli/src/api-client.ts` with:

```ts
  /**
   * Append a dated research note to `<slug>.talk.md`. The slug is the
   * article slug (server appends `.talk` itself). Returns the resolved
   * talk slug, the date filed under, and the new note's id.
   */
  async note(
    slug: string,
    note: string,
    opts: { by?: string; kind?: 'human' | 'agent' } = {},
  ): Promise<{ slug: string; date: string; id: string }> {
    return this.json('POST', `/api/notes/${slug}`, { note, ...opts });
  }

  async editNote(
    slug: string,
    id: string,
    note: string,
    opts: { by?: string } = {},
  ): Promise<{ slug: string; id: string; editedAt: string }> {
    return this.json('PATCH', `/api/notes/${slug}/${id}`, { note, ...opts });
  }

  async deleteNote(
    slug: string,
    id: string,
    opts: { by?: string } = {},
  ): Promise<{ slug: string; id: string; deletedAt: string }> {
    return this.json('DELETE', `/api/notes/${slug}/${id}`, opts);
  }

  async restoreNote(
    slug: string,
    id: string,
  ): Promise<{ slug: string; id: string }> {
    return this.json('POST', `/api/notes/${slug}/${id}/restore`);
  }

  /**
   * List all notes on a talk page (via the existing GET /api/pages and
   * a client-side parse). Returns the structured Note[].
   */
  async listNotes(slug: string): Promise<NoteSummary[]> {
    const talkSlug = slug.endsWith('.talk') ? slug : `${slug}.talk`;
    const page = await this.read(talkSlug);
    return parseNotesFromBody(page.body);
  }
```

Add at the top of the file:

```ts
import { parseResearchNotes, type Note } from '@core/pages/research-notes.ts';

export type NoteSummary = Note;

function parseNotesFromBody(body: string): Note[] {
  return parseResearchNotes(body);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/cli
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/api-client.ts
git commit -m "feat: cli api-client edit/delete/restore/list note methods"
```

---

### Task 15: Extend `wai note` with `--edit` / `--delete` / `--restore` / `--list` / `--as-agent`

**Files:**
- Modify: `cli/src/commands/note.ts`
- Test:   `cli/test/note.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `cli/test/note.test.ts` with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNote } from '../src/commands/note.js';

interface Calls {
  note: { slug: string; note: string; by?: string; kind?: 'human' | 'agent' }[];
  edit: { slug: string; id: string; note: string; by?: string }[];
  del: { slug: string; id: string; by?: string }[];
  restore: { slug: string; id: string }[];
  list: { slug: string }[];
}

function fakeClient(): Calls & {
  note: (s: string, n: string, o?: { by?: string; kind?: 'human' | 'agent' }) => Promise<{ slug: string; date: string; id: string }>;
  editNote: (s: string, id: string, n: string, o?: { by?: string }) => Promise<{ slug: string; id: string; editedAt: string }>;
  deleteNote: (s: string, id: string, o?: { by?: string }) => Promise<{ slug: string; id: string; deletedAt: string }>;
  restoreNote: (s: string, id: string) => Promise<{ slug: string; id: string }>;
  listNotes: (s: string) => Promise<unknown[]>;
} {
  const calls: Calls = { note: [], edit: [], del: [], restore: [], list: [] };
  return {
    ...calls,
    note: async (slug, note, opts = {}) => {
      calls.note.push({ slug, note, ...opts });
      return { slug: slug.endsWith('.talk') ? slug : `${slug}.talk`, date: '2026-05-06', id: 'n_a1b2c3d4' };
    },
    editNote: async (slug, id, note, opts = {}) => {
      calls.edit.push({ slug, id, note, ...opts });
      return { slug: `${slug}.talk`, id, editedAt: '2026-05-06T16:00:00Z' };
    },
    deleteNote: async (slug, id, opts = {}) => {
      calls.del.push({ slug, id, ...opts });
      return { slug: `${slug}.talk`, id, deletedAt: '2026-05-06T17:00:00Z' };
    },
    restoreNote: async (slug, id) => {
      calls.restore.push({ slug, id });
      return { slug: `${slug}.talk`, id };
    },
    listNotes: async (slug) => {
      calls.list.push({ slug });
      return [
        { id: 'n_a1', date: '2026-05-06', text: 'first', by: 'steven', kind: 'human', createdAt: '2026-05-06T14:00:00Z', editedAt: null, editedBy: null, deletedAt: null, deletedBy: null, isLegacy: false },
        { id: 'n_b2', date: '2026-05-06', text: 'deleted', by: 'steven', kind: 'human', createdAt: '2026-05-06T14:30:00Z', editedAt: null, editedBy: null, deletedAt: '2026-05-06T15:00:00Z', deletedBy: 'steven', isLegacy: false },
      ];
    },
  };
}

test('note: append forwards by/kind from options', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'append', note: 'hi', by: 'alice', kind: 'agent', client: c, write: (s) => { out += s; } });
  assert.equal(c.note.length, 1);
  assert.deepEqual(c.note[0], { slug: 'grandpa', note: 'hi', by: 'alice', kind: 'agent' });
  assert.match(out, /note added to grandpa\.talk \(2026-05-06, n_a1b2c3d4\)/);
});

test('note: edit mode forwards id and text', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'edit', id: 'n_a1', note: 'rewritten', client: c, write: (s) => { out += s; } });
  assert.equal(c.edit.length, 1);
  assert.deepEqual(c.edit[0], { slug: 'grandpa', id: 'n_a1', note: 'rewritten' });
  assert.match(out, /note n_a1 edited/);
});

test('note: delete mode forwards id', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'delete', id: 'n_a1', client: c, write: (s) => { out += s; } });
  assert.equal(c.del.length, 1);
  assert.deepEqual(c.del[0], { slug: 'grandpa', id: 'n_a1' });
  assert.match(out, /note n_a1 retracted/);
});

test('note: restore mode forwards id', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'restore', id: 'n_a1', client: c, write: (s) => { out += s; } });
  assert.equal(c.restore.length, 1);
  assert.deepEqual(c.restore[0], { slug: 'grandpa', id: 'n_a1' });
  assert.match(out, /note n_a1 restored/);
});

test('note: list prints id + date + preview, marks deleted', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'list', client: c, write: (s) => { out += s; } });
  assert.match(out, /n_a1\s+2026-05-06\s+first/);
  assert.match(out, /\[deleted\]\s+n_b2\s+2026-05-06\s+deleted/);
});

test('note: list --json prints structured array', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'list', json: true, client: c, write: (s) => { out += s; } });
  const arr = JSON.parse(out);
  assert.equal(arr.length, 2);
  assert.equal(arr[0].id, 'n_a1');
});

test('note: rejects empty input on append', async () => {
  const c = fakeClient();
  await assert.rejects(
    runNote({ slug: 'grandpa', mode: 'append', note: '   \n  ', client: c, write: () => {} }),
    /note is empty/,
  );
});

test('note: rejects empty input on edit', async () => {
  const c = fakeClient();
  await assert.rejects(
    runNote({ slug: 'grandpa', mode: 'edit', id: 'n_a1', note: '', client: c, write: () => {} }),
    /note is empty/,
  );
});

test('note: append still strips .talk suffix from slug', async () => {
  const c = fakeClient();
  await runNote({ slug: 'grandpa.talk', mode: 'append', note: 'x', client: c, write: () => {} });
  assert.equal(c.note[0]!.slug, 'grandpa');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nyetwork/dev/whoami/cli
npx tsx --test test/note.test.ts
```

Expected: signature mismatch — `runNote` doesn't accept `mode` yet.

- [ ] **Step 3: Replace `cli/src/commands/note.ts`**

```ts
import type { ApiClient, NoteSummary } from '../api-client.js';
import { toBaseSlug } from '@core/pages/slug.ts';

type Mode = 'append' | 'edit' | 'delete' | 'restore' | 'list';

export interface NoteOptions {
  slug: string;
  mode: Mode;
  note?: string;
  id?: string;
  by?: string;
  kind?: 'human' | 'agent';
  json?: boolean;
  client: Pick<ApiClient, 'note' | 'editNote' | 'deleteNote' | 'restoreNote' | 'listNotes'>;
  write: (s: string) => void;
}

export async function runNote(opts: NoteOptions): Promise<void> {
  const slug = toBaseSlug(opts.slug);
  switch (opts.mode) {
    case 'append': {
      const text = (opts.note ?? '').trim();
      if (text === '') {
        throw new Error('note is empty — pass text positionally, via --file, or via --stdin');
      }
      const result = await opts.client.note(slug, text, { by: opts.by, kind: opts.kind });
      opts.write(`note added to ${result.slug} (${result.date}, ${result.id})\n`);
      return;
    }
    case 'edit': {
      const id = requireId(opts.id);
      const text = (opts.note ?? '').trim();
      if (text === '') {
        throw new Error('note is empty — pass text positionally, via --file, or via --stdin');
      }
      const result = await opts.client.editNote(slug, id, text, { by: opts.by });
      opts.write(`note ${result.id} edited (${result.editedAt})\n`);
      return;
    }
    case 'delete': {
      const id = requireId(opts.id);
      const result = await opts.client.deleteNote(slug, id, { by: opts.by });
      opts.write(`note ${result.id} retracted (${result.deletedAt})\n`);
      return;
    }
    case 'restore': {
      const id = requireId(opts.id);
      const result = await opts.client.restoreNote(slug, id);
      opts.write(`note ${result.id} restored\n`);
      return;
    }
    case 'list': {
      const notes = await opts.client.listNotes(slug);
      if (opts.json) {
        opts.write(`${JSON.stringify(notes, null, 2)}\n`);
        return;
      }
      for (const n of notes as NoteSummary[]) {
        const flag = n.deletedAt ? '[deleted] ' : '';
        const preview = n.text.replace(/\s+/g, ' ').slice(0, 80);
        opts.write(`${flag}${n.id}  ${n.date}  ${preview}\n`);
      }
      return;
    }
  }
}

function requireId(id: string | undefined): string {
  if (!id) throw new Error('note id required (e.g. --edit <id>, --delete <id>)');
  if (!/^n_[0-9a-z]{8}$/.test(id) && !id.startsWith('n_legacy_')) {
    throw new Error(`invalid note id: ${id}`);
  }
  return id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nyetwork/dev/whoami/cli
npx tsx --test test/note.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/commands/note.ts cli/test/note.test.ts
git commit -m "feat: wai note --edit/--delete/--restore/--list/--as-agent"
```

---

### Task 16: Wire new modes into `cli/src/index.ts` (dispatch + help)

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Replace the `case 'note':` block**

Find:

```ts
      case 'note': {
        const slug = toSlug(args.positional[0] ?? '');
        const note = await resolveNoteBody(args);
        await runNote({ slug, note, client, write });
        break;
      }
```

Replace with:

```ts
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
```

- [ ] **Step 2: Update the `HELP` constant**

Find the `note <slug> [text]` block and replace it with:

```
  note <slug> [text]          Append a dated research note to <slug>.talk
                                body from positional, --file F, or --stdin;
                                no body opens $EDITOR with an empty buffer
  note <slug> --edit <id> "text"
                              Edit an existing note's prose
  note <slug> --delete <id>   Soft-delete (retract) a note; reversible
  note <slug> --restore <id>  Restore a previously retracted note
  note <slug> --list [--json] List notes (id, date, preview)
  note <slug> --as-agent ...  Tag the write kind=agent (append/edit only)
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/cli
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Run full CLI suite**

```bash
cd /Users/nyetwork/dev/whoami/cli
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add cli/src/index.ts
git commit -m "feat: cli dispatcher for note edit/delete/restore/list"
```

---

## Phase 5 · Frontend UI

### Task 17: `relative-time.ts` helper

**Files:**
- Create: `frontend/components/research-notes/relative-time.ts`

- [ ] **Step 1: Create the helper**

```ts
/**
 * Format an ISO-8601 timestamp as a short relative string ("just now",
 * "5m ago", "2h ago", "yesterday", "3d ago", or the literal date for
 * anything older than a week).
 */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return then.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Add a quick test**

`frontend/components/research-notes/relative-time.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelative } from './relative-time';

const now = new Date('2026-05-06T20:00:00Z');

test('relative-time: minutes', () => {
  assert.equal(formatRelative('2026-05-06T19:55:00Z', now), '5m ago');
});
test('relative-time: hours', () => {
  assert.equal(formatRelative('2026-05-06T18:00:00Z', now), '2h ago');
});
test('relative-time: yesterday', () => {
  assert.equal(formatRelative('2026-05-05T10:00:00Z', now), 'yesterday');
});
test('relative-time: older than a week', () => {
  assert.equal(formatRelative('2026-04-20T10:00:00Z', now), '2026-04-20');
});
test('relative-time: null returns empty', () => {
  assert.equal(formatRelative(null, now), '');
});
```

- [ ] **Step 3: Run the test**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsx --test components/research-notes/relative-time.test.ts
```

Expected: PASS.

The frontend `npm test` glob is `lib/**/*.test.ts`, so this test won't auto-run with `npm test`. Add the file path explicitly when verifying. (Alternative: move the helper under `lib/`. Out of scope; keep it co-located with the panel.)

- [ ] **Step 4: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/components/research-notes/relative-time.ts frontend/components/research-notes/relative-time.test.ts
git commit -m "feat: relative-time formatter for note bylines"
```

---

### Task 18: `NoteItem` component (one bullet's view)

**Files:**
- Create: `frontend/components/research-notes/note-item.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useTransition, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Undo2 } from 'lucide-react';
import { EditNoteForm } from './edit-note-form';
import { formatRelative } from './relative-time';

export interface NoteItemView {
  id: string;
  date: string;
  by: string;
  kind: 'human' | 'agent';
  createdAt: string | null;
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;
  text: string;
  rendered: ReactElement;
}

interface Props {
  slug: string;
  note: NoteItemView;
}

export function NoteItem({ slug, note }: Props) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isDeleted = !!note.deletedAt;
  const canMutate = !note.isLegacy && !isDeleted;

  const onDelete = () => {
    if (!confirm('Retract this note? Reversible from the panel.')) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${note.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: localStorage.getItem('whoami:author') ?? undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : `request failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  const onRestore = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${note.id}/restore`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : `request failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className={`group/note relative py-1.5 ${isDeleted ? 'opacity-60' : ''}`}>
      {editing ? (
        <EditNoteForm
          slug={slug}
          id={note.id}
          initialText={note.text}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      ) : (
        <>
          <div className={isDeleted ? 'line-through' : ''}>
            {note.rendered}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              by {note.by}
              {note.kind === 'agent' ? ' (agent)' : ''}
              {note.createdAt ? ` · ${formatRelative(note.createdAt)}` : ''}
            </span>
            {note.editedAt ? (
              <span>· edited {formatRelative(note.editedAt)}{note.editedBy ? ` by ${note.editedBy}` : ''}</span>
            ) : null}
            {isDeleted ? (
              <span>· retracted by {note.deletedBy} · {formatRelative(note.deletedAt)}</span>
            ) : null}
            <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover/note:opacity-100">
              {canMutate ? (
                <>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={() => setEditing(true)} aria-label="Edit note">
                    <Pencil className="size-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={onDelete} aria-label="Retract note">
                    <Trash2 className="size-3" />
                  </Button>
                </>
              ) : null}
              {isDeleted ? (
                <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={onRestore} aria-label="Restore note">
                  <Undo2 className="size-3" />
                </Button>
              ) : null}
            </span>
          </div>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors after the next task creates `EditNoteForm`. For now this will fail to import — that's OK, fix in Task 19. **Skip the typecheck for this single step**; commit after Task 19.

- [ ] **Step 3: Stage but defer commit**

Don't commit yet — `EditNoteForm` doesn't exist. Move to Task 19.

---

### Task 19: `EditNoteForm` component

**Files:**
- Create: `frontend/components/research-notes/edit-note-form.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  slug: string;
  id: string;
  initialText: string;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditNoteForm({ slug, id, initialText, onCancel, onSaved }: Props) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const body = text.trim();
    if (body === '') {
      setError('write something first');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: body,
          by: typeof window !== 'undefined' ? localStorage.getItem('whoami:author') ?? undefined : undefined,
        }),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => null);
        setError(typeof respBody?.error === 'string' ? respBody.error : `request failed (${res.status})`);
        return;
      }
      onSaved();
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="flex flex-col gap-2 not-prose">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        autoFocus
        disabled={isPending}
        className="min-h-16 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {error ?? 'Cmd/Ctrl+Enter to save · Esc to cancel'}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors (NoteItem now imports cleanly). If errors point at the panel, ignore for now — fixed in Task 20.

- [ ] **Step 3: Commit (NoteItem + EditNoteForm together)**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/components/research-notes/note-item.tsx frontend/components/research-notes/edit-note-form.tsx
git commit -m "feat: NoteItem and EditNoteForm components"
```

---

### Task 20: Update `panel.tsx` to render `NoteView[]`

**Files:**
- Modify: `frontend/components/research-notes/panel.tsx`

- [ ] **Step 1: Replace the panel**

```tsx
import { toTalkSlug } from '@core/pages/slug.ts';
import { AddNoteForm } from './add-note-form';
import { NoteItem, type NoteItemView } from './note-item';

interface Props {
  slug: string;
  notes: NoteItemView[];
}

export function ResearchNotesPanel({ slug, notes }: Props) {
  const talkSlug = toTalkSlug(slug);
  // Group by date heading, preserving the parser's newest-first order.
  const byDate: { date: string; items: NoteItemView[] }[] = [];
  for (const n of notes) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === n.date) last.items.push(n);
    else byDate.push({ date: n.date, items: [n] });
  }

  return (
    <section
      aria-labelledby="research-notes-heading"
      className="mt-12 border-t pt-8 not-prose"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2
          id="research-notes-heading"
          className="font-heading text-2xl tracking-normal text-foreground"
        >
          Research notes
        </h2>
        <p className="text-xs text-muted-foreground">
          Captured on this person; folded into the article when the editor next runs.
        </p>
      </div>

      <div className="mb-6">
        <AddNoteForm slug={slug} />
      </div>

      {byDate.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes yet. The first one you save creates the section in <code className="text-xs">{talkSlug}</code>.
        </p>
      ) : (
        <div className="space-y-6">
          {byDate.map((day) => (
            <div key={day.date}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{day.date}</h3>
              <ul className="space-y-1 text-sm">
                {day.items.map((n) => (
                  <NoteItem key={n.id} slug={slug} note={n} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: errors in the page files (they still pass `notes: ReactElement | null`). Fix in Task 22.

- [ ] **Step 3: Stage but defer commit (combine with page wiring)**

---

### Task 21: Update `AddNoteForm` with "Your name" field + localStorage

**Files:**
- Modify: `frontend/components/research-notes/add-note-form.tsx`

- [ ] **Step 1: Replace the file**

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const AUTHOR_KEY = 'whoami:author';

interface Props {
  slug: string;
}

export function AddNoteForm({ slug }: Props) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const router = useRouter();

  // Hydrate author from localStorage on mount; persist on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(AUTHOR_KEY) ?? '';
    setAuthor(stored);
  }, []);

  const onAuthorChange = (v: string) => {
    setAuthor(v);
    if (typeof window !== 'undefined') {
      if (v) localStorage.setItem(AUTHOR_KEY, v);
      else localStorage.removeItem(AUTHOR_KEY);
    }
  };

  const submit = () => {
    const note = text.trim();
    if (!note) {
      setError('write something first');
      return;
    }
    setError(null);
    const trimmedAuthor = author.trim();
    const validAuthor = trimmedAuthor && /^[A-Za-z0-9._-]+$/.test(trimmedAuthor);
    if (trimmedAuthor && !validAuthor) {
      setError('your name: letters, numbers, dot, dash, underscore only');
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note,
          ...(validAuthor ? { by: trimmedAuthor } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errorMessage = typeof body?.error === 'string' ? body.error : `request failed (${res.status})`;
        setError(errorMessage);
        return;
      }
      setText('');
      router.refresh();
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 not-prose">
      <input
        type="text"
        value={author}
        onChange={(e) => onAuthorChange(e.target.value)}
        placeholder="Your name (optional, remembered)"
        className="h-8 rounded-md border bg-transparent px-2 text-xs"
        disabled={isSubmitting}
        aria-label="Your name"
      />
      <Textarea
        placeholder="What did you learn? (Cmd/Ctrl+Enter to save)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        disabled={isSubmitting}
        className="min-h-20 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {error ?? `Will be filed under today's date in ${slug}.talk`}
        </span>
        <Button onClick={submit} disabled={isSubmitting} size="sm">
          {isSubmitting ? 'Saving…' : 'Add note'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: still errors in the page files (Task 22 fixes them).

- [ ] **Step 3: Stage but defer commit**

---

### Task 22: Pass `NoteView[]` from the page files

**Files:**
- Modify: `frontend/app/[slug]/page.tsx`
- Modify: `frontend/app/family/tree/page.tsx`

- [ ] **Step 1: `app/[slug]/page.tsx`**

In `frontend/app/[slug]/page.tsx`:

Replace the import line:

```ts
import {
  getPageStore,
  getCachedList,
  readTalkBody,
  renderNotesSection,
} from '@/lib/server-services';
```

with:

```ts
import {
  getPageStore,
  getCachedList,
  readTalkBody,
  buildNotesView,
} from '@/lib/server-services';
```

Replace the line:

```ts
  const [tree, notesTree] = await Promise.all([
    renderMarkdown(page.body, index, { derived }),
    renderNotesSection(talkBody, index),
  ]);
```

with:

```ts
  const [tree, notes] = await Promise.all([
    renderMarkdown(page.body, index, { derived }),
    buildNotesView(talkBody, index),
  ]);
```

And the panel call:

```tsx
        <ResearchNotesPanel slug={slug} notes={notes} />
```

- [ ] **Step 2: `app/family/tree/page.tsx`**

Replace the import block:

```ts
import {
  getCachedList,
  readTalkBody,
  renderNotesSection,
  resolveSlugForRecord,
  UnknownRecordError,
  NameEmptySlugError,
  InvalidRecordIdError,
} from '@/lib/server-services';
```

with:

```ts
import {
  getCachedList,
  readTalkBody,
  buildNotesView,
  resolveSlugForRecord,
  UnknownRecordError,
  NameEmptySlugError,
  InvalidRecordIdError,
} from '@/lib/server-services';
```

Replace the `notesTree` block:

```ts
  const notesTree = notesSlug
    ? await renderNotesSection(
        await readTalkBody(toTalkSlug(notesSlug)),
        (await getCachedList()).index,
      )
    : null;
```

with:

```ts
  const notes = notesSlug
    ? await buildNotesView(
        await readTalkBody(toTalkSlug(notesSlug)),
        (await getCachedList()).index,
      )
    : [];
```

And the panel call:

```tsx
        {notesSlug ? (
          <ResearchNotesPanel slug={notesSlug} notes={notes} />
        ) : null}
```

- [ ] **Step 3: Typecheck the whole package**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run the frontend test suite**

```bash
cd /Users/nyetwork/dev/whoami/frontend
npm test
```

Expected: pre-existing tests pass + the `lib/note-id.test.ts` from Task 6.

- [ ] **Step 5: Smoke-test the UI**

Start the dev server:

```bash
cd /Users/nyetwork/dev/whoami/frontend
npm run dev
```

In a browser, open a person page (e.g. `http://localhost:3001/<slug>`). Verify:

- The Research notes panel renders with structured items.
- Existing legacy bullets show with `by (unknown)` and no edit/delete buttons.
- "Your name" field persists across reloads (set, refresh, see value).
- Add a note → appears with `by <yourname> · just now` and edit/delete on hover.
- Edit a note → bullet text changes, byline gains "edited just now".
- Delete a note → strikes through, dims, "Restore" appears.
- Restore → returns to live state.
- Open `~/whoami/pages/<slug>.talk.md` in your editor; verify the `<!-- note … -->` trailers carry the right fields.

Stop the dev server.

- [ ] **Step 6: Commit panel + add-note-form + page wiring together**

```bash
cd /Users/nyetwork/dev/whoami
git add frontend/components/research-notes/panel.tsx frontend/components/research-notes/add-note-form.tsx frontend/app/[slug]/page.tsx frontend/app/family/tree/page.tsx
git commit -m "feat: structured research-notes panel with edit/delete/restore"
```

---

## Phase 6 · Agent prompt

### Task 23: Update `plugins/whoami/agents/editor.md`

**Files:**
- Modify: `plugins/whoami/agents/editor.md`

- [ ] **Step 1: Edit Phase 0 step 3**

Find the line that begins `**Check the talk page** for prior context:` and append the following sentence to the same paragraph (after the existing "Do NOT delete or rewrite the section; it is an append-only research log." sentence):

```
Each bullet in `## Research notes` may carry a trailing HTML comment of the form `<!-- note id=… by=… kind=… at=… -->` with optional `editedAt`/`editedBy` and `deletedAt`/`deletedBy` fields. Treat the trailer as metadata only and do not include it in drafted prose. Skip any bullet whose trailer carries `deletedAt` — those have been retracted by the user and should not appear in the article. Notes with `kind=agent` are prior research dumps from earlier agent runs; treat them as suggestive but not authoritative.
```

- [ ] **Step 2: Update the CLI reference block**

Find the `note <slug> ...` lines (three lines today) and replace them with:

```
wai note <slug> "text"                   # append a dated research note to <slug>.talk
wai note <slug> --file scratch.md        # ditto, body from file
wai note <slug>                          # ditto, opens $EDITOR with empty buffer
wai note <slug> --edit <id> "text"       # edit an existing note
wai note <slug> --delete <id>            # soft-delete (retract) a note
wai note <slug> --restore <id>           # restore a retracted note
wai note <slug> --list                   # list note ids + previews
wai note <slug> --as-agent "text"        # append, marked kind=agent
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami
git add plugins/whoami/agents/editor.md
git commit -m "docs: editor agent prompt for note trailers and retraction"
```

---

## Phase 7 · Final verification

### Task 24: Cross-package verification

**Files:** none (verification only).

- [ ] **Step 1: Core**

```bash
cd /Users/nyetwork/dev/whoami/core && npm test && npx tsc --noEmit
```

Expected: all tests pass, 0 type errors.

- [ ] **Step 2: CLI**

```bash
cd /Users/nyetwork/dev/whoami/cli && npm test && npm run typecheck
```

Expected: all tests pass, 0 type errors.

- [ ] **Step 3: Frontend**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm test && npx tsc --noEmit
```

Expected: all tests pass, 0 type errors.

- [ ] **Step 4: End-to-end CLI smoke**

With the dev server running:

```bash
cd /Users/nyetwork/dev/whoami/cli
WHOAMI_AUTHOR_NAME=steven npm run dev -- note <some-existing-slug> "smoke-test note"
# Capture the printed id (n_xxxxxxxx)
WHOAMI_AUTHOR_NAME=steven npm run dev -- note <some-existing-slug> --list
WHOAMI_AUTHOR_NAME=steven npm run dev -- note <some-existing-slug> --edit n_xxxxxxxx "smoke-test edited"
WHOAMI_AUTHOR_NAME=steven npm run dev -- note <some-existing-slug> --delete n_xxxxxxxx
WHOAMI_AUTHOR_NAME=steven npm run dev -- note <some-existing-slug> --restore n_xxxxxxxx
WHOAMI_AUTHOR_NAME=editor-bot npm run dev -- note <some-existing-slug> --as-agent "agent-tagged dump"
```

Verify:

- Each command prints the expected confirmation line.
- `git log -p ~/whoami/pages/<slug>.talk.md` shows one commit per state change with the right summaries (`note: 2026-…`, `note: edit …`, `note: retract …`, `note: restore …`).
- The talk file has trailers in canonical field order, the agent note carries `kind=agent`, and the deleted note's trailer has `deletedAt`/`deletedBy`.

- [ ] **Step 5: No commit needed.**

---

## Done

The feature ships when:

- All Phase 1–6 tasks are committed on the working branch.
- All three packages pass `npm test` and typecheck.
- The end-to-end CLI smoke loop in Task 24 succeeds against the live dev server.
- The browser smoke test in Task 22 step 5 is satisfied.

History view UI, auth integration, adopt-legacy affordance, permission rules, and agent-attribution UX are all out of scope (see "Future-not-now" in the spec).
