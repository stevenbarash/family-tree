# Research notes — edits, authorship, soft-delete

> Beefs up the existing research-notes feature with stable per-note
> identity, authorship (human vs. agent), edit support with
> last-edit timestamps, and a wiki-style soft-delete that never loses
> data. Builds on `2026-05-05-research-notes-design.md`.

## Context

The v1 research-notes feature (shipped in commit `719205b`) treats each
note as an unstructured markdown bullet under a `### YYYY-MM-DD`
heading inside the `## Research notes` section of `<slug>.talk.md`.
Append-only by design.

That works for capture but is missing three things the user wants now:

1. **Edits.** A note that turns out to be wrong shouldn't require
   hand-editing the talk page; the UI should let the user revise the
   bullet, with a timestamp on the change.
2. **Who wrote it.** Today there's no way to tell whether a note is
   the user's own observation, a family member's, or — eventually —
   an agent's research dump. As auth lands and as the editor agent
   starts logging its own findings, that distinction matters.
3. **Soft-delete.** Like a real wiki, deleting a note should not
   destroy data. Git already preserves every prior revision; the
   UI's "delete" should be a retraction, not erasure.

This spec adds those three things with the smallest possible
deviation from the existing markdown-as-source-of-truth shape.

## Non-goals

- **No auth in this spec.** Auth will eventually arrive (Tailscale +
  user records under `~/whoami/data/users.json`); when it does, the
  server will overwrite client-supplied `by` from session. Until
  then, `by` is self-attribution.
- **No history-view UI in v1.** Every edit and every soft-delete
  commits the talk page, so `git log -p <slug>.talk.md` already
  contains every revision of every bullet, keyed by stable note id.
  A panel that surfaces this in the browser is future-not-now —
  v1's job is to commit to the data-preservation semantic so v2 can
  land without re-shaping storage.
- **No inline revision log in markdown.** Prior revisions are *not*
  duplicated as `<!-- rev … -->` lines in the file. Git is the
  revision store; the markdown carries only the *current* prose plus
  the latest-edit timestamp.
- **No bulk migration of existing legacy notes.** Bullets already in
  the user's talk pages without trailers stay legible and parseable
  but show as read-only (no edit/delete affordance). Modernization
  happens organically as the user re-adds or re-types.
- **No cross-author permission rules.** Without auth, anyone on the
  Tailnet can edit/delete any note. The trail is captured in the
  trailer (`editedBy`, `deletedBy`); enforcement is a v2 concern
  once auth is in place.

## Design

### Storage shape

Each bullet in the `## Research notes` section gains an HTML-comment
trailer line, indented two spaces so it attaches to the bullet's
list-continuation block. New shape:

```markdown
## Research notes

### 2026-05-06
- Aunt Sally said grandpa worked at Bell Labs after the war.
  <!-- note id=n_5w3kp9aq by=steven kind=human at=2026-05-06T14:23:00Z -->
- Found a 1948 Murray Hill directory listing — confirms.
  <!-- note id=n_b2hf01x4 by=steven kind=human at=2026-05-06T14:30:00Z edited=2026-05-06T16:02:00Z editedBy=steven -->
- Discarded lead about a 1950 Boston listing.
  <!-- note id=n_qm9p7r3z by=steven kind=human at=2026-05-06T15:11:00Z deletedAt=2026-05-06T17:48:00Z deletedBy=steven -->

### 2026-05-04
- Photo from Mom's box: grandpa with two kids on a stoop, undated. Brooklyn?
  <!-- note id=n_v8e3kt5h by=steven kind=human at=2026-05-04T19:02:00Z -->
```

Trailer fields:

| Field        | Set when                | Meaning                                     |
| ------------ | ----------------------- | ------------------------------------------- |
| `id`         | append                  | Stable note id, `n_` + 8 base32 chars       |
| `by`         | append                  | Author string (free-text v1, session v2)    |
| `kind`       | append                  | `human` or `agent`                          |
| `at`         | append                  | ISO-8601 UTC creation timestamp             |
| `editedAt`   | edit                    | ISO-8601 UTC of the **most recent** edit    |
| `editedBy`   | edit                    | Author of the most recent edit              |
| `deletedAt`  | soft-delete             | ISO-8601 UTC; set to mark retraction        |
| `deletedBy`  | soft-delete             | Author of the retraction                    |

