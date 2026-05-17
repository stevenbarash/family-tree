import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('Errors');
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
        404
      </p>
      <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
        {t('notFoundHeading')}
      </h1>
      <p className="text-base leading-7 text-muted-foreground">
        {t('notFoundHelp')}
      </p>
      <form action="/search" className="w-full max-w-md">
        <input
          type="search"
          name="q"
          autoFocus
          placeholder={t('searchPlaceholder')}
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </form>
      <div className="flex flex-wrap gap-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/85">
        <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
          {t('linkHome')}
        </Link>
        <Link href="/family/tree" className="underline-offset-4 hover:text-foreground hover:underline">
          {t('linkFamilyTree')}
        </Link>
      </div>
    </main>
  );
}
