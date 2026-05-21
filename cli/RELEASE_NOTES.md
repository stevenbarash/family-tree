First stable `cli-v2.0.0` — the v2 `wai` CLI leaves pre-release.

`wai` is the HTTP-client CLI agents (and humans) use to read, write, and
search the family wiki, plus the standalone drift detectors and the
article-pipeline commands. `cli-v2.0.0-pre.0` / `-pre.1` were the
markdown-era pre-release builds; this is the first stable v2 tag. The
`cli-v1.x` tags predate the v2 architecture and reference removed
commands.

Fixes since `cli-v2.0.0-pre.1`:

- **`wai --version` no longer drifts.** The version was a hand-edited
  `const` that went stale the moment `package.json` was bumped — and
  `wai doctor`'s server/CLI skew check read the wrong number with it.
  It is now sourced from `package.json` at build time.
- **Slug and numeric-flag inputs hardened at the command boundary.**
  `narrative`, `transcribe`, `interview`, `author`, `revert`, and
  `i18n sync` route a positional slug through `toSlug()`, so a
  `../`-bearing value can't escape `$WHOAMI_ROOT` — and
  `wai author "Some Person"` now resolves the same as
  `wai author some-person`. `i18n sync` / `i18n status` build their
  `git log` calls with `execFileSync` (no shell). `--limit`,
  `--recent`, `--questions`, and `--parallel` reject negative and
  non-numeric values instead of passing them through.

The bundled binary is otherwise identical to `cli-v2.0.0-pre.1`.

See [CHANGELOG.md](../CHANGELOG.md#cli-v200--2026-05-21) for the
project-wide entry list captured under this release.