Convention notes:

- The trailer is **always the last line of the bullet block**.
  Multi-line note prose uses standard markdown list-continuation
  (two-space indent); the trailer follows the prose lines.
- Field order in the trailer is canonical: `id by kind at` first,
  then `edited`/`editedBy` if present, then `deletedAt`/`deletedBy`
  if present. Stable order keeps git diffs minimal.
- All values are unquoted single tokens. `by` is restricted to
  `[A-Za-z0-9._-]` (no spaces) — display names with spaces are
  resolved by future user records, not stored in the trailer.

### Note id format

`n_` + 8 lowercase base32 characters (Crockford alphabet, no `i l o u`
to reduce ambiguity). Generated server-side at append time. 32^8 =
~10^12 keyspace per talk page; collision-free at any plausible scale.
Server also validates uniqueness within the talk page before writing
(near-zero work since notes are already in memory during the read-
modify-write).

### Author / kind resolution

Resolution chain, server-side, on every write:

| Surface         | `by`                                        | `kind`                            |
| --------------- | ------------------------------------------- | --------------------------------- |
| Web UI          | `localStorage["whoami:author"]` if set, else form input, else `DEFAULT_AUTHOR.name` | hardcoded `human`              |
| CLI (`wai note`)| `WHOAMI_AUTHOR_NAME` env, else `$USER`, else `DEFAULT_AUTHOR.name` | `human`, override with `--as-agent` flag or `WHOAMI_NOTE_KIND=agent` env |
| Server fallback | `DEFAULT_AUTHOR.name` if request omits `by` | `human` if request omits `kind`  |

When auth eventually lands, the server's API route will *ignore*
client-supplied `by` and substitute `session.user.handle`. The
client-side localStorage prompt becomes vestigial and gets removed.
No schema change needed for that transition.

### Edit semantics

`PATCH /api/notes/:slug/:id` rewrites the bullet's prose in place.
Server flow:

1. Acquire the existing per-talk lock (`withTalkLock` in
   `frontend/lib/server-services.ts`).
2. Read the talk page; `parseResearchNotes(body)` to verify the id
   exists and is not soft-deleted.
3. Call `editResearchNote(body, id, newText, editor, now)`.
4. Write the page with summary `note: edit <id-short>`.
5. Return `{ slug, id, editedAt }`.

`editResearchNote` updates the trailer's `editedAt`/`editedBy` to the
*latest* edit and rewrites the bullet text. It does NOT preserve any
prior text inline; git is the revision store.

The day heading (`### date`) is **not** changed on edit. A note's
day-of-record is fixed at creation; subsequent edits don't move it.

Editing a soft-deleted note throws `NoteDeletedError` (HTTP 409). The
caller must restore first.

### Soft-delete semantics

`DELETE /api/notes/:slug/:id` is a **retraction**, not erasure.
Server flow:

1. Acquire the per-talk lock.
2. `parseResearchNotes` to verify the id exists and is not already
   deleted.
3. Call `softDeleteResearchNote(body, id, deleter, now)`.
4. Write the page with summary `note: retract <id-short>`.
5. Return `{ slug, id, deletedAt }`.

`softDeleteResearchNote` adds `deletedAt`/`deletedBy` to the trailer.
**The bullet prose is not mutated** — wrapping in `~~~~` works for
single-line notes but is awkward for multi-line bullets, and we'd
rather have one rule than two. The trailer is the canonical record;
the UI strikes through visually based on the parsed `deletedAt` flag,
and the editor agent prompt is updated to filter notes with
`deletedAt` set (see "Editor agent integration" below). Git captures
the state change because the trailer line itself changed.

`POST /api/notes/:slug/:id/restore` is the inverse. It clears
`deletedAt`/`deletedBy` from the trailer. Commit summary
`note: restore <id-short>`.

Edit history view (deferred): when v2 builds the per-note history
panel, it'll walk `git log -p <slug>.talk.md`, filter commits that
touched lines containing `id=<noteId>`, and reconstruct the bullet
text at each revision. The note id is what makes that lookup
tractable — no bullet-line tracking heuristics needed.

