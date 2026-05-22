import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { renderMarkdown } from './render';
import { buildSlugIndex } from './wikilinks';

// Full `infoboxPerson` block so next-intl logs no missing-key warnings —
// with no derived record the component only reaches `eyebrow`, but the
// rest keeps the test output pristine. `as const` makes the literals
// match the strict generated message-catalog type.
const messages = {
  Directives: {
    infoboxPerson: {
      eyebrow: 'Person',
      born: 'born',
      died: 'died',
      parents: 'parents',
      spouses: 'spouses',
      children: 'children',
      residences: 'residences',
      work: 'work',
      lifespanBornDied: '{birth} – {death}',
      lifespanBornOnly: 'b. {year}',
      lifespanDiedOnly: 'd. {year}',
    },
  },
} as const;

async function renderArticle(body: string, portrait?: string): Promise<string> {
  const tree = await renderMarkdown(body, buildSlugIndex([]), { portrait });
  // `timeZone` is set so next-intl doesn't emit an ENVIRONMENT_FALLBACK
  // warning about markup mismatch risk in the no-window test runtime.
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

test('renderMarkdown: infobox-person renders the page portrait as an image', async () => {
  // The article subject's infobox must surface the page's `portrait:`
  // frontmatter. Without it the reader gets only monogram initials —
  // the bug this wiring fixes (portrait reaches the tree, not the article).
  // Match the file in any `<img>` attribute: `next/image` URL-encodes the
  // path into `srcSet`/`src` as `%2Fassets%2Fportraits%2F…jpg`, and a
  // future contingency fallback would put it back in a plain `src="…"`.
  const html = await renderArticle(
    ':::infobox-person\n:::',
    '/assets/portraits/boris-ayzman.jpg',
  );
  assert.match(html, /<img[^>]+boris-ayzman\.jpg/);
});

test('renderMarkdown: infobox-person omits the portrait image when the page has none', async () => {
  // No portrait frontmatter → fall back to the initials monogram,
  // never an empty or broken <img>.
  const html = await renderArticle(':::infobox-person\n:::');
  assert.doesNotMatch(html, /\/assets\/portraits\//);
});
