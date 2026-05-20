# Descope Auth + Write Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every page behind a Descope login flow when `WHOAMI_AUTH=on`, and attribute browser writes to the authenticated family member instead of the `whoami` placeholder.

**Architecture:** Auth is env-gated (`WHOAMI_AUTH`) — off locally, on for the Render replica. `proxy.ts` composes Descope's `authMiddleware` with next-intl as **redirect-or-fall-through** (no header merge). API route handlers self-gate via a `requireSession()` helper that doubles as the attribution source. `session()` re-validates from the `DS` cookie wherever called. This is plan 2 of 3 for the Render deployment (see `docs/superpowers/specs/2026-05-20-render-deployment-design.md`, phase 2); independent of plan 1.

**Tech Stack:** `@descope/nextjs-sdk`, Next.js 16 (App Router), next-intl, TypeScript 6, `node:test` + `node:assert/strict`.

---

## File Structure

- `frontend/package.json` — **modify.** Add `@descope/nextjs-sdk`.
- `frontend/lib/env.ts` — **modify.** Add `AUTH_ENABLED`, `DESCOPE_PROJECT_ID`, `DESCOPE_MANAGEMENT_KEY`.
- `frontend/lib/author-cache.ts` — **create.** Pure userId→`AuthorIdentity` TTL cache. No Descope import, so it is unit-testable under plain `tsx --test`.
- `frontend/lib/descope.ts` — **create.** Descope-coupled: `loadFromDescope`, `requireSession`, `UnauthenticatedError`. Imports the SDK.
- `frontend/lib/proxy-compose.ts` — **create.** Pure middleware-composition logic (`composeAuthAndLocale`, `isRedirect`). No SDK import — unit-testable.
- `frontend/proxy.ts` — **modify.** Thin wiring: real Descope + next-intl middlewares passed into `composeAuthAndLocale`.
- `frontend/app/[locale]/layout.tsx` — **modify.** Conditionally wrap in `<AuthProvider>`.
- `frontend/app/[locale]/sign-in/page.tsx` — **create.** Server page hosting the flow.
- `frontend/app/[locale]/sign-in/sign-in-flow.tsx` — **create.** `'use client'` wrapper around `<Descope>`.
- `frontend/app/api/healthz/route.ts` — **create.** Public health-check route for Render.
- `frontend/app/api/pages/[slug]/route.ts` — **modify.** Gate + attribute `PUT`/`DELETE`.
- Tests: `frontend/lib/author-cache.test.ts`, `frontend/lib/proxy-compose.test.ts` — **create.**

**Commit type:** `chore:` for the wiring commits (no standalone user-facing effect until the deployment ships in plan 3). The `feat:` + CHANGELOG entry lands in plan 3.

**Why two layers (`author-cache.ts` vs `descope.ts`, `proxy-compose.ts` vs `proxy.ts`):** the Descope SDK and `next/server` middleware are hard to import under a plain test runner. Splitting the *logic* (cache, composition) into SDK-free modules makes it genuinely unit-testable; the thin SDK-wiring files are verified by running the app.

---

### Task 1: Install `@descope/nextjs-sdk`

**Files:**
- Modify: `frontend/package.json` (via `npm install`)

- [ ] **Step 1: Install the package**

Run: `cd frontend && npm install @descope/nextjs-sdk`

- [ ] **Step 2: Verify it landed**

Run: `cd frontend && node -e "console.log(require('./package.json').dependencies['@descope/nextjs-sdk'])"`
Expected: a version string (e.g. `^1.x.x`), not `undefined`.

- [ ] **Step 3: Confirm the import paths exist**