### Legacy bullet handling

Bullets already in talk pages today carry no trailer. The parser
treats them as:

```ts
{
  id: `n_legacy_${dayDate}_${positionInDay}`,  // synthetic, deterministic
  by: '(unknown)',
  kind: 'human',
  createdAt: null,    // unknown beyond the day heading
  editedAt: null,
  deletedAt: null,
}
```

The synthetic id is not a real id — it's stable across renders for
React keys, but not addressable for edit/delete. The UI inspects the
id prefix (`n_legacy_`) and renders these notes read-only.

The user can opt to "modernize" a legacy note by clicking an
"Adopt" affordance (low priority — could be deferred to v2). Adoption
synthesizes a real `id`, sets `by` from the resolution chain, and
sets `at` to now (the user is claiming the note as theirs at the
moment of adoption). This is the only path that *changes* a legacy
bullet; otherwise legacy bullets stay verbatim.

### Concurrency

The existing per-talk-slug lock in `withTalkLock` already serializes
appends. Edits, soft-deletes, and restores share that same lock —
the read-modify-write pattern is identical. No new locking shape.

If two clients edit the same note concurrently, last-writer-wins on
the bullet text; both edits commit (so git log captures both); the
in-file `editedAt`/`editedBy` reflects the later commit.

## Core API (`core/src/pages/research-notes.ts`)

Pure functions, all `body in → body out` plus a parser. The server
generates the id and now-timestamp before calling these so the
functions stay deterministic and unit-testable without a clock or
RNG.

```ts
export interface Note {
  id: string;
  date: string;             // YYYY-MM-DD (the day heading)
  text: string;             // bullet prose, sans "- " prefix and trailer (multi-line preserved)
  by: string;               // "(unknown)" for legacy
  kind: 'human' | 'agent';  // legacy → 'human'
  createdAt: string | null; // null for legacy
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;        // derived from id prefix
}

export interface NewNoteInput {
  id: string;       // generated by caller
  text: string;
  by: string;
  kind: 'human' | 'agent';
  createdAt: string; // ISO-8601 UTC
}

export function parseResearchNotes(body: string): Note[];

export function appendResearchNote(
  body: string,
  input: NewNoteInput,
): string;

export function editResearchNote(
  body: string,
  id: string,
  newText: string,
  editor: string,
  editedAt: string,
): string;

export function softDeleteResearchNote(
  body: string,
  id: string,
  deleter: string,
  deletedAt: string,
): string;

export function restoreResearchNote(
  body: string,
  id: string,
): string;

export class NoteNotFoundError extends Error {}
export class NoteDeletedError extends Error {}     // edit on deleted
export class NoteAlreadyDeletedError extends Error {} // delete on deleted
```

`appendResearchNote`'s contract from the v1 spec is preserved
(newest-day-first, same-day appends to existing heading). The only
behavioral difference is that it now writes a trailer.

`extractResearchNotesSection` (used by the renderer) stays as today;
the trailers are HTML comments and pass through markdown rendering as
no-ops. CSS hides them in browser display.

## API surface (`frontend/app/api/notes/`)

| Method | Path                          | Body                           | Returns                                      |
| ------ | ----------------------------- | ------------------------------ | -------------------------------------------- |
| POST   | `/api/notes/[slug]`           | `{ note, by?, kind? }`         | `{ slug, date, id }`                         |
| PATCH  | `/api/notes/[slug]/[id]`      | `{ note, by? }`                | `{ slug, id, editedAt }`                     |
| DELETE | `/api/notes/[slug]/[id]`      | `{ by? }`                      | `{ slug, id, deletedAt }`                    |
| POST   | `/api/notes/[slug]/[id]/restore` | `{ by? }`                   | `{ slug, id }`                               |

All four routes acquire the per-talk lock, do the read-modify-write,
and commit via the existing page-store. Errors map to typed
responses:

