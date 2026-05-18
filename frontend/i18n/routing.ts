import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ru", "uk", "he"] as const,
  defaultLocale: "en",
  localePrefix: "always",
  localeDetection: true,
  alternateLinks: true,
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ru: "ltr",
  uk: "ltr",
  he: "rtl",
};
