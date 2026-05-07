# Note edit-history modal

> Surfaces the per-note revision history that already lives in
> `$WHOAMI_ROOT`'s git log. Clicking the inline "edited X ago" byline
> on a research note opens a modal listing every event that has
> happened to that note — created, edited, retracted, restored — with
> timestamps, authors, and prior-text snapshots. Builds on
> `2026-05-06-research-notes-edits-design.md`.

## Context

Each research note already has:

- a stable id stored in an HTML-comment trailer on the bullet
  (`<!-- note id=n_abc12345 by=steven kind=human at=ISO ... -->`)
- a `by` / `at` for create
- `editedBy` / `editedAt` for the **latest** edit only
- `deletedBy` / `deletedAt` for the current soft-delete state

Every note operation (`appendNoteOnDisk`, `editNoteOnDisk`,
`softDeleteNoteOnDisk`, `restoreNoteOnDisk`) goes through
`pages.write(...)` in `core/src/pages/store.ts`, which calls
`addAndCommit(...)`. So **the data repo's git log is already a
complete audit trail**: one commit per operation, structured commit
messages (`note: edit a1b2c3d4ef`, `note: retract …`, `note: restore
…`), and a diff that captures both prior text and trailer state.

What's missing is exposure: the trailer keeps only the most recent
edit, and there is no UI to look further back. Users have to drop to
`git log -p <slug>.talk.md` to find earlier authors and prior text.

This spec adds an in-page modal that reconstructs the full per-note
event chain from git on demand.

## Goals

1. Clicking the existing inline "edited X ago by Y" text on a note
   opens a modal.
2. The modal lists every event for that note — created, edited (each
   one), retracted, restored — newest first.
3. Each row shows event kind, timestamp, and author.
4. Edited and retracted rows can reveal the prior text snapshot
   (verbatim, no diff).
5. New restores get attributed (the route currently doesn't capture
   `by`); old restores show without an author.

## Non-goals

- **Diff rendering.** v1 shows the prior text verbatim. Side-by-side
  or inline diffs can land later.
- **Cross-request caching.** Modal-open recomputes from git each
  time. Talk pages are small.
- **Retroactive author recovery.** Legacy notes (pre-trailer) and
  pre-spec restores have unknown authors. The modal shows them with
  `(unknown)` rather than fabricating.
- **History on never-edited notes.** No clickable affordance for
  notes that have never been edited or retracted. Adding a
  hover-only "history" button is out of scope.
- **Pagination.** All events render at once.

## Architecture

Three layers, matching the project's existing split:

```
core/src/pages/research-notes-history.ts   (pure)
        ▲
        │ takes ordered body snapshots, returns NoteEvent[]
        │
frontend/lib/note-history.ts                (boundary)
        ▲
        │ enumerates commits via simple-git, fetches bodies via
        │ `git show <commit>:<path>`, feeds them to the pure layer
        │
frontend/app/api/notes/[slug]/[id]/history/route.ts   (API)
        ▲
        │ GET → NoteEvent[] JSON
        │
frontend/components/research-notes/note-history-dialog.tsx   (UI)
        + change in note-item.tsx to make the byline clickable
```

### `core/src/pages/research-notes-history.ts` (pure)

```ts
export type NoteEventKind = 'created' | 'edited' | 'retracted' | 'restored';

export interface NoteEvent {
  kind: NoteEventKind;
  at: string | null;          // ISO-8601 UTC; null for legacy create
  by: string | null;          // null for legacy / unattributed restore
  prevText?: string;          // present on 'edited' and 'retracted'
}

export interface NoteVersion {
  body: string;               // talk-page body at this commit
  commitId: string;           // for telemetry / debugging
  commitTime: string;         // ISO-8601 UTC, used as restore timestamp
  commitAuthor: string;       // git author.name; used as restore by-name
}

/** Walk versions oldest→newest, emit events whenever the note
 *  matching `noteId` changes state. Returns events newest-first. */
export function reconstructNoteHistory(
  versions: NoteVersion[],
  noteId: string,
): NoteEvent[];
```

State machine on consecutive snapshots:

