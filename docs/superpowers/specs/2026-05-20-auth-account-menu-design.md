# Auth Account Menu — Design

> A header-bar account menu for the authenticated family member: a compact
> trigger (avatar + name) that opens a popover with email, role, last
> sign-in, and a sign-out control. Plus a small best-practices pass on the
> now-live Descope auth.

## Background

The `2026-05-20-descope-auth` plan shipped `WHOAMI_AUTH`-gated Descope
login: the proxy redirects unauthenticated visitors to `/[locale]/sign-in`,
`<AuthProvider>` wraps the body when auth is on, and the page-write API
attributes writes to the signed-in user via `requireSession()`.

What it did **not** ship is any in-app surface for the *authenticated*
state. Once signed in, a family member has no way to see who they are
signed in as, and no way to sign out. This design adds that surface.

Auth is now enabled locally (`WHOAMI_AUTH=on`), so two best-practices
items the descope-auth final review flagged are now live concerns and
are folded into this work.

## Scope

**In:**

- A client `AuthAccountMenu` component in the header bar — avatar + name
  trigger, popover with email / role / last sign-in / sign-out.
- A `popover` UI primitive (none exists today).
- Pure, unit-tested formatting helpers (`initials`, `relativeSignIn`).
- `Chrome.Account` i18n keys in all four locale catalogs.
- **Best-practices pass:** a fail-loud env guard for misconfigured auth,
  and a correction to the stale "No auth" bullet in `frontend/AGENTS.md`.

**Out:**

- Account management (profile/password edit) — would need a second
  Descope flow; not requested.
- Role-based *enforcement* — the page-write API gates on
  *authenticated*, not on role. The menu *displays* the role; it does
  not act on it. Enforcement is a separate future decision.
- Sign-in page error UI (`onError` only logs today) — a separate
  surface; noted as a follow-up, not in this work.
- The broader `SCOPE.md` / `ROADMAP` / `CHANGELOG` auth reconciliation —
  owned by `2026-05-20-render-deploy-and-sync` (plan 3).

## Architecture

The same two-layer split the descope-auth plan used — pure logic apart
from the SDK shell — so the logic is unit-testable under `tsx --test`
and the SDK-coupled part is verified by running.

### `lib/account-menu-format.ts` — pure, SDK-free, unit-tested

- `initials(name: string): string` — up to two letters for the avatar
  fallback. `"Steven Barash"` → `"SB"`; `"Cher"` → `"C"`; collapses
  extra whitespace; tolerates an empty string (`""`).
- `relativeSignIn(iatSeconds: number, now: number, locale: string): string`
  — a localized relative time ("2 hours ago") via `Intl.RelativeTimeFormat`.
  Picks the largest sensible unit (minute / hour / day); `now` is
  injected so the bucketing is testable without a real clock.

No Descope, no React — imports nothing platform-specific.

### `components/ui/popover.tsx` — new UI primitive

`components/ui/` has `avatar`, `badge`, `button`, `card`, `separator`,
`skeleton`, `hover-card` — but **no click-triggered popover**. `hover-card`
is hover/focus-reveal and is wrong for a panel containing an actionable
"Sign out" button (dismisses on mouse-leave; poor on touch).

Add the shadcn `popover` primitive (Radix-based: click-toggle, focus
management, `Esc` / outside-click dismiss, `dir`-aware) via the `shadcn`
skill, consistent with the other `components/ui/` primitives.

### `components/auth-account-menu.tsx` — `'use client'`, the SDK shell

Verified by running (SDK-coupled, like `lib/descope.ts`). Consumes:

- `useUser()` → `user.name`, `user.email`, `user.picture?`
- `useSession()` → `isAuthenticated`, `isSessionLoading`, `claims.iat`,
  `sessionToken`
- `getJwtRoles(sessionToken)` → `string[]` of role names
- `useDescope()` → `.logout()`

Renders, inside `<Popover>`:

- **Trigger** (`PopoverTrigger`): `ui/avatar` showing `user.picture` or
  the `initials(name)` fallback, the name, and a down-chevron. It is a
  real `<button>` with an accessible label.
- **Content** (`PopoverContent`, `align="end"`): the name, the email,
  a `ui/badge` per role (omitted entirely when `getJwtRoles` is empty),
  "Signed in {relativeSignIn(claims.iat, Date.now(), locale)}", a
  `ui/separator`, and a "Sign out" `ui/button`.

### `app/[locale]/layout.tsx` — wiring

The header bar is currently
`<div className="… flex justify-end"><LanguageSwitcher /></div>`. It
becomes `flex justify-end gap-3` containing
`{AUTH_ENABLED && <AuthAccountMenu />}` then `<LanguageSwitcher />`.

`AUTH_ENABLED` is already in module scope of `layout.tsx`. Gating on it
matters: `AuthAccountMenu` calls Descope hooks that require
`<AuthProvider>`, which is only mounted when auth is on. When auth is
off the header bar is byte-identical to today.

## Auth states the menu handles