Run: `cd frontend && ls node_modules/@descope/nextjs-sdk/dist`
Expected: a `server` entry is present (the SDK exposes `@descope/nextjs-sdk` and `@descope/nextjs-sdk/server`). If the layout differs, note the actual server entry path — later tasks import from `@descope/nextjs-sdk/server`.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @descope/nextjs-sdk dependency"
```

---

### Task 2: Descope env surface

**Files:**
- Modify: `frontend/lib/env.ts` (append after the existing `PRIVACY_GATE_ENABLED` export at line 39)

- [ ] **Step 1: Append the Descope env exports**

Add to the end of `frontend/lib/env.ts`:

```typescript
/**
 * Master toggle for Descope auth. Off by default — the Mac Studio's local
 * frontend (browsed over Tailscale) has no login wall, as today. The Render
 * replica sets `WHOAMI_AUTH=on`. Same pattern as `PRIVACY_GATE_ENABLED`.
 */
export const AUTH_ENABLED = process.env.WHOAMI_AUTH === 'on';

/** Descope project ID. Public — inlined into the client bundle for AuthProvider. */
export const DESCOPE_PROJECT_ID = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID ?? '';

/** Descope management key — server-only secret. Used by createSdk() to load
 *  user records (name + email) for write attribution. */
export const DESCOPE_MANAGEMENT_KEY = process.env.DESCOPE_MANAGEMENT_KEY ?? '';
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/env.ts
git commit -m "chore: add descope env surface to frontend env"
```

---

### Task 3: `author-cache.ts` — userId→identity TTL cache

**Files:**
- Create: `frontend/lib/author-cache.ts`
- Test: `frontend/lib/author-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/author-cache.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthor } from './author-cache.ts';

test('resolveAuthor: caches within the TTL, reloads after it', async () => {
  let calls = 0;
  const loader = async (userId: string) => {
    calls++;
    return { name: `User ${userId}`, email: `${userId}@x.test` };
  };
  let clock = 1_000_000;
  const now = () => clock;

  const first = await resolveAuthor('U-cache-1', loader, now);
  assert.deepEqual(first, { name: 'User U-cache-1', email: 'U-cache-1@x.test' });
  assert.equal(calls, 1);

  // within the 5-minute TTL — served from cache, loader not called again
  clock += 60_000;
  await resolveAuthor('U-cache-1', loader, now);
  assert.equal(calls, 1);

  // past the TTL — loader called again
  clock += 5 * 60_000;
  await resolveAuthor('U-cache-1', loader, now);
  assert.equal(calls, 2);
});

