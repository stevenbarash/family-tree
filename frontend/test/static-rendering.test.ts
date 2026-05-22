// Rendering-strategy verification for the two hot [locale]/* routes.
//
// The 2026-05-22 frontend-performance work moved article pages off
// `force-dynamic` onto on-demand ISR (`export const revalidate`), and
// dropped the now-redundant `force-dynamic` from `family/tree` (it is
// dynamic regardless — it reads searchParams). These source-level
// assertions are the canary: they fail loudly if `force-dynamic` is
// reintroduced on `[slug]`, which would silently un-cache every article.
//
// Source inspection (not prerender-manifest inspection) is deliberate:
// it runs in `npm test` with no build step and pins the exact intent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '[locale]');
const read = (rel: string): string => readFileSync(join(appDir, rel), 'utf8');

test('[slug] article route is ISR, not force-dynamic', () => {
  const src = read(join('[slug]', 'page.tsx'));
  assert.doesNotMatch(
    src,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    '[slug]/page.tsx must not be force-dynamic — it should serve from the ISR cache',
  );
  assert.match(
    src,
    /export const revalidate\s*=\s*\d+/,
    '[slug]/page.tsx must export a numeric `revalidate` (the ISR window)',
  );
});

test('family/tree carries no redundant force-dynamic', () => {
  const src = read(join('family', 'tree', 'page.tsx'));
  assert.doesNotMatch(
    src,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    'family/tree is dynamic via searchParams; the explicit force-dynamic was removed',
  );
});
