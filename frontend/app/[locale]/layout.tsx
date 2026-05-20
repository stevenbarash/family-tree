import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { AuthProvider } from "@descope/nextjs-sdk";
import { routing, LOCALE_DIR } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AUTH_ENABLED, DESCOPE_PROJECT_ID } from "@/lib/env";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Whoami Wiki",
  description: "Family-shared genealogy wiki",
  applicationName: "whoami.wiki",
  appleWebApp: {
    capable: true,
    title: "whoami.wiki",
    statusBarStyle: "default",
  },
  formatDetection: {
    // GEDCOM dates ("1903", phone-shaped record IDs) get auto-linked to
    // tel: on iOS otherwise — annoying tap targets in lineage views.
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

function bodyContent(
  t: Awaited<ReturnType<typeof getTranslations>>,
  children: React.ReactNode,
) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-3 focus:py-2 focus:text-background focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        {t("skipToContent")}
      </a>
      <NextIntlClientProvider>
        <div className="border-b border-foreground/10 px-4 py-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div id="main-content" tabIndex={-1} className="contents">
          {children}
        </div>
      </NextIntlClientProvider>
    </>
  );
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Chrome" });

  return (
    <html
      lang={locale}
      dir={LOCALE_DIR[locale]}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {AUTH_ENABLED ? (
          <AuthProvider projectId={DESCOPE_PROJECT_ID}>
            {bodyContent(t, children)}
          </AuthProvider>
        ) : (
          bodyContent(t, children)
        )}
      </body>
    </html>
  );
}
