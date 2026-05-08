import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import yaml from 'js-yaml';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function Infobox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card
      size="sm"
      className={cn(
        'not-prose my-5 w-full bg-infobox text-infobox-foreground ring-infobox-border/70',
        'shadow-[0_18px_48px_-18px_rgba(63,49,24,0.18)] dark:shadow-[0_18px_48px_-18px_rgba(0,0,0,0.6)]',
        'md:float-right md:clear-right md:my-1 md:ml-6 md:max-w-xs',
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function InfoboxHeader({
  eyebrow,
  title,
  description,
  avatar,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <CardHeader className="border-b border-infobox-border/60 pb-3">
      <div className="flex items-start gap-3">
        {avatar ? <div className="shrink-0 pt-0.5">{avatar}</div> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="mb-1 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-infobox-muted">
              {eyebrow}
            </div>
          ) : null}
          <div className="font-heading text-base leading-tight tracking-normal text-infobox-foreground">
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-xs text-infobox-muted">{description}</div>
          ) : null}
        </div>
      </div>
    </CardHeader>
  );
}

export function InfoboxBody({ children }: { children: ReactNode }) {
  return (
    <CardContent className="flex flex-col py-1 text-sm">
      {childrenWithSeparators(children)}
    </CardContent>
  );
}

export function InfoboxRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-3 py-2">
      <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-infobox-muted">
        {Icon ? <Icon className="size-3 shrink-0 opacity-60" aria-hidden /> : null}
        {label}
      </span>
      <div className="min-w-0 leading-snug">{children}</div>
    </div>
  );
}

function childrenWithSeparators(children: ReactNode): ReactNode {
  const arr = Array.isArray(children) ? children.flat(Infinity) : [children];
  const rows = arr.filter(Boolean);
  return rows.map((row, i) => (
    <Fragment key={i}>
      {i > 0 ? <Separator className="bg-infobox-border/40" /> : null}
      {row}
    </Fragment>
  ));
}

export function extractFieldsFromChildren(children: ReactNode): Record<string, string> {
  const text = childrenToText(children).trim();
  try {
    const parsed = yaml.load(text);
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
      );
    }
  } catch { /* ignore */ }
  return {};
}

function childrenToText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join('\n');
  if (isValidElement(node)) {
    const props = (node as ReactElement<{ children?: ReactNode }>).props;
    return childrenToText(props.children ?? null);
  }
  return '';
}
