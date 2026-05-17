import type { ReactNode } from 'react';

interface Props {
  by?: string;
  children?: ReactNode;
}

export function DirectiveBlockquote({ by, children }: Props) {
  return (
    <blockquote className="border-s-4 border-violet-500 ps-4 italic my-4">
      <div>{children}</div>
      {by ? <cite className="block not-italic text-sm text-muted-foreground mt-2">— {by}</cite> : null}
    </blockquote>
  );
}
