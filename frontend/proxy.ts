import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing.ts";

export default createMiddleware(routing);

export const config = {
  // Match everything except:
  //   - API routes (locale-agnostic route handlers)
  //   - Asset proxy (locale-agnostic)
  //   - Static files (_next/*, *.ico, etc.)
  //   - PWA file-conventions (icon, apple-icon, manifest) — served from
  //     `app/icon.tsx` / `app/apple-icon.tsx` / `app/manifest.ts` at the
  //     root, not under `/[locale]/`. The next-intl proxy would otherwise
  //     prepend the locale and break installability (browser fetches
  //     `/manifest.webmanifest`, `/icon` at well-known URLs).
  matcher: ["/((?!api|assets|_next|icon|apple-icon|manifest|.*\\..*).*)"]
};
