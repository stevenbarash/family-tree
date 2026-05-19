'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ error, reset }: Props) {
  const t = useTranslations('Errors');
  useEffect(() => {
    // Next surfaces a digest in production; the message is dev-only.
    // Echoing both makes triage from console + redacted logs symmetric.
    console.error('LocaleError', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
        {t('boundaryLabel')}
      </p>
      <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
        {t('boundaryHeading')}
      </h1>
      <p className="text-base leading-7 text-muted-foreground">
        {t('boundaryHelp')}
      </p>
      <Alert variant="destructive" className="w-full">
        <AlertTitle>{t('boundaryDetailsLabel')}</AlertTitle>
        <AlertDescription>
          <code className="break-all font-mono text-xs">
            {error.message || error.name || 'Error'}
          </code>
          {error.digest ? (
            <span className="mt-1 block font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
              digest {error.digest}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={reset} variant="default" size="sm">
          {t('boundaryRetry')}
        </Button>
        <Link
          href="/"
          className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/85 underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('linkHome')}
        </Link>
      </div>
    </main>
  );
}
