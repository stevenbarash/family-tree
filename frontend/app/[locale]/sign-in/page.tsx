import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { SignInFlow } from "./sign-in-flow";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl">whoami.wiki</h1>
      <SignInFlow />
    </main>
  );
}
