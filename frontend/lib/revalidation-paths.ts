/**
 * Locale-prefixed route paths for a page slug, for use as `revalidatePath`
 * arguments. `i18n/routing.ts` sets `localePrefix: "always"`, so every
 * article and talk page lives at `/<locale>/<slug>` — there is no
 * unprefixed default-locale form to special-case.
 *
 * Pure and dependency-free: the caller passes the locale list (normally
 * `routing.locales`) so this stays unit-testable without importing the
 * next-intl routing module. A wrong path here makes `revalidatePath` a
 * silent no-op, so the path form is pinned by revalidation-paths.test.ts.
 */
export function localePathsForSlug(
  slug: string,
  locales: readonly string[],
): string[] {
  return locales.map((locale) => `/${locale}/${slug}`);
}
