import type { ComponentType, ReactNode } from 'react';
import { Admonition } from './admonition';
import { DirectiveBlockquote } from './blockquote';
import { CiteVault } from './cite-vault';
import { CiteMessage } from './cite-message';
import { Dialogue } from './dialogue';
import { ColumnsList } from './columns-list';
import { InfoboxCompany } from './infobox-company';
import { InfoboxPerson } from './infobox-person';
import type { DerivedRecord } from '@core/gedcom/types.ts';

/**
 * One markdown directive. `attrs` is the closed list of attribute keys
 * the directive accepts; `render` maps a normalized `DirectiveProps`
 * to JSX. `needsDerived` opts the directive into the per-render
 * `context.derived` injection wired up by `lib/render.tsx`.
 */
export interface Directive {
  attrs: readonly string[];
  needsDerived?: true;
  render: ComponentType<DirectiveProps>;
}

export interface DirectiveProps {
  children?: ReactNode;
  attrs?: Record<string, string | undefined>;
  derived?: DerivedRecord | null;
}

function attr(props: DirectiveProps, key: string): string | undefined {
  return props.attrs?.[key];
}

export const directives: Record<string, Directive> = {
  open:       { attrs: [],       render: ({ children }) => <Admonition kind="open">{children}</Admonition> },
  closed:     { attrs: [],       render: ({ children }) => <Admonition kind="closed">{children}</Admonition> },
  superseded: { attrs: [],       render: ({ children }) => <Admonition kind="superseded">{children}</Admonition> },
  gap:        { attrs: [],       render: ({ children }) => <Admonition kind="gap">{children}</Admonition> },
  blockquote: { attrs: ['by'],   render: (p) => <DirectiveBlockquote by={attr(p, 'by')}>{p.children}</DirectiveBlockquote> },
  'cite-vault': {
    attrs: ['type', 'snapshot', 'note'],
    render: (p) => <CiteVault type={attr(p, 'type')} snapshot={attr(p, 'snapshot')} note={attr(p, 'note')} />,
  },
  'cite-message': {
    attrs: ['snapshot', 'date', 'thread', 'note'],
    render: (p) => <CiteMessage snapshot={attr(p, 'snapshot')} date={attr(p, 'date')} thread={attr(p, 'thread')} note={attr(p, 'note')} />,
  },
  dialogue: {
    attrs: ['speaker'],
    render: (p) => <Dialogue speaker={attr(p, 'speaker')}>{p.children}</Dialogue>,
  },
  'columns-list': {
    attrs: ['cols'],
    render: (p) => <ColumnsList cols={attr(p, 'cols')}>{p.children}</ColumnsList>,
  },
  'infobox-company': {
    attrs: [],
    render: (p) => <InfoboxCompany>{p.children}</InfoboxCompany>,
  },
  'infobox-person': {
    attrs: [],
    needsDerived: true,
    render: (p) => <InfoboxPerson derived={p.derived}>{p.children}</InfoboxPerson>,
  },
};

/** Flat list of all attribute names accepted by any directive. */
export const allDirectiveAttrs: readonly string[] = Array.from(
  new Set(Object.values(directives).flatMap((d) => d.attrs)),
);