| Error                      | HTTP | `error` field             |
| -------------------------- | ---- | ------------------------- |
| `NoteNotFoundError`        | 404  | `note-not-found`          |
| `NoteDeletedError`         | 409  | `note-deleted`            |
| `NoteAlreadyDeletedError`  | 409  | `note-already-deleted`    |
| Bad slug                   | 400  | `bad-slug`                |
| Bad request body           | 400  | `bad-request`             |
| Anything else              | 500  | `note-failed`             |

## CLI surface (`cli/src/commands/note.ts`)

`wai note` extends with edit/delete/restore modes:

```
wai note <slug> "text"                 # append (existing)
wai note <slug> --file f.md            # append from file (existing)
wai note <slug> --stdin                # append from stdin (existing)
wai note <slug>                        # $EDITOR (existing)
wai note <slug> --edit <id> "text"     # edit
wai note <slug> --edit <id> --file f.md
wai note <slug> --edit <id> --stdin
wai note <slug> --delete <id>          # soft-delete
wai note <slug> --restore <id>         # restore
wai note <slug> --list                 # print id + date + first 80 chars per note (json with --json)
wai note <slug> --as-agent             # tag the write kind=agent (append/edit only)
```

`--list` is the discovery affordance — without it, agents have no
way to find note ids. Output is one line per note:
`<id>  <date>  <first 80 chars>` (deleted notes prefixed `[deleted]`).
`--json` returns the full `Note[]` array.

`--as-agent` and `WHOAMI_NOTE_KIND=agent` are equivalent. The flag
wins. Default is `human`.

## UI changes

### `ResearchNotesPanel`

- Loads `Note[]` via `parseResearchNotes(talkBody)` server-side.
  Renders a structured list (replacing the freeform `renderMarkdown`
  pass for the section).
- Each note shows:
  - bullet prose (markdown-rendered, including wikilinks)
  - byline: `by <author> · <relative time>` (e.g. `by steven · 2h ago`)
  - if edited: `· edited <relative time> by <editor>`
  - if deleted: struck-through prose, dimmed, `· retracted by X · <time>` caption, "Restore" button
  - hover/inline edit and delete icons (only on non-legacy, non-deleted notes; restore on deleted notes)
- Day headings (`### YYYY-MM-DD`) preserved; render as the existing
  small grey subheadings.

### `AddNoteForm`

- Adds a single optional "Your name" text field above the textarea.
  Persists to `localStorage["whoami:author"]` on save. Default value
  loaded from localStorage; empty means "let the server fall back to
  `DEFAULT_AUTHOR.name`".
- POST body now includes `by` (from the field) and omits `kind`
  (server defaults to `human`).

### `EditNoteForm` (new)

- Inline textarea that replaces the rendered bullet when "edit" is
  clicked. Cmd/Ctrl+Enter to save; Esc to cancel.
- On save: PATCH to `/api/notes/<slug>/<id>` with `{ note, by }`.
- "Your name" field also present (pre-filled from localStorage).

### `DeleteNoteButton` and `RestoreNoteButton` (new)

- Trash icon → confirm dialog → DELETE.
- Undo icon (on retracted notes) → POST to `/restore`.

### Server-side join

`renderNotesSection` in `frontend/lib/server-services.ts` is replaced
with `buildNotesView(talkBody, slugIndex): NoteView[]`, where each
`NoteView` is a `Note` plus a pre-rendered `ReactElement` for the
prose. Pre-rendering on the server keeps wikilink resolution out of
the client.

## Editor agent integration

`plugins/whoami/agents/editor.md` gains one paragraph:

> When reading a person's `## Research notes` section as source
> material, each bullet carries an HTML-comment trailer with `id`,
> `by`, `kind`, `at`, and (when applicable) `editedAt`/`editedBy`
> and `deletedAt`/`deletedBy` fields. Treat the trailer as metadata
> only and do not include it in drafted prose. Skip any bullet whose
> trailer carries `deletedAt` — those have been retracted by the
> user and should not appear in the article. Notes with `kind=agent`
> are prior research dumps from earlier agent runs; treat them as
> suggestive but not authoritative.

No code changes in the agent runtime — it already calls
`wai read <slug>.talk` and the section appears inline in the body.

## Affected files

