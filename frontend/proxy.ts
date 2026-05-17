import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing.ts";

export default createMiddleware(routing);

export const config = {
  // Match everything except:
  //   - API routes (locale-agnostic route handlers)
  //   - Asset proxy (locale-agnostic)
  //   - Static files (_next/*, *.ico, etc.)
  matcher: ["/((?!api|assets|_next|.*\\..*).*)"]
};
