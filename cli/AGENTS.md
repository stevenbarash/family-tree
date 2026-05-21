# cli/

The `wai` command-line tool — the surface agents use to interact with the
wiki. When an editor agent (Claude, Codex, etc.) writes a page, it does so
by shelling out to `wai write <slug>`. When it researches a topic, it runs
`wai read` and `wai search` (sources are now conventional pages whose slug
starts with `source-`, e.g. `wai read source-whatsapp`). Keeping the agent
surface behind a CLI (rather than an in-process library) means any harness
can drive it without specific bindings.

## Commands

| Command               | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `read`                | Read a page; body to stdout, `--json` for the full record.           |
| `write`               | Overwrite a page (idempotent); body from `--file`, `--stdin`, or positional. Requires `--summary`. |
| `create`              | Create a new page (refuses if exists).                               |
| `edit`                | Open a page in `$EDITOR`.                                            |
| `note`                | Append a dated research note to `<slug>.talk`; also `--edit`, `--delete`, `--restore`, `--list`. `--kind` tags human/agent/interview/research/transcript. |
| `delete`              | Soft-delete a page (moves to `_archived/`).                          |
| `search`              | Search title/body/aliases/categories + GEDCOM-derived fields. `--include-living` opts back into restricted records (default-hidden by the privacy gate). |
| `redlinks`            | List unwritten pages other pages link to, ranked by inbound link count. |
| `export`              | Emit a copy of `genealogy/derived/` under `--out <dir>`. With `--redact-living`, restricted records are reduced to initials + birth year. Standalone — does not call the API. |
| `author`              | Run the 7-phase authoring pipeline for a slug (gather → research → outline → draft → verify → log). `--cohort missing\|file:F` batches it; `--no-web`, `--skip-episodes`, `--resume`, `--dry-run`. |
| `revert`              | Undo a pipeline run for a slug — the whole run, a specific `--run`, a single `--phase`, or `--last`. |
| `history`             | Show pipeline-relevant commits for a page; `--recent N` lists across all slugs. |
| `sync-gedcom`         | Re-derive `genealogy/derived/*.yml` from a `.ged` file.              |
| `recite`              | Report or advance stale snapshot pointers in pages.                  |
| `migrate`             | Apply pending page-schema migrations (after a `CURRENT_SCHEMA_VERSION` bump). `--dry-run`, `--page`. |
| `rebuild-search`      | Rebuild the search index from disk (use after editing pages outside the API). `--check` exits non-zero if stale. |
| `check`               | Run drift detectors against the data repo at `$WHOAMI_ROOT`. `--fix` applies safe normalizations. Standalone — does not call the API. |
| `audit dates`         | List ambiguous slash dates (m/d/y vs d/m/y) across the GEDCOM, derived records, and prose. Exits 1 on any finding. Standalone. |
| `grep-claims`         | Find a phrase across pages, talk pages, and source transcripts — the first step of a factual correction. Standalone. |
| `promote-corrections` | Promote a frontmatter correction into the GEDCOM. Standalone.        |
| `i18n`                | `status` lists per-(slug × locale) translation state; `sync <slug> <locale>` translates a page into a locale. |
| `narrative`           | Edit or create a page's `.narrative.md` sidecar.                     |
| `transcribe`          | Transcribe audio via OpenAI Whisper, appended as a research note on `<slug>.talk`. |
| `interview`           | Generate Q&A questions via the harness; captures answers as `kind=interview` notes. |
| `init`                | Install pre-commit hook + CI workflow into `$WHOAMI_ROOT`. Standalone — does not call the API. |
| `healthz`             | Ping the API.                                                        |
| `config server`       | Set the server URL in `~/.whoami/config.json`.                       |
| `doctor`              | Diagnose dev-env health: server reachability + port discovery, workspace presence, version skew. `--fix` auto-corrects the configured server URL when an alternative wai server is reachable. Standalone for the workspace checks; talks to the API for reachability. |

