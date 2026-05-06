import type { ReactElement, ReactNode } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { directives, allDirectiveAttrs, type Directive } from '@/components/directives';
import { resolveWikilinks, type SlugIndex } from './wikilinks';

function directivesToHast() {
  // unist-util-visit's Node generic doesn't unify with unified's tree
  // type, so we narrow on `type` and cast at the entry point.
  return (tree: unknown) => {
    visit(tree as never, (node: never) => {
      const n = node as { type: string; name?: string; data?: { hName?: string; hProperties?: Record<string, unknown> }; attributes?: Record<string, string> };
      if (n.type === 'containerDirective' || n.type === 'leafDirective' || n.type === 'textDirective') {
        const data = n.data ?? (n.data = {});
        data.hName = `directive-${n.name}`;
        data.hProperties = { ...(n.attributes ?? {}) };
      }
    });
  };
}

const directiveTagNames = Object.keys(directives).map(n => `directive-${n}`);

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...directiveTagNames, 'aside', 'span', 'figure', 'figcaption', 'cite'],
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(directiveTagNames.map(t => [t, allDirectiveAttrs])),
    span: ['className'],
    table: ['className'],
    td: ['rowspan', 'colspan', 'className'],
    th: ['rowspan', 'colspan', 'className'],
  },
};

const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(directivesToHast)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSanitize, sanitizeSchema);

type HastProps = Record<string, unknown>;
type DirectiveWrapper = (p: HastProps) => ReactElement;

function readAttrs(dir: Directive, p: HastProps): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of dir.attrs) {
    const v = p[k];
    out[k] = typeof v === 'string' ? v : undefined;
  }
  return out;
}

// Static portion of the components map — same across every render.
// Directives flagged with `needsDerived` are layered in per-render
// inside `renderMarkdown` so they can receive `context.derived`.
const staticComponents: Record<string, DirectiveWrapper> = (() => {
  const out: Record<string, DirectiveWrapper> = {};
  for (const [name, dir] of Object.entries(directives)) {
    if (dir.needsDerived) continue;
    const Render = dir.render;
    out[`directive-${name}`] = (p) => (
      <Render attrs={readAttrs(dir, p)}>{p.children as ReactNode}</Render>
    );
  }
  return out;
})();

interface RenderContext {
  derived?: DerivedRecord | null;
}

/**
 * Render markdown into a React tree, mapping `:::name{…}` directives to the
 * components in `components/directives/`. The `context.derived` value, when
 * provided, is forwarded to directives flagged `needsDerived` (today only
 * `infobox-person`) so they can render structured fields from
 * `genealogy/derived/<record>.yml` in addition to the YAML body.
 */
export async function renderMarkdown(
  md: string,
  index: SlugIndex,
  context: RenderContext = {},
): Promise<ReactElement> {
  const tree = pipeline.parse(resolveWikilinks(md, index));
  const hast = await pipeline.run(tree);
  const components: Record<string, DirectiveWrapper> = { ...staticComponents };
  for (const [name, dir] of Object.entries(directives)) {
    if (!dir.needsDerived) continue;
    const Render = dir.render;
    components[`directive-${name}`] = (p) => (
      <Render attrs={readAttrs(dir, p)} derived={context.derived}>
        {p.children as ReactNode}
      </Render>
    );
  }
  // hast-util-to-jsx-runtime's component map is typed against HAST element
  // attributes; our wrappers consume the normalized DirectiveProps shape.
  return toJsxRuntime(hast as never, {
    Fragment,
    jsx: jsx as never,
    jsxs: jsxs as never,
    components: components as never,
  }) as ReactElement;
}
