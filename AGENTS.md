# whoami.wiki

> A family-tree wiki, written by AI agents.

## What this project is

whoami.wiki turns a family tree (GEDCOM) into a browseable encyclopedia
of the people, places, and events on it. The wiki is **private**,
**local-first**, and **agent-authored**.

The project has two halves:

1. **The family tree.** `/family/tree` is the spine — an interactive
   browser of ancestors, descendants, siblings, cousins, lifespans, and
   birthplaces, joined from a GEDCOM file plus per-individual derived
   records. `/family` is the line summary view.
2. **The articles.** Wiki pages about the people on the tree (and the
   places and events they were part of). An agent — Claude Code, Codex,
   OpenCode — reads the GEDCOM-derived data and any user-supplied
   research notes, then writes encyclopedia pages that link back to the
   tree and cite their sources.

Articles and tree are joined: a person on the tree links to their
article; an article's infobox renders from the same derived GEDCOM data
the tree uses. Editing one is editing the other.

The design hypothesis is that LLMs already know the wiki form deeply
(Wikipedia is in their training data), so the format is a natural medium
for organizing genealogy that an agent can produce well and a human can
browse intuitively.

## Repository layout

This is a monorepo with several packages, each with its own `AGENTS.md`
covering local conventions:

| Package          | What it is                                                                       |
| ---------------- | -------------------------------------------------------------------------------- |
| `core/`          | Platform-agnostic logic. GEDCOM ingestion, the family graph (ancestors, descendants, cohort, relationship calc), page parsing, search. Pure TypeScript, no React, no I/O above the function boundary. |
| `frontend/`      | Next.js 16 (App Router) renderer. Hosts `/family/tree` (the interactive tree), article pages at `/[slug]`, the family-line summary `/family`, and `/search`. |
| `cli/`           | The `wai` CLI — the surface agents use to read, write, and search articles. |
| `plugins/whoami/`| The agent extension. Skills, agent definitions, and editorial guides that load when an agent is writing or revising articles. |
| `evals/`         | Eval suite for benchmarking agent harness × model quality on article authoring. |
| `tools/`         | One-off migration helpers (wikitext-to-md, wiki-preview) and editorial helpers (`tools/ocr/` for local Tesseract OCR of source-document images in 22 languages). |
| `pages/`         | Sample/demo articles checked into the repo. |
| `docs/`          | Design notes and implementation plans. |

## Where the data lives

The wiki's actual content is **outside this repo**, in `$WHOAMI_ROOT`
(default: `~/whoami`). That directory is its own git repo and contains:

```
~/whoami/
├── genealogy/
│   ├── *.ged                GEDCOM source files (the tree)
│   ├── derived/             one .yml per individual, parsed from GEDCOM
│   ├── places-coords.yml    curated lat/lon for the birthplaces map
│   └── snapshots.yml        append-only log of GEDCOM imports (hash + date)
├── pages/                   articles (markdown + frontmatter), plus _archived/
├── assets/
│   └── portraits/           per-person portrait JPGs, referenced by article infoboxes
├── data/                    runtime state — search.idx.json, sessions.db, users.json
└── research-plans/          open genealogical questions for the agent / user
```

`genealogy/` is the input that defines the project: every person, place,
and event the wiki can describe ultimately traces back to it. `pages/`
is the output — the prose articles an agent has written about entries
on the tree. There is roughly one article per significant individual
plus one per family group; `derived/` has one record per individual in
the GEDCOM (a superset of `pages/`, since not every individual gets an
article).

When you're editing code in this repo, **don't `git add -u`** — there is
almost always in-progress data work in the user's checkout that shouldn't
be swept into a code commit. Stage specific files explicitly.

The data repo is separate from this code repo. They evolve independently.

### User data vs. project data — the stranger test

Whether something belongs in this code repo or in `$WHOAMI_ROOT` isn't
a question of "what kind of data" — it's a privacy question. Apply the
**stranger test**: *could I show this file to a stranger without
revealing anything about the user?*

If the file's contents, structure, or the *fact that particular entries
exist* would tell a stranger about the user's life, family, places, or
relationships — it's user data. Stays in `$WHOAMI_ROOT`, even if every
individual value is impersonal.

The canonical example is `genealogy/places-coords.yml`. Every coordinate
is universal geography (Kyiv is at 50.45, 30.52 regardless of whose
family is from there), but the *list* of which places appear is "places
this user's ancestors lived." The file as a whole reveals user-life
information. It's user data.

Project-data candidates are things that aren't keyed on the user at all:
synthetic test fixtures (an invented family used by unit tests), schema
definitions, default UI strings, taxonomy definitions that aren't
user-derived.

When in doubt, lean towards user data. The cost of two-repo coordination
is the price of an honest privacy boundary.

## Tech and conventions

### Tests run via `tsx --test`

All packages use Node's built-in test runner via the `tsx` loader:

```bash
cd core && npm test          # tsx --test "test/**/*.test.ts"
cd frontend && npm test      # tsx --test "lib/**/*.test.ts"
```

Targeted run for one file: `npx tsx --test path/to/file.test.ts`.
Tests use `node:test` and `node:assert/strict` — not Jest, Vitest, or Bun.

### Code style

