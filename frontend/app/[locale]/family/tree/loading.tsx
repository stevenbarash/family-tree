import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function FamilyTreeLoading() {
  const t = useTranslations('Loading');
  const tPage = useTranslations('Page.FamilyTree');
  return (
    <main
      className="min-h-dvh bg-background"
      aria-busy="true"
      aria-label={t('tree')}
    >
      <header className="sticky top-0 z-20 border-b rule-hair bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ArrowLeft className="size-4 rtl:scale-x-[-1]" aria-hidden />
            <span className="font-display tracking-tight">{tPage('navIndex')}</span>
          </div>
          <div className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
            {tPage('registry')}
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <section className="mb-12">
          <Skeleton className="mb-3 h-9 w-2/3 sm:h-12" />
          <Skeleton className="h-4 w-1/2" />
        </section>

        <section className="mb-12">
          <Skeleton className="mb-4 h-3 w-32" />
          <Skeleton className="h-[520px] w-full rounded-md" />
        </section>

        <section className="mb-12">
          <Skeleton className="mb-4 h-3 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-[94%]" />
            <Skeleton className="h-12 w-[88%]" />
          </div>
        </section>

        <section className="mb-12">
          <Skeleton className="mb-4 h-3 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-[92%]" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        </section>
      </div>
    </main>
  );
}
