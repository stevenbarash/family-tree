'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const BirthplacesMap = dynamic(
  () => import('./birthplaces-map.client').then(m => m.BirthplacesMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        className="h-[420px] w-full rounded-md ring-1 ring-foreground/12"
        aria-label="Loading map"
      />
    ),
  },
);