- **TypeScript everywhere**, with `tsc --noEmit` as the typecheck gate.
- **Pure logic in `core/`**: no React, no I/O above the function boundary.
  Tests pass in `Map<string, DerivedRecord>` rather than reading files.
- **Frontend is Next 16** with breaking changes from earlier versions —
  read `frontend/AGENTS.md` and `node_modules/next/dist/docs/` before
  writing Next code from training-data instinct.
- **No auth in `frontend/`** — Tailscale ACLs are the access layer.
- **Information density preferred** in UI — the audience is people
  scanning and comparing genealogy data; Apple-style sparseness is wrong
  here. No page-bg tints (parchment/sepia/gradients), drop caps, or
  noise overlays. Creativity in type and layout is fine; tinting page
  chrome is not.

### Commit messages

Conventional commits, lowercase subject after the type prefix, no scope,
imperative mood, under ~72 chars, no trailing period.

```
type: short description (#PR)
```

Types: `feat`, `fix`, `chore`, `release`.

```
feat: support inline audio/video players (#29)
fix: harden write command and improve cli error reporting (#30)
chore: tighten cli error messages (#14)
release: cli-v1.0.6
```

Release commits use `release: <product>-v<semver>` — e.g.
`release: cli-v1.1.0`. Squash-merged PRs end with `(#N)`.

### Versioning

Not every package gets a version number. The rule:

- **Tagged + semver:** `cli/` only. The CLI is the surface other tools
  (and humans) call from outside the repo, so it gets independent
  semver tags (`cli-vX.Y.Z`). Breaking changes bump major.
- **Rolls with the repo:** `frontend/`, `core/`, `plugins/whoami/`.
  These ship together; whatever is on `main` is what runs. Their
  `package.json` `version` fields are placeholders today (`0.1.0`)
  and intentionally unused. Don't bump them in feature PRs.
- **Pre-release placeholder:** `evals/` is `2.0.0-pre.0` to signal
  the v2 markdown-era rewrite is still settling.

The current major version of the project as a whole is **v2**, the
markdown era that began 2026-05-01. The previous major (v1) was the
MediaWiki-coupled era; its CLI tags (`cli-v1.0.x` through
`cli-v1.2.1`) live in git history but reference commands the v2 CLI
no longer supports.

**Cutting a CLI release:**

1. Bump `cli/package.json` `version` to the target.
2. Add a section under `## [Unreleased]` in `/CHANGELOG.md` named for
   the new tag and date; move the appropriate unreleased entries
   under it.
3. Commit with `release: cli-vX.Y.Z` (no body).
4. Tag: `git tag cli-vX.Y.Z && git push --tags`.

**The CLI is currently un-released against v2** — the last published
tag (`cli-v1.2.1`, 2026-03-26) predates the v2 architecture. The
next CLI tag should be `cli-v2.0.0` and should be cut after the
working tree closes (see `docs/ROADMAP.md`).

For everything else: `/CHANGELOG.md` is the unreleased-work surface.
Every PR adds an entry under `## [Unreleased]`; that's what stands in
for a version bump for the rolling packages.

### Plans live in `docs/superpowers/plans/`

For multi-step features, write a plan document at
`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` before touching
code. The plan format (task list with checkboxes, exact code in each
step) is the project's convention.

When you create a plan, **also add a row to
[`docs/superpowers/plans/README.md`](./docs/superpowers/plans/README.md)** —
that's the status index. When you ship a plan, update its status
there. Update the corresponding band in
[`docs/ROADMAP.md`](./docs/ROADMAP.md) at the same time.

### What's in motion

The MediaWiki-based desktop app (formerly `desktop/`) was removed in
commit `b33b9fb` (`chore: remove deprecated desktop app`). The repo is
now web (`frontend/`) + CLI (`cli/`) only. Historical mentions of
`desktop/` in plan docs and release notes are time capsules and should
be left alone.

## Most common pitfalls

- **`git add -u`** — sweeps the user's in-progress data work into your
  commit. Always stage specific files.
- **Assuming the test runner** — it's `tsx --test`, not Bun or Jest.
- **Importing into `core/` from React/Next** — `core/` is platform-
  agnostic on purpose. Frontend joins happen in `frontend/lib/`.
- **Editing `~/whoami/` from this repo** — the data repo is separate;
  changes there should be committed there.
- **Cross-origin dev requests** — `frontend/` is browsed via Tailscale.
  See `frontend/next.config.ts` for the `allowedDevOrigins` config.

## Where to look for more

- **Project scope** (in / out / anti-goals): [`docs/SCOPE.md`](./docs/SCOPE.md).
- **What's planned next**: [`docs/ROADMAP.md`](./docs/ROADMAP.md).
- **What has shipped**: [`/CHANGELOG.md`](./CHANGELOG.md).
- **Plan index** (status of every implementation plan): [`docs/superpowers/plans/README.md`](./docs/superpowers/plans/README.md).
- **Latest assessment**: [`docs/reviews/`](./docs/reviews/).
- Each package has its own `AGENTS.md` with conventions specific to that area.
- Editorial standards for writing articles: the `editorial-guide` skill in `plugins/whoami/`.
- Family graph and date-parsing primitives: `core/src/family/`.
- Active design and implementation plans: `docs/superpowers/`.
