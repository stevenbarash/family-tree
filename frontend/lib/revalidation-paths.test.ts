import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localePathsForSlug } from './revalidation-paths';
import { routing } from '../i18n/routing';

test('localePathsForSlug builds one /<locale>/<slug> path per locale', () => {
  assert.deepEqual(
    localePathsForSlug('moshe-margolis', ['en', 'ru', 'uk', 'he']),
    [
      '/en/moshe-margolis',
      '/ru/moshe-margolis',
      '/uk/moshe-margolis',
      '/he/moshe-margolis',
    ],
  );
});

test('localePathsForSlug covers every configured locale with a prefixed path', () => {
  // localePrefix is "always" (i18n/routing.ts) — every locale, including
  // the default, is prefixed. If that ever changes this assertion breaks.
  const paths = localePathsForSlug('x', routing.locales);
  assert.equal(paths.length, routing.locales.length);
  for (const locale of routing.locales) {
    assert.ok(paths.includes(`/${locale}/x`), `expected a /${locale}/x path`);
  }
});

test('localePathsForSlug returns nothing for an empty locale list', () => {
  assert.deepEqual(localePathsForSlug('x', []), []);
});
