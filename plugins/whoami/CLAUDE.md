# whoami plugin

This plugin packages skills and agent definitions for editing
[whoami.wiki](https://whoami.wiki) articles. The wiki is a private,
local-first, agent-authored encyclopedia about a family tree (GEDCOM)
and the people, places, and events on it.

## Where to look

- **Editor agent spec**: `agents/editor.md` — workflow for researching
  sources, drafting pages, posting talk-page intent and gaps, and
  publishing.
- **Editorial guide skill**: `skills/editorial-guide/SKILL.md` — page
  type templates (person, episode), editorial standards (documentary
  voice, no editorializing), talk-page structure, and the citation
  directives (`:::cite-message`, `:::cite-voice-note`, `:::cite-photo`,
  `:::cite-video`, `:::cite-vault`).
- **Repo conventions**: top-level `AGENTS.md` of the whoami.wiki repo
  for codebase layout, data location (`$WHOAMI_ROOT`, default
  `~/whoami`), tests (`tsx --test`), and commit conventions.

## CLI surface

Agents drive the wiki via the `wai` CLI. Run `wai help` for the full
list. Most-used commands:

```
wai read <slug>                 # read an article (body to stdout; --json for full)
wai read <slug>.talk            # read its talk page (markdown sibling)
wai search "query"              # full-text over title/body/aliases/categories
                                #   and GEDCOM-derived fields (places, occupations,
                                #   names of related individuals)
wai create <slug> --file F      # create a new page (refuses if exists)
wai write  <slug> --file F      # overwrite (requires --summary)
wai edit   <slug>               # open in $EDITOR
wai note   <slug> [text]        # append a dated research note to <slug>.talk
                                #   --edit <id> | --delete <id> | --restore <id>
                                #   --list | --as-agent
wai sync-gedcom --ged-file F    # re-derive genealogy/derived/*.yml
wai recite [--apply]            # report or advance stale snapshot pointers
```

## Removed in the v2 markdown migration

The pre-v2 surface (when the wiki was a MediaWiki instance and pages
were wikitext) had `task`, `source`, `snapshot`, `talk`, `link`,
`category`, `place`, `upload`, `changes`, `section`, and `auth`
commands. The v2 markdown CLI rejects these with exit code 2. Don't
reach for them — talk pages are now plain `.talk.md` siblings handled
through `wai read` / `wai note`; sources are conventional pages whose
slug starts with `source-`; categories live in page frontmatter.

## How agent work flows

1. The user names a person, episode, or topic.
2. Editor agent reads any existing page (`wai read <slug>`) and the
   talk page (`wai read <slug>.talk`) for prior context, including the
   `## Research notes` section — those are first-class source material.
3. Editor posts intent on the talk page (read → append → `wai write
   <slug>.talk --summary "Working on …"`).
4. Editor researches sources (search, read source pages, follow
   querying recipes for the underlying vault), drafts the page, and
   publishes via `wai create` / `wai write`.
5. Editor logs work and any open gaps as talk-page threads
   (`::open` / `::closed` / `::superseded` / `::gap`).

The editorial guide skill carries the prose conventions (third person,
no editorializing, structured sections, citation directives, category
tags). The editor agent spec carries the procedural workflow.

## Drift checks

After any page edit, run `wai check`. It scans for four categories of drift:

- **format** — date strings, frontmatter fields not in canonical form. Auto-fixable: `wai check --fix --only format`.
- **data** — corrections in page frontmatter that conflict, are redundant, or target unknown records.
- **schema** — pages with frontmatter that needs migration. Auto-fixable: `wai check --fix --only schema`.
- **coverage** — redlinks, unmapped places, derived records without pages. Suggestion-only.

Surface remaining findings in your turn summary. If you introduced new format/schema findings with your edit, run `wai check --fix --only format,schema` to clean them up before reporting back.

The user's data repo may have a pre-commit hook installed via `wai init` — that hook blocks commits with format/schema/data findings (coverage drift is non-blocking). If your edit triggers the hook, fix the underlying drift rather than bypassing the hook with `--no-verify`.
