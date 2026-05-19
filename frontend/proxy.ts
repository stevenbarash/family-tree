import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing.ts";

export default createMiddleware(routing);

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
  matcher: ["/((?!api|assets|_next|icon(?:$|/|\\?)|apple-icon(?:$|/|\\?)|.*\\..*).*)"]
};
