// Render-strategy guard for app/[locale]/** routes.
//
// Background — the #17 outage (live 2026-05-22, reported 2026-05-31):
// every article page 500'd on the auth-on Render deploy with
// DYNAMIC_SERVER_USAGE. Root cause (confirmed by bisection + a
// `dynamic = 'error'` build): `[slug]/loading.tsx` used a *server-side*
// `useTranslations`. A loading.tsx Suspense fallback renders with no
// `params`, so it can't call `setRequestLocale`; next-intl then resolves the
// locale via `headers()`. That single read made the route un-prerenderable,
// so #17's `export const revalidate = 60` turned every article into a 500
// when Next tried to fill the ISR cache. It shipped invisibly: `next dev`
// ignores ISR, and a production build *silently downgrades* such a route to
// dynamic — only a `dynamic = 'error'` build surfaces it, naming `headers()`.
//
// Two invariants below close both layers of that failure:
//
//   1. No [locale] page route may DECLARE static/ISR caching
//      (`export const revalidate`, `dynamic = 'force-static' | 'error'`).
//      The declaration is the trigger: a dynamic route tolerates `headers()`,
//      a "cacheable" one throws. `force-dynamic` and static-by-default (e.g.
//      sign-in, which genuinely reads no `headers()`) are both fine.
//
//   2. No [locale] route-special file that renders without `params`
//      (loading / not-found / error / global-error / template) may use a
//      next-intl *server* API. These can't call `setRequestLocale`, so the
//      API reads `headers()`. The fix is `"use client"` — the API then reads
//      the layout's NextIntlClientProvider, never `headers()`.
//
// LIMITS: this is source inspection, so it pins the known-bad shapes but
// can't prove a render is static-safe. The deterministic proof is a
// `dynamic = 'error'` production build — run that before adding any route to
// a future CACHEABLE_ALLOWLIST entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const localeDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '[locale]');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const allFiles = walk(localeDir);
const rel = (p: string): string => relative(localeDir, p);

// Strip `/* */` and `//` comments so the pattern checks below match real code,
// not prose. (The `[^:]` guard leaves `://` in URLs intact.) Good enough for
// these small route files; not a general-purpose parser.
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// --- Invariant 1: no [locale] page route declares static/ISR caching ---

const STATIC_CACHE_DECLS = [
  { re: /export\s+const\s+revalidate\s*=/, what: '`export const revalidate` (ISR)' },
  { re: /export\s+const\s+dynamic\s*=\s*['"]force-static['"]/, what: "`dynamic = 'force-static'`" },
  { re: /export\s+const\s+dynamic\s*=\s*['"]error['"]/, what: "`dynamic = 'error'`" },
];

// Routes proven static-safe by a `dynamic = 'error'` production build may be
// allowlisted here (path relative to app/[locale], e.g. 'foo/page.tsx').
// Empty today: every [locale] route is force-dynamic or static-by-default.
const CACHEABLE_ALLOWLIST = new Set<string>();

test('Invariant 1: no [locale] page route declares static/ISR caching', () => {
  const pages = allFiles.filter((f) => basename(f) === 'page.tsx');
  assert.ok(pages.length >= 5, `expected to find the [locale] page routes (found ${pages.length}) — did the path move?`);
  for (const file of pages) {
    if (CACHEABLE_ALLOWLIST.has(rel(file))) continue;
    const code = codeOnly(readFileSync(file, 'utf8'));
    for (const { re, what } of STATIC_CACHE_DECLS) {
      assert.doesNotMatch(
        code,
        re,
        `${rel(file)} declares ${what}. [locale] routes render translated UI ` +
          `whose Suspense/404 fallbacks read headers() via next-intl, so a ` +
          `cacheable declaration throws DYNAMIC_SERVER_USAGE at request time ` +
          `(the #17 outage). Keep it force-dynamic — or, only after making the ` +
          `whole route AND its fallbacks static-safe and PROVING it with a ` +
          "`dynamic='error'` production build, add it to CACHEABLE_ALLOWLIST.",
      );
    }
  }
});

// --- Invariant 2: param-less route-special files must not use server next-intl ---

const FALLBACK_BASENAMES = new Set([
  'loading.tsx',
  'not-found.tsx',
  'error.tsx',
  'global-error.tsx',
  'template.tsx',
]);
// next-intl APIs that resolve the active locale from request context. In a
// file that can't call setRequestLocale, each reads headers(). (Client
// components are exempt — they read the NextIntlClientProvider instead.)
const SERVER_INTL_RE =
  /\b(useTranslations|getTranslations|useFormatter|getFormatter|getLocale|getNow|getTimeZone|getMessages)\b/;
// `"use client"` at the top, allowing an optional BOM and leading comments.
const USE_CLIENT_RE = /^﻿?\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

test('Invariant 2: [locale] loading/error/not-found fallbacks using next-intl are "use client"', () => {
  const fallbacks = allFiles.filter((f) => FALLBACK_BASENAMES.has(basename(f)));
  for (const file of fallbacks) {
    const src = readFileSync(file, 'utf8');
    if (!SERVER_INTL_RE.test(codeOnly(src))) continue;
    assert.match(
      src,
      USE_CLIENT_RE,
      `${rel(file)} uses a next-intl API but is not a "use client" component. ` +
        `It renders without \`params\`, so it can't call setRequestLocale; the ` +
        `next-intl call then reads headers() and silently forces every route it ` +
        `falls back for into dynamic rendering (the #17 root cause). Add ` +
        `"use client" at the top, or drop the next-intl usage.`,
    );
  }
});

// --- Pin the specific routes the incident touched ---

test('[slug] article route is explicitly force-dynamic', () => {
  const code = codeOnly(readFileSync(join(localeDir, '[slug]', 'page.tsx'), 'utf8'));
  assert.match(
    code,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    "[slug]/page.tsx must stay force-dynamic — see its header comment and Invariant 1.",
  );
});

test('family/tree carries no redundant force-dynamic (it is dynamic via searchParams)', () => {
  const code = codeOnly(readFileSync(join(localeDir, 'family', 'tree', 'page.tsx'), 'utf8'));
  assert.doesNotMatch(
    code,
    /dynamic\s*=\s*['"]force-dynamic['"]/,
    'family/tree is dynamic via searchParams; the explicit force-dynamic was removed in #17.',
  );
});