| Previous note state | Current note state | Emit |
| --- | --- | --- |
| absent | present | `created` (trailer `at` / `by`; both `null` if legacy) |
| present, text X | present, text Y, X≠Y | `edited` (trailer `editedAt` / `editedBy`; `prevText`=X) |
| present, not deleted | present, deleted | `retracted` (trailer `deletedAt` / `deletedBy`) |
| present, deleted | present, not deleted | `restored` (trailer `restoredAt` / `restoredBy` if present, else commit time and `null`) |

`prevText` is emitted **only on `edited`** events. Retracted and
restored don't change the bullet text, so a snapshot would just
duplicate the current text.

If a single commit advances multiple state dimensions (e.g. text and
deletion both change in one commit, or trailer absent → trailer
present mid-history), emit each derivable event in canonical order:
created → edited → retracted/restored.

The function is pure: no I/O, no clock. All inputs come from the
caller. Tested with inline body snapshots in
`core/test/pages/research-notes-history.test.ts`.

### `frontend/lib/note-history.ts` (boundary)

```ts
export async function loadNoteHistory(
  talkSlug: string,
  noteId: string,
): Promise<NoteEvent[]>;
```

1. Resolves the talk file path under `WHOAMI_ROOT/pages/`.
2. Uses `simple-git`'s `log({ file })` to enumerate commits touching
   that file, oldest-first.
