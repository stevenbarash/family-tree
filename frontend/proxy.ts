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
  // Match everything except:
  //   - API routes (locale-agnostic route handlers)
  //   - Asset proxy (locale-agnostic)
  //   - Static files (_next/*, *.ico, etc.)
  //   - PWA file-conventions (icon, apple-icon) — served from
  //     `app/icon.tsx` / `app/apple-icon.tsx` at the root, not under
  //     `/[locale]/`. `manifest.webmanifest` is already excluded by
  //     the `.*\\..*` clause (it contains a dot).
  //
  //   The `(?:$|/|\\?)` anchor after `icon` and `apple-icon` is what
  //   prevents accidentally excluding article slugs like `/iconography`
  //   or `/icon-bearer` — without it, the negative lookahead matches
  //   any path *starting* with those tokens.
  matcher: ["/((?!api|assets|_next|icon(?:$|/|\\?)|apple-icon(?:$|/|\\?)|.*\\..*).*)"],
};