The CLI is an HTTP client — it talks to the frontend's API routes (or
any other host that implements the same surface). The host runs locally;
the CLI is agent-callable.
A new class of "quality" commands (starting with `check`) runs standalone against `$WHOAMI_ROOT` instead of going through the API — this lets them run in pre-commit hooks and CI where no frontend is available. The `promote-corrections` and `init` commands follow the same standalone pattern.

## Build and test

```bash
npm test                                  # tsx --test "test/**/*.test.ts"
npm run typecheck                         # tsc --noEmit
npm run dev -- read steven-barash         # iterate locally with tsx
npm run build                             # esbuild bundle → dist/wai.cjs
```

The published binary is a single CommonJS bundle. Keep dependencies thin
— `wai` ships as one file and gets installed onto users' machines via
the install script in the README.

## Running `wai` locally

Most commands (`read`, `write`, `search`, `sync-gedcom`, `note`, …) are
HTTP clients. They need the frontend server up:

```bash
cd ~/dev/whoami/frontend && npm run dev      # serves on :3001
```

**Mutating commands also need auth *off*.** `wai`'s `ApiClient` is a
plain HTTP client with no login step — it never sends a Descope session.
With the frontend running `WHOAMI_AUTH=on`, every mutating route
(`write`, `note`, `author`, `sync-gedcom`, `migrate`, …) returns `HTTP
401: unauthorized` while reads keep working, so the failure looks
puzzling — and `wai author` hits it mid-run, right after the research
phase. For local CLI work, leave `WHOAMI_AUTH` unset in
`frontend/.env.local` (its default); `=on` is for the Render replica,
where edits arrive through the browser login.

The CLI's default server URL is `http://localhost:3001` — same port the
frontend script pins. If they ever drift, run `wai doctor` (or `wai
doctor --fix` to auto-update the configured URL to whatever wai server
is actually responding on localhost). For manual override:

```bash
wai config server http://localhost:<actual-port>
```

or by setting `WHOAMI_SERVER`. You can also run `wai config server` with
no argument to see what URL `wai` is currently pointed at.

The standalone commands (`check`, `init`, `promote-corrections`) work
without the server — they read `$WHOAMI_ROOT` directly.

`sync-gedcom` requires `--ged-file <filename>` (just the filename, e.g.
`barash-tree.ged`; the server resolves it under `genealogy/`).

## Conventions

- **Commands are one file each** under `src/commands/<name>.ts`,
  exporting a `run<Name>` function. Add a new command by adding a file
  + wiring it into `src/index.ts`.
- **Output to stdout is parseable** — agent harnesses pipe `wai`'s
  stdout into other tools. Don't decorate it with progress chatter
  (use stderr if you need that).
- **Exit codes matter** — non-zero on any failure, with a one-line
  human-readable error to stderr.
- **Don't break the existing flag surface** without bumping the major
  version. Agents in the wild are calling `wai` with specific flags;
  silent breakage is bad.
- **Drift detectors are wired in `src/index.ts`** and live in
  `@core/checks/<category>-drift.ts`. A single detector can emit
  findings of multiple categories (see `places-drift.ts` — schema /
  coverage / data). When adding one, also add a test alongside the
  others in `core/test/checks/`. The data-quality invariants the
  detectors enforce are documented in the data repo's `AGENTS.md`.

## Release

Release commits look like `release: cli-v1.1.0` and are typically
automated. Update `RELEASE_NOTES.md` ahead of the bump.

## Pitfalls

- The CLI is the **agent contract**. Anything that's hard to discover,
  that prints inconsistent output across versions, or that has
  ambiguous error messages will degrade eval scores in `evals/`.
- Don't let `wai` know about host-specific implementation details.
  The server's API surface should be the same shape across hosts;
  if it isn't, that's a server bug, not a CLI workaround.
- **`src/api-client.ts` mirrors the frontend's API response shapes
  by hand — there is no shared type.** Each `ApiClient` method types
  its return to a `frontend/app/api/**/route.ts` JSON body, but
  nothing links the two — `tsc` can't catch a drift, since the CLI
  never imports the route. A changed route response silently breaks
  the consuming command at runtime. When a route's JSON shape
  changes, update the matching `api-client.ts` method in the same
  change.
