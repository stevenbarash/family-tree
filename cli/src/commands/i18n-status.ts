/**
 * `wai i18n status` — list every (slug × target-locale) pair with its
 * computed translation status (current / stale / review / missing) and
 * the count of unresolved translation-talk entries.
 *
 * Output is a tab-separated table with a header row, designed to be
 * pipeable into grep / sort / awk so an agent can pick the next batch
 * of translations to refresh:
 *
 *     slug<TAB>locale<TAB>status<TAB>unresolved
 *     abby<TAB>ru<TAB>current<TAB>0
 *     abby<TAB>uk<TAB>missing<TAB>0
 *     ...
 *
 * Standalone — reads `$WHOAMI_ROOT/pages/{en,ru,uk,he}/` directly and
 * shells out to `git log -1` to resolve the canonical-EN head SHA per
 * slug. Does not touch the frontend API.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseTranslationTalk,
  computeTranslationStatus,
  TARGET_LOCALES,
} from '@core/i18n/index.ts';
import { parsePage } from '@core/pages/frontmatter.ts';

export interface RunI18nStatusOpts {
  rootDir: string;
  write: (s: string) => void;
}

export async function runI18nStatus(opts: RunI18nStatusOpts): Promise<void> {
  const pagesEnDir = join(opts.rootDir, 'pages', 'en');
  if (!existsSync(pagesEnDir)) {
    opts.write(`pages/en/ not found in ${opts.rootDir}\n`);
    return;
  }

  const slugs = readdirSync(pagesEnDir)
    .filter((f) => f.endsWith('.md') && !f.includes('.talk.'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();

  opts.write('slug\tlocale\tstatus\tunresolved\n');

  for (const slug of slugs) {
    const canonicalSha = getCanonicalSha(opts.rootDir, slug);

    for (const locale of TARGET_LOCALES) {
      const translationPath = join(opts.rootDir, 'pages', locale, `${slug}.md`);
      const talkPath = join(opts.rootDir, 'pages', locale, `${slug}.translation.talk.md`);

      let translationCanonicalSha: string | undefined;
      if (existsSync(translationPath)) {
        try {
          const page = parsePage(slug, readFileSync(translationPath, 'utf8'));
          translationCanonicalSha = page.meta.canonicalSha;
        } catch {
          // Translation file present but unparseable — treat the same
          // as "no canonical SHA recorded" so status falls through to
          // missing/stale. The presence of an unparseable file is its
          // own bug for `wai check` to surface.
        }
      }

      const talkSummary = existsSync(talkPath)
        ? parseTranslationTalk(readFileSync(talkPath, 'utf8'))
        : { unresolved: 0, resolved: 0, entries: [] };

      const status = computeTranslationStatus({
        translationCanonicalSha,
        canonicalHeadSha: canonicalSha,
        unresolvedTalkEntries: talkSummary.unresolved,
      });

      opts.write(`${slug}\t${locale}\t${status}\t${talkSummary.unresolved}\n`);
    }
  }
}

function getCanonicalSha(rootDir: string, slug: string): string {
  try {
    // execFileSync (no shell): rootDir and slug are passed as argv
    // entries, so a filename with shell metacharacters can't inject.
    return execFileSync(
      'git',
      ['-C', rootDir, 'log', '-1', '--format=%H', '--', `pages/en/${slug}.md`],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return '';
  }
}
