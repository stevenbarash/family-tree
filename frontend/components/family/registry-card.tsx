import type { CSSProperties, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RegistryCardProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function RegistryCard({ className, style, children }: RegistryCardProps) {
  return (
    <Card
      className={cn('gap-0 overflow-hidden p-0 shadow-none ring-foreground/12', className)}
      style={style}
    >
      {children}
    </Card>
  );
}
