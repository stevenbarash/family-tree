// Rendering-strategy verification for the two hot [locale]/* routes.
//
// The 2026-05-22 frontend-performance work (#17) tried to move article
// pages onto on-demand ISR (`export const revalidate = 60`). That was
// reverted: the shared `[locale]` layout hydrates next-intl's client
// provider, which calls `headers()`, so `[slug]` can never render
// statically. Tagging it ISR made Next attempt a route cache and throw
// `DYNAMIC_SERVER_USAGE` at request time on the auth-on Render deploy —
// a 500 on every article page. The route MUST be `force-dynamic`.
//
// NOTE on the limits of this test: it inspects source text only, so it
// can prevent the known-bad `revalidate` tag from coming back, but it
// canNOT catch `DYNAMIC_SERVER_USAGE` itself — that needs an actual
// render. The original ISR regression shipped green precisely because a
// source-regex test never renders, `next dev` ignores ISR, and the build
// silently downgrades to dynamic (only `dynamic = 'error'` makes it
// throw, naming `headers()`). If ISR is ever revisited, verify with a
// production build + request, not just this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '[locale]');
const read = (rel: string): string => readFileSync(join(appDir, rel), 'utf8');

test('[slug] article route is force-dynamic, not ISR', () => {
  const src = read(join('[slug]', 'page.tsx'));
  assert.match(
    src,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    '[slug]/page.tsx must be force-dynamic — it calls headers() (via the ' +
      'next-intl layout) and cannot be statically generated',
  );
  assert.doesNotMatch(
    src,
    /export const revalidate\s*=\s*\d+/,
    '[slug]/page.tsx must NOT export `revalidate` — ISR on a headers()-using ' +
      'route throws DYNAMIC_SERVER_USAGE at request time (the #17 regression)',
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