3. For each commit, runs `git.show([\`${hash}:${relPath}\`])` to read
   the body at that commit. Failures (e.g. file didn't exist yet)
   yield empty body.
4. Maps each commit to a `NoteVersion` (body + commit metadata).
5. Calls `reconstructNoteHistory(versions, noteId)`.
6. Returns the result.

Lives next to `frontend/lib/server-services.ts` so other server
code can call it. Not exported to client components.

### API: `GET /api/notes/[slug]/[id]/history`

```
GET /api/notes/<slug>/<id>/history
→ 200 { events: NoteEvent[] }
→ 400 { error: 'bad-slug' | 'bad-note-id' }
→ 404 { error: 'note-not-found' }   // no events found at all
→ 500 { error: 'history-failed' }
```

Slug accepts both article and talk forms (consistent with existing
`/api/notes/[slug]` routes; resolves via `toTalkSlug`). Note-id
regex matches the existing `/^n_[0-9a-z]{8}$/`.

### Restore attribution (small in-scope fix)

Today `POST /api/notes/[slug]/[id]/restore` ignores the body, and
`restoreNoteOnDisk` doesn't take a `by`. Result: future restores
have no recorded author either.

Changes:

1. Restore route accepts an optional `{ by: string }` body, validated
   with the same regex as the other routes.
2. `restoreNoteOnDisk(slug, id, restorer)` writes
   `restoredBy=<name>` and `restoredAt=<ISO>` onto the trailer.
   These persist on the trailer (no transient/clear dance). Trailer
   bloat is bounded — one extra k=v pair per ever-restored note —
   and the persistent record means no special handling on reads.
   A subsequent retract clears them; a subsequent restore overwrites
   them with the new event's values.
3. `restoreResearchNote` in `core/` gains `restorer` and `restoredAt`
   parameters and writes them to the trailer; `softDeleteResearchNote`
   clears any pre-existing `restoredBy` / `restoredAt` so the trailer
   reflects the latest event.
4. Client `note-item.tsx` passes `by: localStorage.getItem('whoami:author')`
   to the restore endpoint, mirroring DELETE.

Pre-spec restores remain unattributed in the modal.

### UI

**`note-item.tsx` change.** When `note.editedAt` is truthy, wrap the
"edited X ago by Y" span in a `<button>` (`type="button"`,
`className` styled to look like a link, focus ring) that opens
`<NoteHistoryDialog />` with `slug` and `noteId` props. State for
the open/closed dialog lives in `NoteItem`.

**`note-history-dialog.tsx` (new).** Built on the existing shadcn
`Dialog` primitive (already used by the command palette). Component
shape:

```tsx
'use client';
interface Props {
  slug: string;
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
export function NoteHistoryDialog(props: Props) { ... }
```

- On first `open=true`, fetches `/api/notes/<slug>/<noteId>/history`.
- Renders states:
  - **loading** — small "Loading history…" line
  - **error** — error string, with a "Retry" button
  - **loaded** — event list, newest first
- Each row:
  - badge with event kind ("created" / "edited" / "retracted" / "restored")
  - relative + absolute timestamp (`title="2026-05-07T14:32:11Z"`)
  - "by NAME" or italicized "(unknown)"
  - For `edited` and `retracted` rows: a `<details>` with summary
    "Show snapshot" → reveals `<pre>` of `prevText`
- Closes via shadcn `Dialog` chrome (Esc / outside click / X).
- Does not refetch when reopened in the same session unless the user
  hits the "Retry" button on an error state.

Information-density per project conventions: tight rows, no big
cards. Match the type-scale used in the existing notes panel.

## Data shape (recap)

```ts
type NoteEventKind = 'created' | 'edited' | 'retracted' | 'restored';

interface NoteEvent {
  kind: NoteEventKind;
  at: string | null;
  by: string | null;
  prevText?: string;
}
```

Wire format: `{ events: NoteEvent[] }` newest-first.

## Tests

**Pure** (`core/test/pages/research-notes-history.test.ts`):

- created-only history (one commit; one event)
- single edit (two events; `prevText` matches first version)
- two edits (three events; second `prevText` is the v2 text, not v1)
- retract then restore (events: created, retracted, restored;
  restored event uses trailer `restoredAt` / `restoredBy` when
  present, falls back to commit time + `null` `by` when absent)
- noteId not present in any version → empty array

**Boundary** (`frontend/lib/note-history.test.ts`): one happy-path
test that initializes a temp git repo, writes the talk file in three
commits (create / edit / retract), runs `loadNoteHistory`, asserts
event count and ordering. Uses a tmpdir; cleaned up in `after`.

**API**: covered by manual smoke + the unit test on the loader.
The route is a thin wrapper.

**UI**: covered by manual smoke. Component test infrastructure isn't
established in this repo.

## Edge cases

- **Note created before the spec's restore-attribution lands.** Modal
  shows `restored at TIME`, `by` = `(unknown)`. Fine.
- **First commit doesn't contain the note.** First version with the
  id present is the `created` event.
- **Note id never appears in any version.** API returns 404
  `note-not-found`. UI surfaces "No history for this note."
- **Talk file was renamed.** `simple-git`'s `log({ file, follow:
  true })` follows renames. If we don't enable `follow`, history is
  lost across renames. The implementation plan should set `follow:
  true` from day one — the data repo can rename talk files (e.g.
  during de-duplication).
- **Concurrent edits.** Out of scope. Existing per-talk-slug lock in
  `withTalkLock` already prevents interleaved writes.
- **Huge history.** v1 has no pagination; talk-page commit counts are
  small. If they ever exceed ~500 commits the modal should add a
  "show older" affordance — not now.

## Migration / rollout

No data migration. Pre-existing notes get whatever history git
already records. The trailer format is unchanged for create / edit /
retract; restore gains an optional `restoredBy` / `restoredAt` pair
that older parsers ignore (k=v pairs are forward-compatible).

`parseTrailerAttrs` in `core/src/pages/research-notes.ts` already
ignores unknown keys, and `serializeTrailer` writes a fixed sequence
of known keys, so adding `restoredAt` / `restoredBy` to the
`TrailerAttrs` interface and the serializer's known-key list is the
only change needed for the trailer schema.

## File-level summary

| File | Change |
| --- | --- |
| `core/src/pages/research-notes-history.ts` | new — pure reconstructor |
| `core/src/pages/research-notes.ts` | `restoreResearchNote` signature gains `restorer`, `restoredAt` |
| `core/test/pages/research-notes-history.test.ts` | new |
| `frontend/lib/note-history.ts` | new — git boundary |
| `frontend/lib/note-history.test.ts` | new — temp-repo smoke |
| `frontend/lib/server-services.ts` | `restoreNoteOnDisk` accepts `restorer` |
| `frontend/app/api/notes/[slug]/[id]/restore/route.ts` | accepts `{ by }` body |
| `frontend/app/api/notes/[slug]/[id]/history/route.ts` | new |
| `frontend/components/research-notes/note-item.tsx` | byline becomes a button when history exists; opens dialog |
| `frontend/components/research-notes/note-history-dialog.tsx` | new |