test('resolveAuthor: distinct userIds cache independently', async () => {
  let calls = 0;
  const loader = async (userId: string) => {
    calls++;
    return { name: userId, email: `${userId}@x.test` };
  };
  const now = () => 2_000_000;
  await resolveAuthor('U-a', loader, now);
  await resolveAuthor('U-b', loader, now);
  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test lib/author-cache.test.ts`
Expected: FAIL — `./author-cache.ts` does not exist.

- [ ] **Step 3: Create `author-cache.ts`**

Create `frontend/lib/author-cache.ts`:

```typescript
import type { AuthorIdentity } from '@core/pages/index.ts';

/** Loads a user's commit identity from an external source (Descope). */
export type AuthorLoader = (userId: string) => Promise<AuthorIdentity>;

interface CacheEntry {
  identity: AuthorIdentity;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

/**
 * Resolve a userId to an `AuthorIdentity`, memoised for `TTL_MS`. `loader`
 * does the real lookup; `now` is injectable so the TTL is testable without
 * waiting. Distinct userIds cache independently.
 */
export async function resolveAuthor(
  userId: string,
  loader: AuthorLoader,
  now: () => number = Date.now,
): Promise<AuthorIdentity> {
  const hit = cache.get(userId);
  if (hit && now() - hit.at < TTL_MS) return hit.identity;
  const identity = await loader(userId);
  cache.set(userId, { identity, at: now() });
  return identity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test lib/author-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/author-cache.ts frontend/lib/author-cache.test.ts
git commit -m "chore: add userId-to-author TTL cache"
```

---

### Task 4: `descope.ts` — session gate + Descope user loader

**Files:**
- Create: `frontend/lib/descope.ts`

This module imports the Descope SDK, so it is verified by typecheck + the app run, not a unit test. The testable logic (the cache) is already covered by Task 3.

- [ ] **Step 1: Create `descope.ts`**

Create `frontend/lib/descope.ts`:

```typescript
import { createSdk, session } from '@descope/nextjs-sdk/server';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { resolveAuthor } from '@/lib/author-cache';
import {
  AUTH_ENABLED,
  DESCOPE_PROJECT_ID,
  DESCOPE_MANAGEMENT_KEY,
  DEFAULT_AUTHOR,
} from '@/lib/env';

/** Thrown by `requireSession()` when auth is on and there is no valid session. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('no authenticated Descope session');
    this.name = 'UnauthenticatedError';
  }
}

let sdk: ReturnType<typeof createSdk> | null = null;
function descopeSdk() {
  sdk ??= createSdk({
    projectId: DESCOPE_PROJECT_ID,
    managementKey: DESCOPE_MANAGEMENT_KEY,
  });
  return sdk;
}

/**
 * Load a Descope user's name + email. On any failure, fall back to a
 * userId-derived identity — honest (it names the real account) and never
 * the generic `whoami` placeholder.
 */
async function loadFromDescope(userId: string): Promise<AuthorIdentity> {
  try {
    const res = await descopeSdk().management.user.load(userId);
    if (res.ok && res.data) {
      const name = res.data.name?.trim();
      const email = res.data.email?.trim();
      if (name && email) return { name, email };
    }
  } catch {
    // fall through to the userId-derived fallback
  }
  return { name: userId, email: `${userId}@descope.local` };
}

/**
 * Gate a route handler and return the `AuthorIdentity` to attribute its
 * writes to.
 *  - auth off → `DEFAULT_AUTHOR` (local / Tailscale — unchanged behaviour)
 *  - auth on  → the signed-in family member, or throw `UnauthenticatedError`
 */
export async function requireSession(): Promise<AuthorIdentity> {
  if (!AUTH_ENABLED) return DEFAULT_AUTHOR;
  const s = await session();
  const userId = s?.token?.sub;
  if (!userId) throw new UnauthenticatedError();
  return resolveAuthor(userId, loadFromDescope);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If `res.data.name` / `res.data.email` typecheck-fail, open `node_modules/@descope/nextjs-sdk` types for the `management.user.load` response shape and adjust the property access — the user object carries `name` and `email`, but the exact optionality may differ. If `session()`'s return type differs from `{ token: { sub } }`, adjust `s?.token?.sub` to match the SDK's `AuthenticationInfo` type. Do not `any`-cast — match the real types.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/descope.ts
git commit -m "chore: add descope session gate + user loader"
```

---

### Task 5: `proxy-compose.ts` — middleware composition logic

**Files:**
- Create: `frontend/lib/proxy-compose.ts`
- Test: `frontend/lib/proxy-compose.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/proxy-compose.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { composeAuthAndLocale, isRedirect } from './proxy-compose.ts';

// composeAuthAndLocale never inspects the request itself — a stub is fine.
const req = {} as NextRequest;

test('isRedirect: true for 3xx, false otherwise', () => {
  assert.equal(isRedirect(new Response(null, { status: 307 })), true);
  assert.equal(isRedirect(new Response(null, { status: 301 })), true);
  assert.equal(isRedirect(new Response(null, { status: 200 })), false);
  assert.equal(isRedirect(new Response(null, { status: 404 })), false);
});

test('composeAuthAndLocale: honors a Descope redirect (unauthenticated)', async () => {
  const redirect = new Response(null, { status: 307 });
  const out = await composeAuthAndLocale(
    req,
    async () => redirect,
    () => new Response('locale-ran', { status: 200 }),
    true,
  );
  assert.equal(out, redirect);
});

test('composeAuthAndLocale: discards a Descope pass and runs locale routing', async () => {
  const localeResponse = new Response('locale-ran', { status: 200 });
  const out = await composeAuthAndLocale(
    req,
    async () => new Response(null, { status: 200 }),
    () => localeResponse,
    true,
  );
  assert.equal(out, localeResponse);
});

test('composeAuthAndLocale: skips the auth gate entirely when auth is off', async () => {
  let gateCalled = false;
  const localeResponse = new Response('locale-ran', { status: 200 });
  const out = await composeAuthAndLocale(
    req,
    async () => { gateCalled = true; return new Response(null, { status: 307 }); },
    () => localeResponse,
    false,
  );
  assert.equal(gateCalled, false);
  assert.equal(out, localeResponse);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test lib/proxy-compose.test.ts`
Expected: FAIL — `./proxy-compose.ts` does not exist.

- [ ] **Step 3: Create `proxy-compose.ts`**

Create `frontend/lib/proxy-compose.ts`:

```typescript
import type { NextRequest } from 'next/server';

/** A Descope redirect response (unauthenticated) has a 3xx status. */
export function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400;
}

/**
 * Compose an auth gate with a locale middleware as redirect-or-fall-through:
 *
 *  - `authEnabled` false → skip the gate, run locale routing.
 *  - gate returns a redirect (unauthenticated) → return it as-is.
 *  - gate returns anything else (authenticated / public route) → discard it
 *    and run locale routing fresh.
 *
 * The gate's non-redirect response is intentionally discarded — `session()`
 * re-validates from the `DS` cookie downstream, so no header needs carrying.
 */
export async function composeAuthAndLocale(
  request: NextRequest,
  authGate: (req: NextRequest) => Promise<Response> | Response,
  localeMiddleware: (req: NextRequest) => Response,
  authEnabled: boolean,
): Promise<Response> {
  if (authEnabled) {
    const authResult = await authGate(request);
    if (authResult && isRedirect(authResult)) return authResult;
  }
  return localeMiddleware(request);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test lib/proxy-compose.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/proxy-compose.ts frontend/lib/proxy-compose.test.ts
git commit -m "chore: add proxy auth/locale composition logic"
```

---

### Task 6: Rewire `proxy.ts`

**Files:**
- Modify: `frontend/proxy.ts` (full rewrite — current file is 22 lines)

- [ ] **Step 1: Replace `proxy.ts`**

Replace the entire contents of `frontend/proxy.ts` with:

```typescript
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { authMiddleware } from "@descope/nextjs-sdk/server";
import { routing } from "./i18n/routing.ts";
import { composeAuthAndLocale } from "./lib/proxy-compose.ts";

const intlMiddleware = createMiddleware(routing);

// Auth is read directly from the env here (not via lib/env.ts) so this file
// stays free of Node-only imports that the middleware runtime dislikes.
const AUTH_ENABLED = process.env.WHOAMI_AUTH === "on";

// Public routes — reachable without a Descope session. The sign-in page lives
// under the [locale] segment, so every locale-prefixed form is listed, plus
// the bare /sign-in that next-intl redirects to a locale.
const PUBLIC_ROUTES = [
  "/sign-in",
  ...routing.locales.map((l) => `/${l}/sign-in`),
];

const descopeAuth = authMiddleware({
  projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID ?? "",
  redirectUrl: `/${routing.defaultLocale}/sign-in`,
  publicRoutes: PUBLIC_ROUTES,
});

export default function proxy(request: NextRequest): Promise<Response> {
  return composeAuthAndLocale(request, descopeAuth, intlMiddleware, AUTH_ENABLED);
}

export const config = {
  // Unchanged from the next-intl-only version. Excludes /api (route handlers
  // self-gate via requireSession()), /assets, /_next, the PWA icons, and any
  // path with a file extension.
  matcher: ["/((?!api|assets|_next|icon(?:$|/|\\?)|apple-icon(?:$|/|\\?)|.*\\..*).*)"],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If `authMiddleware`'s option names differ from `projectId` / `redirectUrl` / `publicRoutes`, check `node_modules/@descope/nextjs-sdk` server types and adjust.

- [ ] **Step 3: Verify the app still boots with auth OFF**

Run: `cd frontend && WHOAMI_AUTH= npm run dev` (auth unset). Open `http://localhost:3001/` in a browser.
Expected: the wiki loads with **no** login redirect — `composeAuthAndLocale` skips the gate, next-intl routes `/` → `/en` as before. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/proxy.ts
git commit -m "chore: compose descope auth into proxy middleware"
```

---

### Task 7: `<AuthProvider>` in the locale layout

**Files:**
- Modify: `frontend/app/[locale]/layout.tsx`

- [ ] **Step 1: Add the import**

At the top of `frontend/app/[locale]/layout.tsx`, add to the import block:

```typescript
import { AuthProvider } from "@descope/nextjs-sdk";
import { AUTH_ENABLED, DESCOPE_PROJECT_ID } from "@/lib/env";
```

- [ ] **Step 2: Conditionally wrap the body in `<AuthProvider>`**

In the `return` of `LocaleLayout`, the `<body>` currently contains the skip-link `<a>` and `<NextIntlClientProvider>`. Wrap that existing content so `<AuthProvider>` is present only when auth is enabled (when off, there is no Descope project to point at). Replace the `<body>...</body>` block with:

```tsx
      <body className="min-h-full flex flex-col">
        {AUTH_ENABLED ? (
          <AuthProvider projectId={DESCOPE_PROJECT_ID}>
            {bodyContent(t)}
          </AuthProvider>
        ) : (
          bodyContent(t)
        )}
      </body>
```

And add this helper above the `LocaleLayout` function (it holds the markup that used to live directly in `<body>`):

```tsx
function bodyContent(t: Awaited<ReturnType<typeof getTranslations>>) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-3 focus:py-2 focus:text-background focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        {t("skipToContent")}
      </a>
      <NextIntlClientProvider>
        <div className="border-b border-foreground/10 px-4 py-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div id="main-content" tabIndex={-1} className="contents">
          {/* children are passed through — see note below */}
        </div>
      </NextIntlClientProvider>
    </>
  );
}
```

**Important:** `bodyContent` needs `children` too. Adjust its signature to `bodyContent(t, children)` and pass `children` into the `#main-content` div. Final form:

```tsx
function bodyContent(
  t: Awaited<ReturnType<typeof getTranslations>>,
  children: React.ReactNode,
) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-3 focus:py-2 focus:text-background focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        {t("skipToContent")}
      </a>
      <NextIntlClientProvider>
        <div className="border-b border-foreground/10 px-4 py-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div id="main-content" tabIndex={-1} className="contents">
          {children}
        </div>
      </NextIntlClientProvider>
    </>
  );
}
```

And the `<body>` calls become `bodyContent(t, children)` in both branches:

```tsx
      <body className="min-h-full flex flex-col">
        {AUTH_ENABLED ? (
          <AuthProvider projectId={DESCOPE_PROJECT_ID}>
            {bodyContent(t, children)}
          </AuthProvider>
        ) : (
          bodyContent(t, children)
        )}
      </body>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the app still renders with auth OFF**

Run: `cd frontend && WHOAMI_AUTH= npm run dev`. Open `http://localhost:3001/en`.
Expected: page renders unchanged (no `<AuthProvider>` in the tree when auth is off). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/[locale]/layout.tsx
git commit -m "chore: mount descope AuthProvider in locale layout"
```

---

### Task 8: Sign-in page

**Files:**
- Create: `frontend/app/[locale]/sign-in/sign-in-flow.tsx`
- Create: `frontend/app/[locale]/sign-in/page.tsx`

- [ ] **Step 1: Create the client flow component**

Create `frontend/app/[locale]/sign-in/sign-in-flow.tsx`:

```tsx
"use client";

import { Descope } from "@descope/nextjs-sdk";
import { useRouter } from "@/i18n/navigation";

/**
 * The embedded Descope flow. `flowId` names a flow built in the Descope
 * console — configure that flow as invite-only (no open sign-up). On
 * success, send the family member to the wiki home.
 */
export function SignInFlow() {
  const router = useRouter();
  return (
    <Descope
      flowId="sign-up-or-in"
      onSuccess={() => router.push("/")}
      onError={(err) => console.error("descope flow error", err)}
    />
  );
}
```

- [ ] **Step 2: Create the sign-in page**

Create `frontend/app/[locale]/sign-in/page.tsx`:

```tsx
import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { SignInFlow } from "./sign-in-flow";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl">whoami.wiki</h1>
      <SignInFlow />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the route renders**

Run: `cd frontend && WHOAMI_AUTH= npm run dev`. Open `http://localhost:3001/en/sign-in`.
Expected: the page renders the heading. The `<Descope>` widget will show an error or blank without a real project ID — that is expected with auth off / no env; full flow verification happens in Task 11. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/[locale]/sign-in/
git commit -m "chore: add descope sign-in page"
```

---

### Task 9: Public health-check route

**Files:**
- Create: `frontend/app/api/healthz/route.ts`

- [ ] **Step 1: Create the route**

Create `frontend/app/api/healthz/route.ts`:

```typescript
import { NextResponse } from "next/server";

/**
 * Public, unauthenticated health check for Render's deploy probe.
 * `/api/*` is excluded from the proxy matcher, and this handler does not
 * call `requireSession()` — so it stays reachable with auth on.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify it responds**

Run: `cd frontend && WHOAMI_AUTH= npm run dev`, then in another shell: `curl -s localhost:3001/api/healthz`
Expected: `{"ok":true}`. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/healthz/route.ts
git commit -m "chore: add public healthz route"
```

---

### Task 10: Gate + attribute the page-write API

**Files:**
- Modify: `frontend/app/api/pages/[slug]/route.ts`

The `PUT` and `DELETE` handlers currently write with the `DEFAULT_AUTHOR` placeholder. Gate them with `requireSession()` and attribute writes to the returned identity.

- [ ] **Step 1: Add the import**

In `frontend/app/api/pages/[slug]/route.ts`, add to the import block:

```typescript
import { requireSession, UnauthenticatedError } from '@/lib/descope';
```

`DEFAULT_AUTHOR` stays imported — it is still the fallback `requireSession()` returns when auth is off.

- [ ] **Step 2: Gate + attribute `PUT`**

In the `PUT` handler, immediately after the slug check (`if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);`), add the gate:

```typescript
  let author;
  try {
    author = await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }
```

Then change the write call from `DEFAULT_AUTHOR` to `author`:

```typescript
    await pages.write(slug, page, author, parsed.data.summary);
```

- [ ] **Step 3: Gate + attribute `DELETE`**

In the `DELETE` handler, after its slug check, add the same gate block:

```typescript
  let author;
  try {
    author = await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }
```

Then change the delete call:

```typescript
    await getPageStore().softDelete(slug, author);
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If `errorResponse` rejects the `'unauthorized'` code (its codes may be a typed union), open `frontend/lib/api-errors.ts`, add `'unauthorized'` to the code set, then re-run.

- [ ] **Step 5: Verify with auth OFF the route still writes as before**

Run: `cd frontend && WHOAMI_AUTH= npm run dev`. In another shell:

```bash
curl -s -X PUT localhost:3001/api/pages/test-auth-scratch \
  -H 'content-type: application/json' \
  -d '{"body":"scratch","summary":"auth plumbing smoke test"}'
```

Expected: `{"ok":true}` — with auth off, `requireSession()` returns `DEFAULT_AUTHOR` and the write proceeds. Then in `$WHOAMI_ROOT`: `git -C "${WHOAMI_ROOT:-$HOME/whoami}" log -1 --format='%an'` shows `whoami` (the placeholder). Clean up the scratch page afterward: `curl -s -X DELETE localhost:3001/api/pages/test-auth-scratch`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/pages/[slug]/route.ts frontend/lib/api-errors.ts
git commit -m "chore: gate + attribute page-write API via descope session"
```

(Drop `frontend/lib/api-errors.ts` from the `git add` if Step 4 did not need to touch it.)

---

### Task 11: Typecheck gate + manual auth verification

**Files:** none (verification only)

- [ ] **Step 1: Full frontend test suite + typecheck**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: all tests pass (including the new `author-cache` and `proxy-compose` tests); no type errors.

- [ ] **Step 2: Manual verification — auth ON**

In a Descope project (console), create the `sign-up-or-in` flow as **invite-only** and add yourself as a user. Then:

```bash
cd frontend
WHOAMI_AUTH=on \
NEXT_PUBLIC_DESCOPE_PROJECT_ID=<your-project-id> \
DESCOPE_MANAGEMENT_KEY=<your-management-key> \
npm run dev
```

Verify, in a browser at `http://localhost:3001/`:
- [ ] An unauthenticated visit to `/` redirects to `/en/sign-in`.
- [ ] The Descope flow widget renders on the sign-in page.
- [ ] Completing the flow lands you on the wiki home, signed in.
- [ ] `curl -s localhost:3001/api/healthz` still returns `{"ok":true}` without a session.
- [ ] Editing a talk page (or `curl -X PUT` with the browser's `DS` cookie) produces a commit in `$WHOAMI_ROOT` authored by **your real name/email**, not `whoami` — check `git -C "$WHOAMI_ROOT" log -1 --format='%an <%ae>'`.
- [ ] A `PUT /api/pages/...` with no `DS` cookie returns HTTP 401.

- [ ] **Step 3: Manual verification — auth OFF**

Run `cd frontend && npm run dev` (no `WHOAMI_AUTH`). Confirm `/` loads with no login redirect — the Mac Studio local-frontend experience is unchanged.

- [ ] **Step 4: Push the batch**

```bash
git push origin main
```

Expected: the `chore:` commits land on `origin/main`. No CHANGELOG entry needed — `chore:` is exempt from the `changelog-nudge.sh` hook; the user-facing `feat:` entry lands in plan 3.

---

## Self-Review Notes

- **Spec coverage:** implements spec phase 2 — `WHOAMI_AUTH` env gate, `AuthProvider`, redirect-or-fall-through `proxy.ts`, `/[locale]/sign-in` page, `/api/healthz`, API self-gating via `requireSession()`, and identity→attribution (the write route now attributes to the resolved family member). The spec's "middleware composition test" is Task 5; the "attribution test" is covered by the `resolveAuthor` cache test (Task 3) plus the Task 10/11 manual write-attribution checks (the full route is an integration surface, verified by running).
- **Type consistency:** `requireSession()` returns `AuthorIdentity` (`{ name, email }`) in every path — the same type `pages.write()` and `softDelete()` already accept. `resolveAuthor(userId, loader, now)` has the same signature in `author-cache.ts`, its test, and the `descope.ts` call site. `composeAuthAndLocale(request, authGate, localeMiddleware, authEnabled)` matches between `proxy-compose.ts`, its test, and `proxy.ts`.
- **Known soft spots flagged inline:** exact Descope SDK property names (`session().token.sub`, `management.user.load` response shape, `authMiddleware` option names) are verified against the installed package's types during the typecheck steps — the plan says to adjust to the real types rather than `any`-cast.
- **Out of scope here:** git sync (plan 1) and the Render deploy + sync wiring + docs reconciliation (plan 3, `render-deploy-and-sync`).
