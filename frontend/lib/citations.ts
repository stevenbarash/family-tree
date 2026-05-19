import { countOpenThreads } from '@core/pages/index.ts';

/**
 * Count open-gap threads in a talk-page body — any level-2 or
 * level-3 heading whose next non-blank line is `::open` or `::gap`.
 * Delegates to the shared parser in core so this count cannot drift
 * from the inline-rendered cards on the article page.
 */
export function countOpenGaps(talkBody: string): number {
  return countOpenThreads(talkBody);
}

/**
 * Count citations in an article body. Conservatively combines two patterns:
 *
 *   1. Markdown footnote definitions — `[^id]: …` (multi-line). Counted by
 *      unique id so a footnote referenced from many sentences still counts
 *      once.
 *   2. Cite directive opens — `::cite-…{` and `:::cite-…{`. These are
 *      counted as instances; a directive used twice is two citations.
 *
 *  Does not parse the markdown — a fenced code block containing the text
 *  `::cite-foo{` would be miscounted, but in practice articles do not put
 *  citation directives inside code blocks.
 */
export function countCitations(body: string): number {
  const footnotes = new Set<string>();
  for (const m of body.matchAll(/^\[\^([a-z0-9-]+)\]:/gim)) {
    if (m[1]) footnotes.add(m[1]);
  }
  const cites = body.match(/:{2,3}cite-[a-z-]+\{/g)?.length ?? 0;
  return footnotes.size + cites;
}
