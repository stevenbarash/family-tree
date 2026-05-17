import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { TranslationStatus } from "@core/i18n/index.ts";

interface Props {
  status: TranslationStatus;
  slug: string;
  unresolvedCount?: number;
  locale: Locale;
}

export async function TranslationBanner({ status, slug, unresolvedCount = 0, locale }: Props) {
  if (status === "current") return null;

  const t = await getTranslations({ locale, namespace: "Page.Article.banners" });
  const languageName = await getLanguageName(locale);

  const message =
    status === "stale" ? t("stale")
    : status === "review" ? t("review", { count: unresolvedCount })
    : t("missing", { language: languageName });

  return (
    <aside
      className="my-4 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 ps-4 pe-4 py-3 text-sm"
      role="note"
    >
      <p>{message}</p>
      {status !== "missing" && (
        <p className="mt-2">
          <Link href={`/${slug}`} locale="en" className="underline">
            {t("viewCanonical")}
          </Link>
        </p>
      )}
    </aside>
  );
}

async function getLanguageName(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Chrome.LangSwitcher" });
  return t(locale);
}
