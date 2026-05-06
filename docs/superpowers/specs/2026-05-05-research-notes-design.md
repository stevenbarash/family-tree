# Research notes on talk pages

> Spec for a low-friction capture surface that lets the user dump
> raw research notes about a person, dated and committed to git,
> which the editor agent later folds into the article body.

## Context

When the user is reading sources, having conversations, or sifting
photos, they regularly pick up small facts about a person on the
tree. Today there's no good place to put those facts. The article
body is the wrong shape (it's structured prose), the talk page is
loosely scoped to "open questions," and `~/whoami/research-plans/`
is for cross-cutting genealogical questions, not per-person notes.

The result is that observations live in chat logs, sticky notes,
and the user's head — and never reach the article.

This spec adds a conventional `## Research notes` section on each
person's talk page, an append-only chronology with auto-dated
entries, and a `wai note <slug>` command that captures one in
seconds.

## Non-goals

- No new file location. Research notes live inside existing talk
  pages (`~/whoami/pages/<slug>.talk.md`); no new directory under
  `~/whoami/`.
- No structured fields. Notes are freeform markdown; no source
  schema, no `source-type=…`, no template. Users hand-write source
  context inline ("Aunt Sally, phone call 2026-05-05") if they want
  it.
- No "incorporated" tracking. Notes stay verbatim in the talk page
  forever; the agent treats the section as read-only source
  material. Users can manually annotate (`→ in article`) if they
  want, but no tooling enforces it.
- No notes UI in the frontend. CLI only for v1.

## Design

### Storage

The talk page (`<slug>.talk.md`) gains a conventional section:

```markdown
## Research notes

### 2026-05-05
- Aunt Sally said grandpa worked at Bell Labs after the war (phone call).
- Found a 1948 Murray Hill directory listing — confirms.

### 2026-05-04
- Photo from Mom's box: grandpa with two kids on a stoop, undated. Brooklyn?
```

Conventions:

- The section heading is exactly `## Research notes` (case-
  sensitive). Detection is heading-text-based; no frontmatter flag.
- Entries within the section are grouped under `### YYYY-MM-DD`
  headings, **newest day first**. Same-day notes share a heading.
- Each note is a markdown bullet (`- text`). Multi-line notes
  use the standard list-continuation indent (two spaces).
- The section sits at the bottom of the talk page; existing talk
  content (open questions, etc.) stays above. If a talk page
  already has content under another `## ...` heading, the section
  appends as a sibling.

History: every `wai note` call commits the talk page (the page
store does this for any write). `git log <slug>.talk.md` is the
authoritative history. No additional tracking layer.

### CLI surface

New command. Input modes mirror `wai write`:

```
wai note <slug> "one-liner text"          # positional
wai note <slug> --file scratch.md         # from file
wai note <slug> --stdin                   # from stdin (or piped)
wai note <slug>                           # opens $EDITOR with empty buffer
```

Slug behavior:

- `wai note grandpa` writes to `grandpa.talk.md`. The CLI maps the
  user-facing slug to the `.talk` slug internally.
- `wai note grandpa.talk` is also accepted (explicit form).
- If the talk page does not exist, the CLI synthesizes a body
  containing the section and the new entry, then PUTs to the
  existing `/api/pages/<slug>` route. The route's existing
  upsert behavior (synthesize default meta when no page on disk)
  handles the new-page case.

No `--summary` flag. The synthesized commit summary is
`note: <YYYY-MM-DD>` (without slug — the file path the commit
touches already identifies the page).

### Body manipulation

Lives in `core/src/pages/research-notes.ts` as a pure function:

```ts
export function appendResearchNote(
  body: string,
  date: string,    // ISO YYYY-MM-DD
  note: string,    // raw note text, may be multi-line
): string
```

Behavior, by case:

| Existing body                                              | Result                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| No `## Research notes` section                             | Append the section at the end, with one `### date` heading and one bullet |
| Section exists, no heading for `date`                      | Insert a new `### date` heading at the top of the section, above existing dated headings |
| Section exists, `### date` heading already present         | Append a new bullet to the end of that heading's bullet list |

The function preserves whitespace conventions of the surrounding
body (blank line above/below the section, blank lines between
date headings). Existing bullets and headings under the section
are not reordered.

Multi-line notes:

- Single-line input → `- text`.
- Multi-line input → first line as the bullet, subsequent lines
  indented two spaces (standard markdown list-continuation).

### Agent integration

`plugins/whoami/agents/editor.md` gains one paragraph: when
drafting or revising the article for `<slug>`, the editor reads
`<slug>.talk.md`'s `## Research notes` section as additional
source material alongside the GEDCOM-derived record and the prior
article body. Notes are not deleted when used; the section is the
research log.

No code changes in the agent runtime; the editor already calls
`wai read <slug>.talk` when researching, and the section appears
inline in the body it gets back.

## Affected files

| File                                                  | Change                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| `core/src/pages/research-notes.ts`                    | New: pure `appendResearchNote` function            |
| `core/src/pages/index.ts`                             | Re-export                                           |
| `core/test/pages/research-notes.test.ts`              | New: tests for the three branches + multi-line     |
| `cli/src/commands/note.ts`                            | New: `runNote` orchestration                       |
| `cli/src/index.ts`                                    | Wire `note` into the dispatch + help text          |
| `cli/test/note.test.ts`                               | New: tests against a fake API client                |
| `plugins/whoami/agents/editor.md`                     | One-paragraph addition about the section           |

## Acceptance

- `wai note grandpa "text"` creates `grandpa.talk.md` if absent,
  otherwise appends a dated bullet under today's heading (or a new
  one).
- Same-day calls share the `### date` heading.
- New-day calls insert a new `### date` heading above existing
  dated headings.
- Multi-line notes (via `--file`, `--stdin`, or `$EDITOR`) preserve
  paragraph breaks via two-space indent.
- `git log <slug>.talk.md` shows one commit per `wai note` call.
- `core/` tests cover the three insertion branches; CLI tests
  cover slug resolution (`grandpa` → `grandpa.talk`), all four
  input modes, and the new-page case.

## Future-not-now

- A `--source <url>` flag that prepends a structured citation block
  to the bullet. Skip until research workflow shows it's needed.
- A "mark as incorporated" affordance once notes have been folded
  into the article. Skip until the section grows enough that this
  matters.
- A frontend pane on `/[slug]` that surfaces the research-notes
  section. Skip — CLI is sufficient for the capture loop, and the
  talk page is already linked from the article.
- A `wai note --since <date>` review command to see notes added
  recently across all people. Skip until the user feels the need.