| File                                                  | Change                                                 |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `core/src/pages/research-notes.ts`                    | Extend: trailer parsing/serializing, new functions     |
| `core/src/pages/index.ts`                             | Re-export new types and errors                         |
| `core/test/pages/research-notes.test.ts`              | Extend: parse, edit, soft-delete, restore, legacy     |
| `cli/src/commands/note.ts`                            | Extend: `--edit`, `--delete`, `--restore`, `--list`, `--as-agent` |
| `cli/src/api-client.ts`                               | New methods: `editNote`, `deleteNote`, `restoreNote`, `listNotes` |
| `cli/src/index.ts`                                    | Help text + dispatch                                   |
| `cli/test/note.test.ts`                               | Extend: edit/delete/restore/list/as-agent flows        |
| `frontend/app/api/notes/[slug]/route.ts`              | Extend: accept optional `by`, `kind`                   |
| `frontend/app/api/notes/[slug]/[id]/route.ts` (new)   | PATCH (edit), DELETE (soft-delete)                     |
| `frontend/app/api/notes/[slug]/[id]/restore/route.ts` (new) | POST (restore)                                  |
| `frontend/lib/server-services.ts`                     | New `appendNoteOnDisk` overloads or sibling functions: `editNoteOnDisk`, `softDeleteNoteOnDisk`, `restoreNoteOnDisk`. New `buildNotesView`. New error classes. |
| `frontend/lib/api-errors.ts`                          | Map new error classes to status codes                  |
| `frontend/components/research-notes/panel.tsx`        | Switch to structured `NoteView[]` rendering            |
| `frontend/components/research-notes/add-note-form.tsx`| Add "Your name" field; localStorage persistence        |
| `frontend/components/research-notes/edit-note-form.tsx` (new) | Inline edit affordance                         |
| `frontend/components/research-notes/note-item.tsx` (new) | One bullet's render: prose + byline + actions       |
| `frontend/app/[slug]/page.tsx`                        | Pass `NoteView[]` to the panel                         |
| `frontend/app/family/tree/page.tsx`                   | Same                                                   |
| `frontend/app/globals.css`                            | Hide `<!-- note … -->` comments (defensive; markdown renderers already drop comments) |
| `plugins/whoami/agents/editor.md`                     | One-paragraph addition about retraction + trailer      |

## Acceptance

- New notes append with a complete trailer (`id by kind at`).
- Editing a note in the UI updates the bullet text and records
  `editedAt`/`editedBy`; the day heading does not change.
- Soft-deleting a note adds `deletedAt`/`deletedBy` to the trailer
  (no prose mutation); the UI renders it struck-through and dim.
  Restore clears both fields.
- `git log -p <slug>.talk.md` shows one commit per state change,
  every prior bullet text recoverable by id.
- Legacy bullets parse without crashing, render read-only, and have
  no edit/delete buttons.
- `wai note <slug> --list` prints one line per note with id + date +
  preview; `--json` returns the structured array.
- `wai note <slug> --edit <id> "new text"` rewrites the bullet
  in place and sets `editedAt`; `--delete <id>` and `--restore <id>`
  flip the deletion state.
- Concurrent edits to the same note serialize via the per-talk lock;
  both commits land in git.
- `core/` tests cover parse (new + legacy), append (trailer
  shape), edit, soft-delete, restore, and the
  `NoteNotFound`/`NoteDeleted`/`NoteAlreadyDeleted` error paths.
- CLI tests cover all new flag combos against a fake API client.

## Future-not-now

- **History view UI.** `git log -p <slug>.talk.md` filtered by id
  surfaced as an inline panel per note. Data is already preserved;
  only a renderer is missing.
- **Auth integration.** When user records and Tailscale-tied sessions
  land, the API routes overwrite client-supplied `by` with
  `session.user.handle`. Trailer schema doesn't change.
- **Adopt-legacy affordance.** A button on legacy bullets that
  synthesizes a real id and `by` so the user can edit/delete
  retroactively. Skip until the user feels the friction.
- **Permission rules.** Once auth lands, edit/delete restrictions
  (e.g., only the original author + admins). Not in v1.
- **Agent attribution UX.** A subtle visual treatment for `kind=agent`
  notes (smaller font, distinct color) once the editor agent starts
  logging.
