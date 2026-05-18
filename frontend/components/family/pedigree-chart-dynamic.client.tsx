'use client';

import dynamic from 'next/dynamic';
import type { PedigreeChartProps } from './pedigree-chart.client';

const PedigreeChart = dynamic(() => import('./pedigree-chart.client'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full animate-pulse rounded-md border rule-hair bg-muted/30" />
  ),
});

export default function PedigreeChartDynamic(props: PedigreeChartProps) {
  return <PedigreeChart {...props} />;
}
