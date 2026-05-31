"use client";
// Client component on purpose. A `loading.tsx` Suspense fallback renders
// with no `params`, so it cannot call `setRequestLocale` — and a *server*
// `useTranslations` here resolves the locale via `headers()`, which silently
// forces the whole route into dynamic rendering. (That is exactly what made
// `[slug]` un-cacheable and turned #17's `revalidate` into a production 500.)
// As a client component, `useTranslations` reads from the layout's
// `NextIntlClientProvider` instead, so the fallback never touches `headers()`.
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

export default function ArticleLoading() {
  const t = useTranslations('Loading');
  return (
    <main
      className="mx-auto min-w-0 max-w-3xl px-4 py-6 sm:px-6 lg:py-10"
      aria-busy="true"
      aria-label={t('article')}
    >
      <Skeleton className="h-4 w-16" />
      <header className="mt-7 mb-8 border-b pb-6">
        <Skeleton className="h-10 w-3/4 sm:h-12" />
        <Skeleton className="mt-3 h-10 w-2/3 sm:h-12" />
        <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </header>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[96%]" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="h-4 w-[94%]" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </main>
  );
}
