Package-bump release. No CLI source change; the `wai` binary behaves
identically to `cli-v2.0.0-pre.0`.

The release captures an end-to-end dependency refresh:

- TypeScript 5.9 → 6.0.3 across all six packages in the monorepo.
- @types/node 24 → 25, tsx 4.21 → 4.22.3.
- Frontend: next 16.2.6, react 19.2.6, @base-ui/react 1.5.0,
  tailwindcss 4.3.0, lucide-react 1.16, zod 4.4.3.
- tools/wiki-preview: express 4 → 5, remark-directive 3 → 4.
- tools/wikitext-to-md: better-sqlite3 11 → 12.
- ESLint 9 → 10 held back upstream (eslint-config-next bundles an
  older eslint-plugin-react that calls the removed `context.getFilename()`).

Headline benefit: TS 7 readiness. Codebase had zero hits on any TS 6
deprecation, so the eventual `^6.0.0 → ^7.0.0` bump (when TS 7 ships
its ~10× faster native Go compiler) is one-line per package.json.

See [CHANGELOG.md](../CHANGELOG.md#cli-v200-pre1--2026-05-19-package-bump-release)
for the full per-package breakdown, the "Why this matters" rationale,
and the verification results.
