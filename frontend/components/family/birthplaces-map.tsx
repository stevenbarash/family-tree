'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

function MapSkeleton() {
  const t = useTranslations('Loading');
  return (
    <Skeleton
      className="h-[420px] w-full rounded-md ring-1 ring-foreground/12"
      aria-label={t('map')}
    />
  );
}

export const BirthplacesMap = dynamic(
  () => import('./birthplaces-map.client').then(m => m.BirthplacesMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);
