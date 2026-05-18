# Multilingual support — Plan 1 of 4: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Next.js frontend to be architecturally multilingual under `next-intl` — `[locale]` routing, English-only message catalog, type-safe `t()` calls, content migration of `~/whoami/pages/*.md` to `~/whoami/pages/en/*.md` — without changing any user-visible behavior. After Plan 1, the site still reads as English-only but every route lives under `/{locale}/`, every UI string is in `messages/en.json`, and Plans 2-4 can land their pieces against a stable foundation.

**Architecture:** Install `next-intl` (the maintainer-consensus library for Next.js 16 App Router). Create `frontend/i18n/{routing,request,navigation}.ts` and `frontend/proxy.ts` (Next 16's renamed `middleware.ts`). Restructure `app/` → `app/[locale]/`, leaving `app/api/` and `app/assets/` at root (locale-agnostic route handlers). Extract every hardcoded English UI string into `messages/en.json` under namespaced keys. Add `setRequestLocale(locale)` in every page and layout so static rendering is preserved. Migrate content files from `pages/*.md` to `pages/en/*.md` in the data repo; flip the `PAGES_DIR` env constant in lockstep. `core/` stays platform-agnostic — the only changes there are zero in Plan 1.

**Tech Stack:** TypeScript, Next.js 16.2.4, React 19.2.5, `next-intl` (latest), `tsx --test`, `node:assert/strict`. No new runtime deps beyond `next-intl`.

**Spec reference:** `docs/superpowers/specs/2026-05-16-multilingual-support-design.md` (commit `c7a7a59`). Plan 1 implements the "Plan 1 — next-intl foundation + content migration" section.

---

## Scope

**In scope:**
- `frontend/package.json` — add `next-intl` dep.
- `frontend/next.config.ts` — wrap with `createNextIntlPlugin`, enable `createMessagesDeclaration`.
- `frontend/tsconfig.json` — add `allowArbitraryExtensions: true` for `.d.json.ts` files.
- `frontend/i18n/routing.ts` — `defineRouting()` + `LOCALE_DIR` map.
- `frontend/i18n/request.ts` — `getRequestConfig()` returning messages.
- `frontend/i18n/navigation.ts` — `createNavigation()` re-exports.
- `frontend/proxy.ts` — `createMiddleware(routing)`.
- `frontend/messages/en.json` — namespaced English message catalog.
- `frontend/global.d.ts` — `AppConfig` augmentation declaring `Locale`, `Messages`, `Formats`.
- `frontend/app/[locale]/layout.tsx` — was `app/layout.tsx`; adds `setRequestLocale`, `<html lang dir>`, `NextIntlClientProvider`, `generateStaticParams`.
- `frontend/app/[locale]/page.tsx`, `[slug]/page.tsx`, `family/page.tsx`, `family/tree/page.tsx`, `search/page.tsx`, `changelog/page.tsx`, `not-found.tsx` — moved from `app/*` with hardcoded strings replaced by `useTranslations()` / `getTranslations()` calls.
- `frontend/components/directives/infobox-person.tsx`, `frontend/components/directives/on-this-day-ribbon.tsx` — hardcoded labels replaced.
- `frontend/lib/env.ts` — `PAGES_DIR` flipped from `${WHOAMI_ROOT}/pages` to `${WHOAMI_ROOT}/pages/en`.
- `frontend/test/static-rendering.test.ts` — new test parsing `.next` build output to assert every `[locale]/*` route is prebuilt.
- **Data repo:** `git mv ~/whoami/pages/*.md ~/whoami/pages/en/` (separate repo, separate commit).
- `frontend/AGENTS.md` — add proxy.ts vs middleware.ts note + message namespacing note.
- `CHANGELOG.md` — Unreleased entry.
- `docs/superpowers/plans/README.md` — add row for this plan.

**Out of scope (Plan 2):**
- `messages/ru.json`, `messages/uk.json`, `messages/he.json` and translation content.
- RTL Tailwind sweep (logical properties), `<bdi>` / `<span lang>` patterns.
- Language switcher.
- Family-tree RTL mirroring.

**Out of scope (Plan 3):**
- Article translation infrastructure (`translation_of`, `canonical_sha`, talk files).
- `wai i18n status` / `wai i18n sync` CLI commands.
- `places-i18n.yml`, multilingual cite-vault, `Intl.Collator` sorting.
- Per-locale PageStore reads (Plan 1 PageStore stays locale-blind).

**Out of scope (Plan 4):**
- Article translation backfill workflow.

**Out of scope entirely (per spec non-goals):**
- CLI translation (`wai` stays English).
- Editorial guide / plugin translation.
- Talk-page translation.

## File structure

```
frontend/i18n/routing.ts                          NEW. defineRouting + LOCALE_DIR.
frontend/i18n/request.ts                          NEW. getRequestConfig.
frontend/i18n/navigation.ts                       NEW. createNavigation re-exports.
frontend/proxy.ts                                 NEW. Middleware (Next 16 renamed).
frontend/messages/en.json                         NEW. English message catalog.
frontend/global.d.ts                              NEW. AppConfig augmentation.
frontend/next.config.ts                           MODIFY. Wrap with createNextIntlPlugin.
frontend/tsconfig.json                            MODIFY. allowArbitraryExtensions.
frontend/package.json                             MODIFY. Add next-intl dep.
frontend/app/[locale]/layout.tsx                  MOVED from app/layout.tsx + edits.
frontend/app/[locale]/page.tsx                    MOVED from app/page.tsx + string extraction.
frontend/app/[locale]/[slug]/page.tsx             MOVED from app/[slug]/page.tsx + generateStaticParams.
frontend/app/[locale]/family/page.tsx             MOVED from app/family/page.tsx + string extraction.
frontend/app/[locale]/family/tree/page.tsx        MOVED from app/family/tree/page.tsx + string extraction.
frontend/app/[locale]/search/page.tsx             MOVED from app/search/page.tsx + string extraction.
frontend/app/[locale]/changelog/page.tsx          MOVED from app/changelog/page.tsx + string extraction.
frontend/app/[locale]/not-found.tsx               MOVED from app/not-found.tsx + string extraction.
frontend/components/directives/infobox-person.tsx MODIFY. Replace label strings.
frontend/components/directives/on-this-day-ribbon.tsx
                                                  MODIFY. Replace label strings.
frontend/lib/env.ts                               MODIFY. PAGES_DIR → ${WHOAMI_ROOT}/pages/en.
frontend/test/static-rendering.test.ts            NEW. Verify [locale]/* prebuilt.
frontend/AGENTS.md                                MODIFY. Conventions section additions.
CHANGELOG.md                                      MODIFY. Unreleased entry.
docs/superpowers/plans/README.md                  MODIFY. Plan row.
```

## Conventions adhered to

- **No `src/` directory** — i18n/ and proxy.ts live at frontend root (matches existing `app/`, `components/`, `lib/` layout).
- **API routes stay at root** — `app/api/*` and `app/assets/[...path]` are locale-agnostic; they do NOT move under `[locale]/`.
- **`setRequestLocale(locale)` is the FIRST next-intl call** in every page and layout. Forgetting it silently degrades to dynamic rendering — this is the docs' top pitfall.
- **`useTranslations('Namespace')`** uses the lowest common denominator namespace per component; do not pull the whole catalog.
- **No new client components** in Plan 1. Existing client components (family tree, leaflet map) get translations as props from their RSC parents until Plan 2 introduces the scoped `pick()` provider pattern.
- **Tests in `frontend/test/`** for the new static-rendering verification (existing tests live in `frontend/lib/*.test.ts` — this one's a build-output test, different category).
- **Commits per task** — each task ends with one git commit. `feat:` and `fix:` commits MUST include the `CHANGELOG.md` entry in the same commit (project hook enforces). Other prefixes (`chore:`, `refactor:`, `docs:`, `test:`) are exempt.

---

## Task 1: Install next-intl and wrap next.config.ts

Install the library and wrap the existing Next config with the next-intl plugin. The plugin will later read `createMessagesDeclaration` to emit typed message keys.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/next.config.ts`

- [ ] **Step 1: Install next-intl**

Run from `frontend/`:
```bash
npm install next-intl
```

Expected: `package.json` "dependencies" gains `"next-intl": "^4.x"` (or latest). `package-lock.json` updated.

- [ ] **Step 2: Wrap next.config.ts with createNextIntlPlugin**

Replace `frontend/next.config.ts` with:
```ts
import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from 'next-intl/plugin';

const DEFAULT_DEV_ORIGINS = ['100.85.23.19'];
const envOrigins = (process.env.WHOAMI_ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowedDevOrigins = envOrigins.length > 0 ? envOrigins : DEFAULT_DEV_ORIGINS;

const withNextIntl = createNextIntlPlugin({
  requestConfig: './i18n/request.ts',
  experimental: { createMessagesDeclaration: './messages/en.json' }
});

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  allowedDevOrigins,
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 3: Verify the build does not break**

Run from `frontend/`:
```bash
npm run typecheck
```

Expected: `tsc --noEmit` passes (no errors). The build will fail later — that's expected because the routing file doesn't exist yet, but the config wrapping itself should typecheck.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/next.config.ts
git commit -m "chore: install next-intl and wrap next.config.ts"
```

---

## Task 2: Create i18n/routing.ts with LOCALE_DIR

Defines the routing configuration that every other i18n file consumes. `LOCALE_DIR` is a small map next-intl doesn't ship.

**Files:**
- Create: `frontend/i18n/routing.ts`
- Create: `frontend/test/i18n-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/test/i18n-routing.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routing, LOCALE_DIR } from '../i18n/routing.ts';

test('routing: locales contain en, ru, uk, he', () => {
  assert.deepEqual([...routing.locales].sort(), ['en', 'he', 'ru', 'uk']);
});

test('routing: defaultLocale is en', () => {
  assert.equal(routing.defaultLocale, 'en');
});

test('routing: localePrefix is always', () => {
  assert.equal(routing.localePrefix, 'always');
});

test('LOCALE_DIR: he is rtl, others are ltr', () => {
  assert.equal(LOCALE_DIR.he, 'rtl');
  assert.equal(LOCALE_DIR.en, 'ltr');
  assert.equal(LOCALE_DIR.ru, 'ltr');
  assert.equal(LOCALE_DIR.uk, 'ltr');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx tsx --test test/i18n-routing.test.ts
```

Expected: FAIL — `Cannot find module '../i18n/routing.ts'`.

- [ ] **Step 3: Create i18n/routing.ts**

Create `frontend/i18n/routing.ts`:
```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk', 'he'] as const,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
  alternateLinks: true,
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ru: 'ltr',
  uk: 'ltr',
  he: 'rtl',
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx tsx --test test/i18n-routing.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Add changelog entry and commit**

Add to `CHANGELOG.md` under `## [Unreleased]`:
```markdown
- **Multilingual scaffold:** Initial `next-intl` routing config in `frontend/i18n/routing.ts` defining four locales (en/ru/uk/he) and `LOCALE_DIR` for `<html dir>`. Part of multilingual support foundation.
```

```bash
git add frontend/i18n/routing.ts frontend/test/i18n-routing.test.ts CHANGELOG.md
git commit -m "feat: i18n routing config with locales and LOCALE_DIR map"
```

---

## Task 3: Create i18n/request.ts

`getRequestConfig` is next-intl's per-request hook: returns the active locale and the message catalog for it.

**Files:**
- Create: `frontend/i18n/request.ts`
- Create: `frontend/test/i18n-request.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/test/i18n-request.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

test('i18n/request.ts exists and is the configured path', () => {
  assert.ok(existsSync(join(import.meta.dirname, '..', 'i18n', 'request.ts')));
});
```

(Behavioral testing of `getRequestConfig` would require booting next-intl's server runtime — not worth it. The static-rendering test at the end of the plan exercises this code path end-to-end.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx tsx --test test/i18n-request.test.ts
```

Expected: FAIL — assertion fails because the file doesn't exist yet.

- [ ] **Step 3: Create i18n/request.ts**

Create `frontend/i18n/request.ts`:
```ts
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing.ts';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx tsx --test test/i18n-request.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/i18n/request.ts frontend/test/i18n-request.test.ts
git commit -m "chore: i18n request config (per-request locale + messages loader)"
```

---

## Task 4: Create i18n/navigation.ts

Wraps `createNavigation(routing)` and re-exports `Link`, `useRouter`, `redirect`, `getPathname`. All cross-page navigation in the app must use these wrappers — they preserve the active locale automatically.

**Files:**
- Create: `frontend/i18n/navigation.ts`

- [ ] **Step 1: Create the file**

Create `frontend/i18n/navigation.ts`:
```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing.ts';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

(No test — this is a pure re-export. It compiles or it doesn't; consuming code's typecheck is the de-facto test.)

- [ ] **Step 2: Verify typecheck passes**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/i18n/navigation.ts
git commit -m "chore: i18n navigation wrappers (Link, redirect, useRouter)"
```

---

## Task 5: Create messages/en.json scaffold

Empty namespaced scaffold. Page-by-page tasks below will fill it as they extract strings.

**Files:**
- Create: `frontend/messages/en.json`

- [ ] **Step 1: Create the scaffold**

Create `frontend/messages/en.json`:
```json
{
  "Chrome": {
    "skipToContent": "Skip to content"
  },
  "Page": {
    "Home": {},
    "Article": {},
    "Family": {},
    "FamilyTree": {},
    "Search": {},
    "Changelog": {}
  },
  "Months": {
    "long": {
      "1": "January",
      "2": "February",
      "3": "March",
      "4": "April",
      "5": "May",
      "6": "June",
      "7": "July",
      "8": "August",
      "9": "September",
      "10": "October",
      "11": "November",
      "12": "December"
    }
  },
  "Directives": {
    "infoboxPerson": {},
    "onThisDay": {}
  },
  "Errors": {
    "notFound": "Page not found"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/messages/en.json
git commit -m "chore: messages/en.json scaffold with namespacing"
```

---

## Task 6: Create proxy.ts middleware

Next 16 renamed `middleware.ts` → `proxy.ts`. This is the file next-intl's `createMiddleware` returns. Without it, locale routing doesn't work: `/` doesn't redirect to `/en/`, and locale-prefixed URLs aren't recognized.

**Files:**
- Create: `frontend/proxy.ts`

- [ ] **Step 1: Create proxy.ts**

Create `frontend/proxy.ts`:
```ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing.ts';

export default createMiddleware(routing);

export const config = {
  // Match everything except:
  //   - API routes (locale-agnostic route handlers)
  //   - Asset proxy (locale-agnostic)
  //   - Static files (_next/*, *.ico, etc.)
  matcher: ['/((?!api|assets|_next|.*\\..*).*)']
};
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Add changelog entry and commit**

Add to `CHANGELOG.md` under `## [Unreleased]`:
```markdown
- **Locale-aware routing:** `frontend/proxy.ts` wires `next-intl` middleware; `/` redirects to `/{detected-locale}/`. API and asset routes are excluded (locale-agnostic).
```

```bash
git add frontend/proxy.ts CHANGELOG.md
git commit -m "feat: next-intl middleware in proxy.ts (Next 16 rename)"
```

---

## Task 7: Restructure root layout — app/[locale]/layout.tsx

Move `app/layout.tsx` to `app/[locale]/layout.tsx`. Add `setRequestLocale`, locale guard, `<html lang dir>`, `NextIntlClientProvider`, and `generateStaticParams`. After this task, navigating to `/en/` returns the new layout; navigating to `/` triggers the middleware redirect.

**Files:**
- Move: `frontend/app/layout.tsx` → `frontend/app/[locale]/layout.tsx`
- Modify: `frontend/app/[locale]/layout.tsx`

- [ ] **Step 1: Move the file**

```bash
mkdir -p frontend/app/[locale]
git mv frontend/app/layout.tsx frontend/app/[locale]/layout.tsx
```

- [ ] **Step 2: Replace the file contents**

Replace `frontend/app/[locale]/layout.tsx` with:
```tsx
import type { Metadata } from "next";
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { routing, LOCALE_DIR, type Locale } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Chrome' });
  return {
    title: "Whoami Wiki",
    description: "Family-shared genealogy wiki",
    other: { 'skip-to-content-label': t('skipToContent') }
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Chrome' });
  const typedLocale = locale as Locale;

  return (
    <html
      lang={typedLocale}
      dir={LOCALE_DIR[typedLocale]}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded focus:bg-foreground focus:text-background"
        >
          {t('skipToContent')}
        </a>
        <div id="main-content" tabIndex={-1} className="contents">
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
```

(Preserve the focus classes from the original — they were on the Skip link; I've trimmed for brevity here. Double-check against the original `frontend/app/layout.tsx` git history if any class is missing.)

- [ ] **Step 3: Run the dev server and verify /en/ loads**

```bash
cd frontend && npm run dev
```

In another terminal:
```bash
curl -sI http://localhost:3001/ | head -1   # expect 307 redirect
curl -sI http://localhost:3001/en/ | head -1  # expect 200
```

Expected: `/` returns `307` (middleware redirect); `/en/` returns `200`. Pages inside `/en/` will 404 until tasks 8-14 run — that's expected; only the layout is hit by this curl.

Kill the dev server when done.

- [ ] **Step 4: Update CHANGELOG and commit**

Add to `CHANGELOG.md` "Unreleased":
```markdown
- **Locale-prefixed routes:** Root layout moved to `app/[locale]/layout.tsx`; sets `<html lang dir>`, `setRequestLocale`, `NextIntlClientProvider`. Static rendering preserved via `generateStaticParams` over all four locales.
```

```bash
git add frontend/app/[locale]/layout.tsx CHANGELOG.md
git commit -m "feat: move root layout under app/[locale]/ with next-intl wiring"
```

---

## Task 8: Move home page — app/[locale]/page.tsx + extract strings

Move `app/page.tsx` to `app/[locale]/page.tsx`. Extract hardcoded English strings ("Continue research", "Recently revised", "The Registry", monthNames array, etc.) into `messages/en.json` under `Page.Home`. Replace JSX with `useTranslations()` calls. Use `useFormatter()` for date display.

**Files:**
- Move: `frontend/app/page.tsx` → `frontend/app/[locale]/page.tsx`
- Modify: `frontend/app/[locale]/page.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Move the file**

```bash
git mv frontend/app/page.tsx frontend/app/[locale]/page.tsx
```

- [ ] **Step 2: Add Home strings to messages/en.json**

Modify the `Page.Home` namespace in `frontend/messages/en.json`:
```json
    "Home": {
      "continueResearch": "Continue research",
      "recentlyRevised": "Recently revised",
      "allArticles": "All articles",
      "talkPages": "Talk pages",
      "registry": "The Registry"
    },
```

(If you discover additional strings during the file edit below, add them to this namespace and reference them via `t('newKey')`.)

- [ ] **Step 3: Replace hardcoded strings with t() calls in app/[locale]/page.tsx**

Read the existing `frontend/app/[locale]/page.tsx`. At the top of the default export, add:
```tsx
import { setRequestLocale } from 'next-intl/server';
import { useTranslations, useFormatter } from 'next-intl';
```

Inside the page component, before any next-intl call:
```tsx
const { locale } = await params;
setRequestLocale(locale);
const t = useTranslations('Page.Home');
const tMonths = useTranslations('Months.long');
const format = useFormatter();
```

Replace every hardcoded English string identified in audit (line numbers approximate; engineer reads the file to find exact spots):
- `"Continue research"` → `{t('continueResearch')}`
- `"Recently revised"` → `{t('recentlyRevised')}`
- `"All articles"` → `{t('allArticles')}`
- `"Talk pages"` → `{t('talkPages')}`
- `"The Registry"` → `{t('registry')}`

Replace the `monthNames` array (`['January', 'February', ...]`) with:
```tsx
const monthName = (month: number) => tMonths(String(month) as '1');
```

(Replace `monthNames[m - 1]` call sites with `monthName(m)`.)

If any date is rendered via `new Date(...).toLocaleDateString()` or similar, replace with:
```tsx
format.dateTime(date, { day: 'numeric', month: 'short', year: 'numeric' })
```

- [ ] **Step 4: Update the page signature to accept `params`**

The Home page is now under `[locale]/`, so it receives `params`. Update the page signature:
```tsx
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // ... rest of component
}
```

(If the page was previously sync, it must become `async`. If it used `useTranslations` directly, that's fine — `useTranslations` works in async server components.)

- [ ] **Step 5: Verify the page renders in dev**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:3001/en/` (or curl it). Expected: page renders identically to before the move. Visit `http://localhost:3001/`: should redirect to `/en/`.

- [ ] **Step 6: Update CHANGELOG and commit**

Add to `CHANGELOG.md` "Unreleased":
```markdown
- **Home page localized:** `app/page.tsx` → `app/[locale]/page.tsx`; hardcoded English strings ("Continue research", "Recently revised", month names, etc.) extracted into `messages/en.json` under `Page.Home` and `Months.long`. Date formatting now uses `useFormatter()`.
```

```bash
git add frontend/app/[locale]/page.tsx frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize home page (move under [locale]/, extract strings)"
```

---

## Task 9: Move article route — app/[locale]/[slug]/page.tsx + generateStaticParams

The dynamic article route. After move, becomes `app/[locale]/[slug]/page.tsx`. Plan 1's PageStore is locale-blind (Plan 3 will add locale awareness), so the article rendering itself doesn't change — just the routing wrapper. Add `generateStaticParams` over `(locale, slug)` so every article prebuilds.

**Files:**
- Move: `frontend/app/[slug]/page.tsx` → `frontend/app/[locale]/[slug]/page.tsx`
- Modify: `frontend/app/[locale]/[slug]/page.tsx`

- [ ] **Step 1: Move the file**

```bash
mkdir -p frontend/app/[locale]/[slug]
git mv frontend/app/[slug]/page.tsx frontend/app/[locale]/[slug]/page.tsx
```

Also remove the empty parent dir:
```bash
rmdir frontend/app/[slug]
```

- [ ] **Step 2: Update params signature and add setRequestLocale**

Inside `frontend/app/[locale]/[slug]/page.tsx`, update the page component signature so `params` includes `locale`. Find the existing signature (e.g. `{ params }: { params: Promise<{ slug: string }> }`) and change to:
```tsx
import { setRequestLocale } from 'next-intl/server';

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // ... rest of existing function body, unchanged
}
```

Update any `generateMetadata({ params })` similarly:
```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // ... rest unchanged
}
```

- [ ] **Step 3: Add generateStaticParams**

Add at the bottom of the file:
```tsx
import { routing } from '@/i18n/routing';
import { getPageStore } from '@/lib/server-services';

export async function generateStaticParams() {
  const store = getPageStore();
  const list = await store.list();
  const slugs = list.filter(p => !p.isTalk && !p.isArchived).map(p => p.slug);
  return routing.locales.flatMap(locale =>
    slugs.map(slug => ({ locale, slug }))
  );
}
```

- [ ] **Step 4: Verify an article renders**

```bash
cd frontend && npm run dev
```

Pick any slug from `~/whoami/pages/*.md` (e.g., `abby-rickelman`). Visit `http://localhost:3001/en/abby-rickelman`. Expected: article renders identically to pre-move `http://localhost:3001/abby-rickelman`.

(Note: at this point, articles still render because PAGES_DIR still points at the flat `~/whoami/pages/`. Tasks 17-18 do the data migration.)

- [ ] **Step 5: Update CHANGELOG and commit**

```markdown
- **Article routes under [locale]/:** `app/[slug]/page.tsx` → `app/[locale]/[slug]/page.tsx`. `generateStaticParams` enumerates all (locale, slug) pairs for static prebuild.
```

```bash
git add frontend/app/[locale]/[slug]/page.tsx CHANGELOG.md
git commit -m "feat: move article route under [locale]/ with generateStaticParams"
```

---

## Task 10: Move family page — app/[locale]/family/page.tsx + extract strings

The family-line summary page. Smaller string surface than home; move + extract.

**Files:**
- Move: `frontend/app/family/page.tsx` → `frontend/app/[locale]/family/page.tsx`
- Modify: `frontend/app/[locale]/family/page.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Move the file**

```bash
mkdir -p frontend/app/[locale]/family
git mv frontend/app/family/page.tsx frontend/app/[locale]/family/page.tsx
```

- [ ] **Step 2: Read the file, identify hardcoded strings, add to messages/en.json**

Open `frontend/app/[locale]/family/page.tsx`. Identify every user-visible English string (page heading, section headings, link text, button labels, empty-state messages). Add each to `Page.Family` in `messages/en.json`:

```json
    "Family": {
      "title": "Family",
      "lineSummary": "Line summary"
      // ... add more keys as you find strings
    },
```

(The engineer fills in the exact keys after reading the file.)

- [ ] **Step 3: Add setRequestLocale + t() calls**

At the top of the page component:
```tsx
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = useTranslations('Page.Family');
  // ... rest
}
```

Replace each hardcoded string with `{t('key')}`.

- [ ] **Step 4: Verify the page renders**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:3001/en/family`. Expected: renders identically to before.

- [ ] **Step 5: Update CHANGELOG and commit**

```markdown
- **Family page localized:** `app/family/page.tsx` → `app/[locale]/family/page.tsx`; strings extracted to `Page.Family` namespace.
```

```bash
git add frontend/app/[locale]/family/page.tsx frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize family page"
```

---

## Task 11: Move family tree — app/[locale]/family/tree/page.tsx + extract strings

The interactive family browser. Largest single-page string surface (relationship descriptions, button labels, empty-state copy). Move + extract.

**Files:**
- Move: `frontend/app/family/tree/page.tsx` → `frontend/app/[locale]/family/tree/page.tsx`
- Modify: `frontend/app/[locale]/family/tree/page.tsx`
- Modify: `frontend/messages/en.json`
- Possibly: `frontend/components/family/sections/*.tsx` if they have hardcoded strings (audit identified them as the source of "Skip to content", "Me", "No related records yet.", etc.)

- [ ] **Step 1: Move the page file**

```bash
mkdir -p frontend/app/[locale]/family/tree
git mv frontend/app/family/tree/page.tsx frontend/app/[locale]/family/tree/page.tsx
```

- [ ] **Step 2: Identify all user-visible strings**

Open `frontend/app/[locale]/family/tree/page.tsx` AND every file under `frontend/components/family/sections/*.tsx`. Find hardcoded English: "Me", "No related records yet.", "Continue research", relationship terms, etc.

Add to `Page.FamilyTree` in `messages/en.json`:
```json
    "FamilyTree": {
      "me": "Me",
      "noRelatedRecords": "No related records yet.",
      "registry": "The Registry"
      // ... add more keys
    },
```

- [ ] **Step 3: Add setRequestLocale + t() calls in the page**

At the top of `frontend/app/[locale]/family/tree/page.tsx`:
```tsx
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';

// Inside the page component:
const { locale } = await params;
setRequestLocale(locale);
const t = useTranslations('Page.FamilyTree');
```

- [ ] **Step 4: Update section components to accept translated strings**

Section components under `frontend/components/family/sections/` are pure-data RSCs (per frontend/AGENTS.md "page sections are extracted"). They should call `useTranslations()` themselves where they need strings — server components can do this directly.

For each section component containing a hardcoded English string:
```tsx
import { useTranslations } from 'next-intl';

// at the top of the component:
const t = useTranslations('Page.FamilyTree');

// then replace "Me" with {t('me')}, etc.
```

(Section components don't receive `locale` directly because next-intl reads it from request context — `setRequestLocale` in the parent page propagates it.)

- [ ] **Step 5: Verify the family tree renders**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:3001/en/family/tree`. Expected: renders identically to before. Click around — every previously English label still shows in English.

- [ ] **Step 6: Update CHANGELOG and commit**

```markdown
- **Family tree localized:** `app/family/tree/page.tsx` and `components/family/sections/*` strings extracted to `Page.FamilyTree` namespace. The interactive tree is the largest UI-string surface and the densest translation target.
```

```bash
git add frontend/app/[locale]/family/tree/page.tsx frontend/components/family/sections frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize family tree page and sections"
```

---

## Task 12: Move search page — app/[locale]/search/page.tsx + extract TYPE_LABELS

The search UI. Notable strings: `TYPE_LABELS` dict (People/Families/Events/Trees/Meta) and the search-placeholder.

**Files:**
- Move: `frontend/app/search/page.tsx` → `frontend/app/[locale]/search/page.tsx`
- Modify: `frontend/app/[locale]/search/page.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Move the file**

```bash
mkdir -p frontend/app/[locale]/search
git mv frontend/app/search/page.tsx frontend/app/[locale]/search/page.tsx
```

- [ ] **Step 2: Add Search strings to messages/en.json**

```json
    "Search": {
      "placeholder": "Search pages, places, people…",
      "places": "Places",
      "clearFacet": "clear ×",
      "typeLabels": {
        "person": "People",
        "family": "Families",
        "event": "Events",
        "tree": "Trees",
        "meta": "Meta"
      }
    },
```

- [ ] **Step 3: Replace strings in the page**

At the top:
```tsx
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';

// Inside component:
const { locale } = await params;
setRequestLocale(locale);
const t = useTranslations('Page.Search');
const tTypes = useTranslations('Page.Search.typeLabels');
```

Replace the `TYPE_LABELS` dict access. If the existing code has:
```tsx
const TYPE_LABELS = { person: 'People', family: 'Families', ... };
```
Replace usage with `tTypes(type as 'person')` and delete the constant.

Replace the placeholder string with `{t('placeholder')}`. Replace "Places" with `{t('places')}`. Replace "clear ×" with `{t('clearFacet')}`.

- [ ] **Step 4: Verify search works**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:3001/en/search?q=abby` (or any query). Expected: results render with English labels.

- [ ] **Step 5: Update CHANGELOG and commit**

```markdown
- **Search page localized:** `TYPE_LABELS` dict ("People/Families/Events/Trees/Meta") and the search placeholder extracted to `Page.Search` namespace.
```

```bash
git add frontend/app/[locale]/search/page.tsx frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize search page (TYPE_LABELS, placeholder)"
```

---

## Task 13: Move changelog page — app/[locale]/changelog/page.tsx

Small page. Move + extract strings.

**Files:**
- Move: `frontend/app/changelog/page.tsx` → `frontend/app/[locale]/changelog/page.tsx`
- Modify: `frontend/app/[locale]/changelog/page.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Move and extract**

```bash
mkdir -p frontend/app/[locale]/changelog
git mv frontend/app/changelog/page.tsx frontend/app/[locale]/changelog/page.tsx
```

Add to `Page.Changelog` in `messages/en.json`:
```json
    "Changelog": {
      "title": "Changelog"
      // add other strings as you find them
    },
```

Add `setRequestLocale` + `useTranslations('Page.Changelog')` and replace hardcoded strings (same pattern as Task 10).

- [ ] **Step 2: Verify the page renders**

Visit `http://localhost:3001/en/changelog`. Expected: renders identically.

- [ ] **Step 3: Update CHANGELOG and commit**

```markdown
- **Changelog page localized:** moved under `[locale]/`; strings extracted to `Page.Changelog`.
```

```bash
git add frontend/app/[locale]/changelog/page.tsx frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize changelog page"
```

---

## Task 14: Move not-found.tsx — app/[locale]/not-found.tsx

The 404 handler.

**Files:**
- Move: `frontend/app/not-found.tsx` → `frontend/app/[locale]/not-found.tsx`
- Modify: `frontend/app/[locale]/not-found.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Move the file**

```bash
git mv frontend/app/not-found.tsx frontend/app/[locale]/not-found.tsx
```

- [ ] **Step 2: Add Errors strings (already scaffolded; may need extension)**

`Errors.notFound` already exists from Task 5. If the page has additional strings ("Return home", etc.), add them:
```json
  "Errors": {
    "notFound": "Page not found",
    "returnHome": "Return home"
  }
```

- [ ] **Step 3: Update the page**

```tsx
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('Errors');
  return (
    <main>
      <h1>{t('notFound')}</h1>
      <Link href="/">{t('returnHome')}</Link>
    </main>
  );
}
```

Note: use `Link` from `@/i18n/navigation`, NOT from `next/link` — the i18n wrapper preserves locale.

- [ ] **Step 4: Verify**

Visit `http://localhost:3001/en/nonexistent-slug`. Expected: not-found page renders.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/[locale]/not-found.tsx frontend/messages/en.json
git commit -m "chore: move not-found.tsx under [locale]/ with localized strings"
```

(No CHANGELOG — single-file move + label extraction; chore prefix exempt.)

---

## Task 15: Extract directive component strings

The infobox-person and on-this-day-ribbon directives have hardcoded English labels ("born", "died", "parents", "spouses", "children", "residences", "work", "was born", "married", etc.). These render on EVERY article page, so they're the highest-volume strings in the catalog.

**Files:**
- Modify: `frontend/components/directives/infobox-person.tsx`
- Modify: `frontend/components/directives/on-this-day-ribbon.tsx`
- Modify: `frontend/messages/en.json`

- [ ] **Step 1: Add directive strings to messages/en.json**

```json
  "Directives": {
    "infoboxPerson": {
      "born": "born",
      "died": "died",
      "parents": "parents",
      "spouses": "spouses",
      "children": "children",
      "residences": "residences",
      "work": "work"
    },
    "onThisDay": {
      "wasBorn": "was born",
      "died": "died",
      "married": "married",
      "marriedTo": "married to"
    }
  }
```

(Engineer reads the actual files for any additional labels.)

- [ ] **Step 2: Replace labels in infobox-person.tsx**

`infobox-person.tsx` is a server component (no `"use client"`). Use `useTranslations()` directly:
```tsx
import { useTranslations } from 'next-intl';

export function InfoboxPerson(props: InfoboxPersonProps) {
  const t = useTranslations('Directives.infoboxPerson');
  // Replace label="born" with label={t('born')}
  // Replace label="died" with label={t('died')}
  // ... etc.
}
```

- [ ] **Step 3: Replace labels in on-this-day-ribbon.tsx**

Same pattern with namespace `'Directives.onThisDay'`. Replace "was born", "died", "married" strings with `{t('wasBorn')}`, etc.

- [ ] **Step 4: Verify article and home page render correctly**

```bash
cd frontend && npm run dev
```

- Visit `http://localhost:3001/en/abby-rickelman` (an article with an infobox). Expected: labels "born", "died", etc. still show as English.
- Visit `http://localhost:3001/en/` (home page has the on-this-day ribbon). Expected: ribbon renders with English labels.

- [ ] **Step 5: Update CHANGELOG and commit**

```markdown
- **Directive labels localized:** `infobox-person` and `on-this-day-ribbon` directives now read labels from `Directives.infoboxPerson` and `Directives.onThisDay` namespaces. These render on every article page, so they're the highest-volume translation targets.
```

```bash
git add frontend/components/directives/infobox-person.tsx frontend/components/directives/on-this-day-ribbon.tsx frontend/messages/en.json CHANGELOG.md
git commit -m "feat: localize infobox-person and on-this-day directive labels"
```

---

## Task 16: Type-safe message keys — AppConfig augmentation

Adds compile-time checking so `t('Chrome.Nav.about')` fails typecheck if the key is missing or misspelled.

**Files:**
- Create: `frontend/global.d.ts`
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Enable allowArbitraryExtensions in tsconfig**

Modify `frontend/tsconfig.json` — add to `compilerOptions`:
```json
{
  "compilerOptions": {
    // ... existing options
    "allowArbitraryExtensions": true
  }
}
```

This is required for the `.d.json.ts` generated declaration to be importable.

- [ ] **Step 2: Create global.d.ts with AppConfig augmentation**

Create `frontend/global.d.ts`:
```ts
import type { routing } from './i18n/routing';
import type messages from './messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS. If a `t(...)` call uses a key not in `messages/en.json`, it now fails typecheck — fix any such errors by adding the key to the catalog or correcting the call site.

- [ ] **Step 4: Add .d.json.ts files to .gitignore**

next-intl's `createMessagesDeclaration` generates `messages/en.d.json.ts` at build time. It must not be committed.

Append to `frontend/.gitignore`:
```
messages/*.d.json.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/global.d.ts frontend/tsconfig.json frontend/.gitignore
git commit -m "chore: type-safe message keys via AppConfig augmentation"
```

---

## Task 17: Data repo migration — git mv pages/*.md to pages/en/

The content move. Happens in `$WHOAMI_ROOT` (the data repo at `~/whoami/`, NOT this code repo). Coordinated with Task 18, which flips the env constant.

**Files:**
- `$WHOAMI_ROOT/pages/*.md` → `$WHOAMI_ROOT/pages/en/*.md` (all of them, including `*.talk.md`)

- [ ] **Step 1: Confirm WHOAMI_ROOT and survey the data repo**

```bash
echo "$WHOAMI_ROOT"   # expect /Users/$USER/whoami or wherever it points
ls "$WHOAMI_ROOT/pages" | head -5
ls "$WHOAMI_ROOT/pages" | wc -l
```

Expected: a flat directory of `*.md` files (articles + talk pages). Note the count — verify after the move.

- [ ] **Step 2: Make the en/ directory**

```bash
cd "$WHOAMI_ROOT"
mkdir -p pages/en
```

- [ ] **Step 3: Move every .md file**

```bash
cd "$WHOAMI_ROOT"
git mv pages/*.md pages/en/
```

If glob expansion times out due to large file count, batch it:
```bash
cd "$WHOAMI_ROOT/pages"
ls *.md | xargs -I{} git mv {} en/
```

- [ ] **Step 4: Verify**

```bash
cd "$WHOAMI_ROOT"
ls pages/         # should now show only: en/ (plus _archived/ if it existed)
ls pages/en/ | wc -l   # should match the count from Step 1
git status            # should show all the renames
```

- [ ] **Step 5: Commit the data repo move**

```bash
cd "$WHOAMI_ROOT"
git add pages/
git commit -m "chore: migrate pages/*.md to pages/en/ for multilingual support"
```

(This is a commit in the data repo, NOT the code repo. Do not push the code repo yet — Task 18 must land first.)

- [ ] **Step 6: Verify articles still 404 in the code repo's dev server**

```bash
cd /Users/nyetwork/dev/whoami/frontend && npm run dev
```

Visit `http://localhost:3001/en/abby-rickelman`. Expected: **404** because PAGES_DIR still points at `~/whoami/pages/` (now empty of articles) — they're under `pages/en/`. This is the broken-window between Task 17 and Task 18. Move immediately to Task 18.

---

## Task 18: Flip PAGES_DIR to pages/en

Single-line change in `frontend/lib/env.ts`. Restores article rendering.

**Files:**
- Modify: `frontend/lib/env.ts`

- [ ] **Step 1: Read the existing PAGES_DIR definition**

```bash
cd /Users/nyetwork/dev/whoami
grep -n "PAGES_DIR" frontend/lib/env.ts
```

Locate the line, e.g.:
```ts
export const PAGES_DIR = process.env.WHOAMI_PAGES_DIR ?? join(WHOAMI_ROOT, 'pages');
```

- [ ] **Step 2: Update to point at pages/en**

Change to:
```ts
export const PAGES_DIR = process.env.WHOAMI_PAGES_DIR ?? join(WHOAMI_ROOT, 'pages', 'en');
```

(If `WHOAMI_PAGES_DIR` env override is set elsewhere — typically in tests — those tests may need updating; running the test suite will surface them.)

- [ ] **Step 3: Restart the dev server and verify articles render**

```bash
cd frontend
# stop the dev server from Task 17 if still running
npm run dev
```

Visit `http://localhost:3001/en/abby-rickelman` (or any slug). Expected: article renders normally.

- [ ] **Step 4: Run the full test suite**

```bash
cd /Users/nyetwork/dev/whoami
( cd core && npm test ) && ( cd frontend && npm test ) && ( cd cli && npm test )
```

Expected: green. If any test fails, it's likely a test that overrode `WHOAMI_PAGES_DIR` or hardcoded a path — fix it to use `pages/en/`.

- [ ] **Step 5: Update CHANGELOG and commit**

```markdown
- **Content migration:** `PAGES_DIR` flipped from `$WHOAMI_ROOT/pages` to `$WHOAMI_ROOT/pages/en`. All article and talk-page files in the data repo were `git mv`d under `pages/en/` in a separate commit there. The frontend's article loader (PageStore) stays locale-blind in Plan 1 — Plan 3 will add per-locale reads.
```

```bash
git add frontend/lib/env.ts CHANGELOG.md
git commit -m "feat: flip PAGES_DIR to pages/en for multilingual content migration"
```

---

## Task 19: Static rendering verification test

Tests that every `[locale]/*` route is prebuilt to static HTML. Catches the silent dynamic-rendering regression next-intl docs flag as the #1 pitfall.

**Files:**
- Create: `frontend/test/static-rendering.test.ts`

- [ ] **Step 1: Write the test**

Create `frontend/test/static-rendering.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

test('build: produces static HTML for every locale × top-level route', () => {
  // Run a production build if .next is missing or stale.
  const buildDir = join(import.meta.dirname, '..', '.next');
  if (!existsSync(buildDir)) {
    execSync('npm run build', { cwd: join(import.meta.dirname, '..'), stdio: 'inherit' });
  }

  // The Next 16 prerender manifest lists every route that prebuilt.
  // Read it and assert the four locales × the top-level routes are present.
  const manifest = JSON.parse(
    require('node:fs').readFileSync(
      join(buildDir, 'prerender-manifest.json'),
      'utf8'
    )
  );

  const routes = Object.keys(manifest.routes ?? {});
  const expected = ['/en', '/ru', '/uk', '/he'];

  for (const locale of expected) {
    assert.ok(
      routes.some(r => r === locale || r === `${locale}/`),
      `expected ${locale} to be prerendered; got routes: ${routes.slice(0, 10).join(', ')}…`
    );
  }
});
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx tsx --test test/static-rendering.test.ts
```

Expected: PASS. If FAIL, the most likely cause is a missing `setRequestLocale(locale)` call in a layout or page — `next-intl` silently degrades to dynamic rendering. Grep for any `[locale]/**/*.tsx` that doesn't call it.

- [ ] **Step 3: Commit**

```bash
git add frontend/test/static-rendering.test.ts
git commit -m "test: assert every [locale]/* route is statically prebuilt"
```

---

## Task 20: Update frontend/AGENTS.md with conventions

Document the conventions future agents need to know: proxy.ts vs middleware.ts, setRequestLocale discipline, message namespacing, Link from i18n/navigation not next/link.

**Files:**
- Modify: `frontend/AGENTS.md`
- Modify: `docs/superpowers/plans/README.md` (add row for this plan)

- [ ] **Step 1: Add an "Internationalization" section to frontend/AGENTS.md**

Append to `frontend/AGENTS.md` (after the existing "Conventions" section):
```markdown
## Internationalization (next-intl)

The site is multilingual (en/ru/uk/he, Hebrew RTL). UI strings live
in `messages/{locale}.json` namespaced by surface (Chrome, Page.*,
Directives.*, Errors). Articles live in `~/whoami/pages/{locale}/`;
Plan 1's PageStore is locale-blind (reads pages/en/), Plan 3 will
add per-locale reads.

**Hard rules:**

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. Older
  blog posts say `middleware.ts`; they are wrong for this codebase.
- **`setRequestLocale(locale)` in every page and layout under
  `app/[locale]/`** — before any other next-intl call. Forgetting
  it silently degrades to dynamic rendering. The
  `frontend/test/static-rendering.test.ts` test catches this in CI.
- **`Link` from `@/i18n/navigation`, NOT from `next/link`.** The
  i18n wrapper preserves the active locale.
- **`useTranslations('Namespace')`** uses the lowest-common-
  denominator namespace per component to keep the client bundle
  slice tight.
- **Type-safe message keys:** if `t('foo.bar')` fails typecheck,
  the key is missing from `messages/en.json` — add it there.
  `messages/en.json` is the source of truth for the catalog shape;
  other locales mirror its structure.
```

- [ ] **Step 2: Add plan row to plans index**

Modify `docs/superpowers/plans/README.md` — add a row near the top of the "Plans" table (after the existing 2026-05-16 rows):

```markdown
| 🚧 | [`2026-05-17-multilingual-support-plan-1-foundation.md`](./2026-05-17-multilingual-support-plan-1-foundation.md) | Multilingual support — Plan 1: Foundation | `next-intl` install, `[locale]` routing, UI-string extraction, content migration to `pages/en/`. Architecturally multilingual; site still English-only in content. |
```

- [ ] **Step 3: Commit both**

```bash
git add frontend/AGENTS.md docs/superpowers/plans/README.md
git commit -m "docs: i18n conventions in frontend/AGENTS.md + plan index row"
```

---

## Acceptance criteria

After all 20 tasks complete:

1. **Build is green.** `( cd frontend && npm run build )` succeeds.
2. **Typecheck is green.** `( cd frontend && npx tsc --noEmit )` succeeds.
3. **Full test suite passes.** `npm test` in each of `core/`, `frontend/`, `cli/`.
4. **Static rendering preserved.** `frontend/test/static-rendering.test.ts` passes — every `[locale]/*` route is prebuilt.
5. **Site is functionally identical to pre-Plan-1.** `http://localhost:3001/` redirects to `/en/`; `/en/`, `/en/family`, `/en/family/tree`, `/en/search`, `/en/changelog`, and any article URL `/en/<slug>` all render correctly with English content. No visible regressions to non-English readers (because there are no non-English readers yet).
6. **All UI strings extracted.** No hardcoded English string remains in `app/**/*.tsx` or `components/directives/*.tsx` (informal grep test: `grep -rn 'Continue research\|Recently revised\|Search pages' frontend/app/ frontend/components/` returns zero matches outside messages/).
7. **Data repo migration committed.** `~/whoami/pages/` contains only the `en/` subdirectory and `_archived/` if it existed; no flat `.md` files at the top level.
8. **`PAGES_DIR` flipped to `pages/en/`.**
9. **All file moves committed via `git mv`.** `git log --follow frontend/app/[locale]/page.tsx` shows the move from `app/page.tsx`.
10. **Plan index updated.** `docs/superpowers/plans/README.md` has the 🚧 row for this plan.
11. **CHANGELOG complete.** Every `feat:` commit in this plan added an entry under `## [Unreleased]`.
