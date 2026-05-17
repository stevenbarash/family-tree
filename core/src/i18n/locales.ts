export const LOCALES = ["en", "ru", "uk", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export const CANONICAL_LOCALE: Locale = "en";
export const TARGET_LOCALES: readonly Locale[] = ["ru", "uk", "he"];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