| State | Render |
| --- | --- |
| `isSessionLoading` (initial, server + hydration) | `ui/skeleton` sized like the trigger — no layout shift, no hydration mismatch (loading is true on both server and first client render) |
| `!isAuthenticated` (e.g. the public `/sign-in` page) | nothing (`return null`) |
| authenticated | trigger + popover |
| sign-out clicked | `await useDescope().logout()`, then redirect to `/sign-in` via the i18n `useRouter`; the proxy keeps them there until they re-authenticate |

## Internationalization

New keys under a `Chrome.Account` namespace in `messages/en.json` (source
of truth) and mirrored into `ru.json` / `uk.json` / `he.json` — the
`messages: <locale>.json has the same key shape as en.json` test enforces
parity:

- `signOut` — the button label
- `signedIn` — `"Signed in {time}"`, where `{time}` is the localized
  relative string from `relativeSignIn`
- `triggerLabel` — accessible label for the trigger button

Role values are whatever the Descope console names them — shown verbatim,
not translated. `AuthAccountMenu` sits inside `<NextIntlClientProvider>`,
so it calls `useTranslations("Chrome.Account")` directly, the same way
`LanguageSwitcher` uses `Chrome.LangSwitcher`.

RTL: the popover uses Radix's `dir`-aware positioning and logical Tailwind
utilities only (`ms-`/`me-`, `align="end"`). The down-chevron points down,
not sideways — it is not a directional icon and does not mirror.

## Best-practices pass

### Fail-loud env guard

When `WHOAMI_AUTH=on` but `NEXT_PUBLIC_DESCOPE_PROJECT_ID` or
`DESCOPE_MANAGEMENT_KEY` is empty, the app fails opaquely — every request
breaks with no clear cause. Add a guard that throws a clear, named error
at startup instead.

The guard logic is a **pure function** —
`assertAuthConfig({ authEnabled, projectId, managementKey })` — that
throws an `Error` naming the missing variable(s) when `authEnabled` is
true and either secret is empty, and is a no-op otherwise. It lives in a
small SDK-free module so it is unit-testable directly. Two call sites
pass it the real `process.env` values at module load:

- `lib/env.ts` — covers the app + API routes (`descope.ts` and
  `layout.tsx` both import `lib/env.ts`).
- `proxy.ts` — `proxy.ts` deliberately does not import `lib/env.ts`
  (keeps Node-only imports out of the middleware runtime), so it calls
  `assertAuthConfig` itself with its own `process.env` reads.

When `WHOAMI_AUTH` is off, the guard is inert.

### `frontend/AGENTS.md` correction

`frontend/AGENTS.md` still says: *"No auth — Tailscale ACLs are the access
layer. Don't add login screens, sessions, or auth headers."* That is now
false and will mislead any agent. Replace that bullet with an accurate
description: auth is `WHOAMI_AUTH`-gated Descope login (off locally by
default, on for the Render replica); Tailscale remains the network layer.
This is a one-bullet correction — the broader `SCOPE.md` / `ROADMAP`
reconciliation stays plan 3's job.

## Error handling

- **Logout failure:** if `logout()` rejects, surface a console error and
  still redirect to `/sign-in` — a stale client session is harmless
  because the proxy and `requireSession()` re-validate the `DS` cookie
  server-side on the next request. The user is never stranded.
- **Missing `claims.iat`:** if the claim is absent, omit the "Signed in"
  line rather than rendering an "Invalid Date". `relativeSignIn` is only
  called with a finite number.
- **No roles:** `getJwtRoles` returns `[]` → the role badge row is
  omitted. Not an error — most family members may have no role.
- **Misconfigured auth:** covered by the fail-loud env guard above.

## Tests

- `lib/account-menu-format.test.ts` (TDD, `node:test` + `node:assert/strict`):
  - `initials` — two-word, single-word, extra whitespace, empty string.
  - `relativeSignIn` — minutes / hours / days buckets with an injected
    `now`; assert against `Intl.RelativeTimeFormat` output for a known
    locale.
- `assertAuthConfig` (TDD): throws and names the variable when
  `authEnabled` is true with an empty `projectId` or `managementKey`;
  is a no-op when `authEnabled` is false; is a no-op when both secrets
  are present.
- `AuthAccountMenu`, `popover.tsx`, and the `layout.tsx` wiring are
  verified by running the app with `WHOAMI_AUTH=on` (SDK-coupled surface).
- `npx tsc --noEmit` is the typecheck gate throughout.

## Implementation order (for the plan)

1. `lib/account-menu-format.ts` + its test (pure, TDD).
2. Add the `popover` UI primitive via the `shadcn` skill.
3. `components/auth-account-menu.tsx` (the SDK shell).
4. Wire `<AuthAccountMenu />` into `app/[locale]/layout.tsx`; add the
   `Chrome.Account` i18n keys to all four catalogs.
5. Fail-loud env guard in `lib/env.ts` + `proxy.ts` (+ test).
6. `frontend/AGENTS.md` "No auth" bullet correction.
7. Typecheck + full frontend test suite + run-verify with auth on.

Commit type: `feat:` for the menu (a user-facing capability) — the
CHANGELOG entry lands with it. The env guard and AGENTS.md fix are
`chore:` / `docs:`.
