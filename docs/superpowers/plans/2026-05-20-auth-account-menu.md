# Auth Account Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header-bar account menu — a compact avatar+name trigger that opens a popover with the signed-in family member's email, role, last sign-in, and a sign-out control — plus a fail-loud env guard for misconfigured auth.

**Architecture:** A `'use client'` `AuthAccountMenu` component reads the Descope client hooks (`useUser`, `useSession`, `useDescope`, `getJwtRoles`) and renders inside a new Base-UI `popover` primitive. Pure formatting logic (`initials`, `relativeSignIn`) and the env-guard logic (`assertAuthConfig`) are split into SDK-free modules so they are unit-testable under `tsx --test`; the SDK-coupled component is verified by running. The menu is mounted in `app/[locale]/layout.tsx` only when `AUTH_ENABLED`.

**Tech Stack:** Next.js 16 (App Router), `@descope/nextjs-sdk` client hooks, `@base-ui/react` (the project's shadcn `base-nova` primitive base), next-intl, `lucide-react`, TypeScript 6, `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-05-20-auth-account-menu-design.md`

---

## File Structure

- `frontend/lib/account-menu-format.ts` — **create.** Pure: `initials(name)`, `relativeSignIn(iatSeconds, now, locale)`. No Descope, no React — unit-testable.
- `frontend/lib/account-menu-format.test.ts` — **create.** Tests for both helpers.
- `frontend/components/ui/popover.tsx` — **create.** Base-UI popover primitive (`Popover`, `PopoverTrigger`, `PopoverContent`), modeled exactly on the existing `components/ui/hover-card.tsx`.
- `frontend/messages/{en,ru,uk,he}.json` — **modify.** Add a `Chrome.Account` block.
- `frontend/components/auth-account-menu.tsx` — **create.** `'use client'` — the SDK shell.
- `frontend/app/[locale]/layout.tsx` — **modify.** Mount `<AuthAccountMenu />` in the header bar.
- `frontend/lib/auth-config.ts` — **create.** Pure `assertAuthConfig` — SDK-free, importable by both `env.ts` and `proxy.ts` (incl. the middleware runtime).
- `frontend/lib/auth-config.test.ts` — **create.** Tests for `assertAuthConfig`.
- `frontend/lib/env.ts` — **modify.** Call `assertAuthConfig` at module load.
- `frontend/proxy.ts` — **modify.** Call `assertAuthConfig` at module load.
- `frontend/AGENTS.md` — **modify.** Correct the stale "No auth" bullet.
- `CHANGELOG.md` — **modify.** `### Added` entry (lands in the Task 4 `feat:` commit).

**Commit types:** Tasks 1–3 and 5 are `chore:` (plumbing — no standalone user-facing effect). Task 4 is `feat:` (the menu becomes user-visible) and MUST include the CHANGELOG entry in the same commit — the `changelog-nudge.sh` hook blocks `feat:` without a staged `CHANGELOG.md`. Task 6 is `docs:`.

**Dev-server note:** the `npm run dev` script hard-codes `next dev -p 3001`; port 3001 is in use by the user's own dev server. For any dev-server step, launch directly with `npx next dev -p 3099`.

---

### Task 1: `account-menu-format.ts` — pure formatting helpers

**Files:**
- Create: `frontend/lib/account-menu-format.ts`
- Test: `frontend/lib/account-menu-format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/account-menu-format.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, relativeSignIn } from './account-menu-format.ts';

test('initials: two words → first letter of first and last, uppercased', () => {
  assert.equal(initials('Steven Barash'), 'SB');
});

test('initials: single word → one letter', () => {
  assert.equal(initials('Cher'), 'C');
});

test('initials: collapses extra whitespace, uses first + last word', () => {
  assert.equal(initials('  anna   maria  smith  '), 'AS');
});

test('initials: empty / whitespace-only string → empty string', () => {
  assert.equal(initials(''), '');
  assert.equal(initials('   '), '');
});

// relativeSignIn is asserted against Intl.RelativeTimeFormat itself so the
// test verifies the unit-bucketing logic, not a hardcoded ICU string.
function expected(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
}

test('relativeSignIn: under a minute → seconds', () => {
  const iat = 1_700_000_000;
  const now = (iat + 30) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-30, 'second'));
});

test('relativeSignIn: minutes bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 5 * 60) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-5, 'minute'));
});

test('relativeSignIn: hours bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 2 * 3600) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-2, 'hour'));
});

test('relativeSignIn: days bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 3 * 86400) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-3, 'day'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test lib/account-menu-format.test.ts`
Expected: FAIL — `./account-menu-format.ts` does not exist.

- [ ] **Step 3: Create `account-menu-format.ts`**

Create `frontend/lib/account-menu-format.ts`:

```typescript
/**
 * Up-to-two-letter initials for an avatar fallback. First letter of the
 * first word + first letter of the last word, uppercased. A single word
 * yields one letter; an empty/whitespace string yields an empty string.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  const first = words[0]!.charAt(0);
  const last = words[words.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

/**
 * A localized relative time ("2 hours ago") for a JWT `iat` claim.
 * `iatSeconds` is Unix seconds (the JWT convention); `now` is Unix
 * milliseconds (`Date.now()` convention) and is a parameter so the
 * bucketing is testable without a real clock. Picks the largest unit
 * that keeps the magnitude readable: seconds < 60s, minutes < 60min,
 * hours < 24h, otherwise days.
 */
export function relativeSignIn(
  iatSeconds: number,
  now: number,
  locale: string,
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const elapsedSec = Math.round(now / 1000 - iatSeconds);
  const minutes = Math.round(elapsedSec / 60);
  const hours = Math.round(elapsedSec / 3600);
  const days = Math.round(elapsedSec / 86400);
  // RelativeTimeFormat expects a negative value for the past.
  if (Math.abs(elapsedSec) < 60) return rtf.format(-elapsedSec, 'second');
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-days, 'day');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test lib/account-menu-format.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/account-menu-format.ts frontend/lib/account-menu-format.test.ts
git commit -m "chore: add account-menu formatting helpers"
```

---

### Task 2: `popover.tsx` — Base-UI popover primitive

**Files:**
- Create: `frontend/components/ui/popover.tsx`

`components/ui/` has no click-triggered popover (`hover-card` is hover/focus-reveal — wrong for a panel with an actionable button). This project's shadcn style is `base-nova`, built on `@base-ui/react` — `components/ui/hover-card.tsx` wraps `@base-ui/react/preview-card`. The popover wraps `@base-ui/react/popover`, which has the identical part structure (`Root`, `Trigger`, `Portal`, `Positioner`, `Popup`). `@base-ui/react` is already a dependency — no install needed.

- [ ] **Step 1: Create `popover.tsx`**

Create `frontend/components/ui/popover.tsx`:

```tsx
"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/**
 * Styled portal + positioner + popup. Default placement: below the trigger,
 * aligned to its end, 8px offset. Base-ui handles viewport-flip and `dir`.
 */
function PopoverContent({
  className,
  sideOffset = 8,
  side = "bottom",
  align = "end",
  ...props
}: PopoverPrimitive.Popup.Props & {
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"]
  side?: PopoverPrimitive.Positioner.Props["side"]
  align?: PopoverPrimitive.Positioner.Props["align"]
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={sideOffset}
        side={side}
        align={align}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-[240px] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If a Base-UI popover part name or prop-type differs from the `preview-card` shape this is modeled on, open `node_modules/@base-ui/react/popover/index.parts.d.ts` and adjust to the real names. Do not `any`-cast.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/popover.tsx
git commit -m "chore: add base-ui popover ui primitive"
```

---

### Task 3: `Chrome.Account` i18n keys

**Files:**
- Modify: `frontend/messages/en.json` (source of truth)
- Modify: `frontend/messages/ru.json`, `frontend/messages/uk.json`, `frontend/messages/he.json`

The `Chrome` namespace already exists in each catalog (it holds `skipToContent`, `LangSwitcher`, `CommandPalette`, `PWA`). Add an `Account` sub-object as a sibling key. The `messages: <locale>.json has the same key shape as en.json` test enforces parity across all four.

- [ ] **Step 1: Add `Account` to `frontend/messages/en.json`**

Inside the `"Chrome"` object, add an `"Account"` key as a sibling of `"LangSwitcher"`:

```json
    "Account": {
      "triggerLabel": "Account menu",
      "signedIn": "Signed in {time}",
      "signOut": "Sign out"
    }
```

- [ ] **Step 2: Add `Account` to `frontend/messages/ru.json`**

Inside its `"Chrome"` object:

```json
    "Account": {
      "triggerLabel": "Меню аккаунта",
      "signedIn": "Вход выполнен {time}",
      "signOut": "Выйти"
    }
```

- [ ] **Step 3: Add `Account` to `frontend/messages/uk.json`**

Inside its `"Chrome"` object:

```json
    "Account": {
      "triggerLabel": "Меню облікового запису",
      "signedIn": "Вхід виконано {time}",
      "signOut": "Вийти"
    }
```

- [ ] **Step 4: Add `Account` to `frontend/messages/he.json`**

Inside its `"Chrome"` object (Hebrew, RTL):

```json
    "Account": {
      "triggerLabel": "תפריט חשבון",
      "signedIn": "התחברת {time}",
      "signOut": "התנתקות"
    }
```

- [ ] **Step 5: Verify catalog parity**

Run: `cd frontend && npm test`
Expected: all tests pass — in particular `messages: ru.json has the same key shape as en.json` and the `uk` / `he` equivalents. If they fail, a key is misplaced or missing in one catalog — fix it.

- [ ] **Step 6: Regenerate the next-intl message declaration**

next-intl's `createMessagesDeclaration` plugin generates the typed-message declaration (`messages/*.d.json.ts`, gitignored) during `next dev` / `next build`. Adding a namespace requires regenerating it so `tsc` sees the new keys.

Run: `cd frontend && npx next dev -p 3099` in the background; wait until it logs `Ready`, then stop it. (This rebuilds `messages/*.d.json.ts`.)

- [ ] **Step 7: Commit**

```bash
git add frontend/messages/en.json frontend/messages/ru.json frontend/messages/uk.json frontend/messages/he.json
git commit -m "chore: add Chrome.Account i18n keys"
```

---

### Task 4: `AuthAccountMenu` component + mount it in the layout

**Files:**
- Create: `frontend/components/auth-account-menu.tsx`
- Modify: `frontend/app/[locale]/layout.tsx`
- Modify: `CHANGELOG.md`

This is the `feat:` task — the menu becomes user-visible. The Descope client hooks live at `@descope/nextjs-sdk/client` (the root export only carries `AuthProvider` / `Descope`). `useUser()` returns `{ user }` where `user` is `UserResponse` (`name: string`, `email?: string`, `picture?: string`). `useSession()` returns `{ isAuthenticated, isSessionLoading, sessionToken, claims }`; `claims` is `Record<string, any>`, so `claims.iat` (Unix seconds) is read defensively. `useDescope()` returns the Descope web SDK, which has `.logout()`. `getJwtRoles(token)` returns `string[]`.

- [ ] **Step 1: Create `auth-account-menu.tsx`**

Create `frontend/components/auth-account-menu.tsx`:

```tsx
"use client";

import { useDescope, useSession, useUser, getJwtRoles } from "@descope/nextjs-sdk/client";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials, relativeSignIn } from "@/lib/account-menu-format";

/**
 * Header-bar account menu for the signed-in family member. Renders only
 * with auth on (the parent gates it on AUTH_ENABLED, so <AuthProvider> is
 * present). Shows a skeleton while the session resolves and nothing at all
 * when there is no session (e.g. on the public /sign-in page).
 */
export function AuthAccountMenu() {
  const t = useTranslations("Chrome.Account");
  const locale = useLocale();
  const router = useRouter();
  const sdk = useDescope();
  const { user } = useUser();
  const { isAuthenticated, isSessionLoading, sessionToken, claims } = useSession();

  if (isSessionLoading) {
    return <Skeleton className="h-8 w-28" aria-hidden />;
  }
  if (!isAuthenticated) {
    return null;
  }

  const name = user?.name?.trim() || user?.email || "";
  const roles = sessionToken ? getJwtRoles(sessionToken) : [];
  const iat = typeof claims?.iat === "number" ? claims.iat : null;

  async function handleSignOut() {
    try {
      await sdk.logout();
    } catch (err) {
      // A stale client session is harmless — the proxy and requireSession()
      // re-validate the DS cookie server-side on the next request.
      console.error("descope logout failed", err);
    }
    router.push("/sign-in");
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("triggerLabel")}
        className="inline-flex items-center gap-2 rounded border border-foreground/20 ps-1 pe-2 py-1 text-sm"
      >
        <Avatar className="size-6 text-xs">
          {user?.picture ? <AvatarImage src={user.picture} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span>{name}</span>
        <ChevronDown className="size-4 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 text-sm">
        <div>
          <p className="font-medium">{name}</p>
          {user?.email ? (
            <p className="text-foreground/60">{user.email}</p>
          ) : null}
        </div>
        {(roles.length > 0 || iat !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            {iat !== null && (
              <span className="text-foreground/60">
                {t("signedIn", { time: relativeSignIn(iat, Date.now(), locale) })}
              </span>
            )}
          </div>
        )}
        <Separator />
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          {t("signOut")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck the component**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. Likely adjustments against the real APIs (do not `any`-cast — match the real types):
- **UI component props:** confirm `Avatar` / `AvatarImage` / `AvatarFallback`, `Badge` (`variant`), `Button` (`variant`, `size`), `Separator`, `Skeleton` accept the props used here by reading `frontend/components/ui/*.tsx`. Adjust variant/size names to what each component actually defines.
- **Descope hooks:** confirm `useSession()` exposes `sessionToken` and `claims`, and `useUser()` exposes `user`. If `claims` is typed such that `claims?.iat` errors, the `typeof … === "number"` guard already narrows it — keep that guard.
- **`Chrome.Account.*` keys:** if `tsc` reports the keys do not exist, the next-intl declaration is stale — re-run `npx next dev -p 3099` once (wait for `Ready`, stop) to regenerate `messages/*.d.json.ts`, then re-run `tsc`.

- [ ] **Step 3: Mount `<AuthAccountMenu />` in the layout**

In `frontend/app/[locale]/layout.tsx`, add to the import block (after the `LanguageSwitcher` import):

```typescript
import { AuthAccountMenu } from "@/components/auth-account-menu";
```

Then, in the `bodyContent` function, replace the header-bar `<div>`:

```tsx
        <div className="border-b border-foreground/10 px-4 py-2 flex justify-end">
          <LanguageSwitcher />
        </div>
```

with:

```tsx
        <div className="border-b border-foreground/10 px-4 py-2 flex justify-end gap-3">
          {AUTH_ENABLED && <AuthAccountMenu />}
          <LanguageSwitcher />
        </div>
```

`AUTH_ENABLED` is already imported in `layout.tsx`. Gating on it matters: `AuthAccountMenu` calls Descope hooks that need `<AuthProvider>`, which `layout.tsx` only mounts when auth is on. When auth is off the bar is unchanged but for the harmless `gap-3`.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify the app boots with auth OFF (no menu, no crash)**

Start the dev server with auth unset: `cd frontend && npx next dev -p 3099` (background). Poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/en` until `200`.
Run: `curl -s http://localhost:3099/en | grep -c 'Account menu'`
Expected: `0` — with auth off, `AUTH_ENABLED` is false, the menu is not rendered, and the page still serves. Stop the dev server.

- [ ] **Step 6: Add the CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased] — v2 development`, add an `### Added` section immediately before the existing `### Changed` line:

```markdown
### Added

- **Account menu in the header bar** — with `WHOAMI_AUTH=on`, signed-in family members get an account menu beside the language switcher: an avatar + name trigger opens a popover showing their email, Descope role(s), a relative last-sign-in time, and a sign-out control. Adds a Base-UI `popover` UI primitive. No effect when auth is off (the menu is not mounted).

```

- [ ] **Step 7: Commit**

```bash
git add frontend/components/auth-account-menu.tsx frontend/app/[locale]/layout.tsx CHANGELOG.md
git commit -m "feat: add header-bar account menu for signed-in users"
```

---

### Task 5: `assertAuthConfig` — fail-loud env guard

**Files:**
- Create: `frontend/lib/auth-config.ts`
- Test: `frontend/lib/auth-config.test.ts`
- Modify: `frontend/lib/env.ts`
- Modify: `frontend/proxy.ts`

When `WHOAMI_AUTH=on` but a Descope secret is empty, the app currently fails opaquely. `assertAuthConfig` throws a clear, named error at startup instead. It is SDK-free and Node-free, so it is safe to import into `proxy.ts` (the middleware runtime) — unlike `lib/env.ts`, which pulls `node:path`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/auth-config.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthConfig } from './auth-config.ts';

test('assertAuthConfig: no-op when auth is disabled', () => {
  assert.doesNotThrow(() =>
    assertAuthConfig({ authEnabled: false, projectId: '', managementKey: '' }),
  );
});

test('assertAuthConfig: no-op when auth is enabled and both secrets are set', () => {
  assert.doesNotThrow(() =>
    assertAuthConfig({ authEnabled: true, projectId: 'P123', managementKey: 'K123' }),
  );
});

test('assertAuthConfig: throws naming the project ID when it is missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: '', managementKey: 'K123' }),
    /NEXT_PUBLIC_DESCOPE_PROJECT_ID/,
  );
});

test('assertAuthConfig: throws naming the management key when it is missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: 'P123', managementKey: '' }),
    /DESCOPE_MANAGEMENT_KEY/,
  );
});

test('assertAuthConfig: throws naming both when both are missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: '', managementKey: '' }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /NEXT_PUBLIC_DESCOPE_PROJECT_ID/);
      assert.match(err.message, /DESCOPE_MANAGEMENT_KEY/);
      return true;
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test lib/auth-config.test.ts`
Expected: FAIL — `./auth-config.ts` does not exist.

- [ ] **Step 3: Create `auth-config.ts`**

Create `frontend/lib/auth-config.ts`:

```typescript
export interface AuthConfig {
  authEnabled: boolean;
  projectId: string;
  managementKey: string;
}

/**
 * Fail-loud guard: when auth is enabled, both Descope secrets must be set.
 * A missing project ID is a hard outage (auth cannot function at all); a
 * missing management key silently degrades write attribution to a
 * userId-derived identity. Throw on either so a misconfigured deploy fails
 * at startup with a clear, named error rather than opaquely per-request.
 * Inert when `authEnabled` is false (the local / Tailscale default).
 */
export function assertAuthConfig(config: AuthConfig): void {
  if (!config.authEnabled) return;
  const missing: string[] = [];
  if (!config.projectId) missing.push('NEXT_PUBLIC_DESCOPE_PROJECT_ID');
  if (!config.managementKey) missing.push('DESCOPE_MANAGEMENT_KEY');
  if (missing.length > 0) {
    throw new Error(
      `WHOAMI_AUTH=on but required Descope env var(s) are empty: ${missing.join(', ')}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test lib/auth-config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the guard into `lib/env.ts`**

In `frontend/lib/env.ts`, add to the import block (after the existing `@core/*` imports):

```typescript
import { assertAuthConfig } from '@/lib/auth-config';
```

Then, at the very end of the file (after the `DESCOPE_MANAGEMENT_KEY` export), add:

```typescript

assertAuthConfig({
  authEnabled: AUTH_ENABLED,
  projectId: DESCOPE_PROJECT_ID,
  managementKey: DESCOPE_MANAGEMENT_KEY,
});
```

- [ ] **Step 6: Wire the guard into `proxy.ts`**

In `frontend/proxy.ts`, add to the import block (after the existing `./lib/proxy-compose.ts` import):

```typescript
import { assertAuthConfig } from "./lib/auth-config.ts";
```

Then, immediately after the `const AUTH_ENABLED = process.env.WHOAMI_AUTH === "on";` line, add:

```typescript

assertAuthConfig({
  authEnabled: AUTH_ENABLED,
  projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID ?? "",
  managementKey: process.env.DESCOPE_MANAGEMENT_KEY ?? "",
});
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Verify the app still boots with auth OFF**

Run: `cd frontend && npx next dev -p 3099` (background, auth unset). Poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/en` until `200`.
Expected: the page serves — with auth off, `assertAuthConfig` is inert. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/auth-config.ts frontend/lib/auth-config.test.ts frontend/lib/env.ts frontend/proxy.ts
git commit -m "chore: fail loud when WHOAMI_AUTH=on but descope env is unset"
```

---

### Task 6: Correct the stale "No auth" note in `frontend/AGENTS.md`

**Files:**
- Modify: `frontend/AGENTS.md`

`frontend/AGENTS.md` still tells agents there is no auth and not to add login screens — false since the descope-auth plan shipped, and actively misleading now that this plan adds an auth component.

- [ ] **Step 1: Replace the "No auth" bullet**

In `frontend/AGENTS.md`, in the `## Conventions` list, find:

```markdown
- **No auth** — Tailscale ACLs are the access layer. Don't add login
  screens, sessions, or auth headers.
```

Replace it with:

```markdown
- **Auth is `WHOAMI_AUTH`-gated** — off by default (local dev, browsed
  over Tailscale, has no login wall); set `WHOAMI_AUTH=on` for the
  Descope login flow (the Render replica does). When touching code,
  keep the auth-off path unchanged — it is the default experience.
  Tailscale remains the network access layer.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/AGENTS.md
git commit -m "docs: correct stale no-auth note in frontend AGENTS.md"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full frontend test suite + typecheck**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: all tests pass — including the new `account-menu-format` (8) and `auth-config` (5) tests — and no type errors.

- [ ] **Step 2: Verify auth-OFF behaviour (the local default)**

Run: `cd frontend && npx next dev -p 3099` (background, no `WHOAMI_AUTH`). Poll until `http://localhost:3099/en` returns `200`.
Confirm:
- `curl -s http://localhost:3099/en | grep -c 'Account menu'` → `0` (menu not mounted).
- `/en` renders normally.
Stop the dev server.

- [ ] **Step 3: Verify auth-ON behaviour (needs real Descope credentials)**

This step needs a real Descope project — the executor supplies `WHOAMI_AUTH=on`, `NEXT_PUBLIC_DESCOPE_PROJECT_ID`, and `DESCOPE_MANAGEMENT_KEY` (e.g. by copying the user's `frontend/.env.local`, which is gitignored, into the worktree, or passing them inline). Run `npx next dev -p 3099` with those set and, signed in, confirm in a browser:
- [ ] The header bar shows the account trigger (avatar + name) beside the language switcher.
- [ ] Clicking it opens the popover with email, role badge(s) (if the Descope user has roles; otherwise omitted), and "Signed in {relative time}".
- [ ] "Sign out" ends the session and lands on `/sign-in`.
- [ ] With `WHOAMI_AUTH=on` and an empty `NEXT_PUBLIC_DESCOPE_PROJECT_ID`, the dev server fails fast with the `assertAuthConfig` error naming the missing variable (then restore the env and continue).

- [ ] **Step 4: Update the plan index**

Flip this plan's row in `docs/superpowers/plans/README.md` from `🚧` to `✅` with a brief shipped summary, and update the `**Total: N plans**` footer counts (one plan moves from in-progress to shipped). Commit:

```bash
git add docs/superpowers/plans/README.md
git commit -m "docs: flip auth-account-menu plan to shipped in plan index"
```

---

## Self-Review Notes

- **Spec coverage:** `AuthAccountMenu` component (Task 4), `popover` primitive (Task 2), pure `initials` / `relativeSignIn` helpers + tests (Task 1), `Chrome.Account` i18n in all four catalogs (Task 3), layout wiring gated on `AUTH_ENABLED` (Task 4), the `assertAuthConfig` fail-loud guard wired into both `env.ts` and `proxy.ts` (Task 5), and the `frontend/AGENTS.md` correction (Task 6) — every spec section maps to a task. Auth-state handling (loading skeleton, unauthenticated → null, sign-out → `/sign-in`) is in the Task 4 component.
- **Type consistency:** `initials(name)` and `relativeSignIn(iatSeconds, now, locale)` have the same signatures in `account-menu-format.ts`, its test, and the Task 4 component. `assertAuthConfig(config: AuthConfig)` is identical across `auth-config.ts`, its test, and both call sites (`env.ts`, `proxy.ts`). `Popover` / `PopoverTrigger` / `PopoverContent` exported by Task 2 are exactly what Task 4 imports.
- **Known soft spots flagged inline:** exact Base-UI popover part names (Task 2 Step 2), exact `components/ui/*` prop APIs and Descope hook shapes (Task 4 Step 2), and the next-intl declaration-regeneration sharp edge (Task 3 Step 6, Task 4 Step 2) — each task says to verify against the real types/files and adjust rather than `any`-cast.
- **Out of scope (per the spec):** account management (profile/password edit), role-based *enforcement*, sign-in-page error UI, and the broader `SCOPE.md` / `ROADMAP` auth reconciliation (owned by `2026-05-20-render-deploy-and-sync`).
