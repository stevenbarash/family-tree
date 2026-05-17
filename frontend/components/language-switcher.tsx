"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTransition } from "react";
import type { Locale } from "@/i18n/routing";

const LOCALES: Locale[] = ["en", "ru", "uk", "he"];

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("Chrome.LangSwitcher");
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("label")}</span>
      <select
        value={currentLocale}
        onChange={handleChange}
        disabled={isPending}
        className="border-1 border-foreground/20 rounded ps-2 pe-1 py-1 bg-background text-foreground text-sm"
        aria-label={t("label")}
      >
        {LOCALES.map(locale => (
          <option key={locale} value={locale}>
            {t(locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
