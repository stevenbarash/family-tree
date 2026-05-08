import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ReactElement } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { toSlug } from '@core/pages/slug.ts';

function mdastToString(node: { value?: string; children?: { value?: string; children?: unknown[] }[] }): string {
  if (typeof node.value === 'string') return node.value;
  if (!node.children) return '';
  return node.children
    .map(c => mdastToString(c as Parameters<typeof mdastToString>[0]))
    .join('');
}

function changelogPath(): string {
  const override = process.env.WHOAMI_CHANGELOG_PATH;
  if (override) return override;
  return path.resolve(process.cwd(), '..', 'CHANGELOG.md');
}

export type SubsectionKind =
  | 'Added'
  | 'Changed'
  | 'Removed'
  | 'Fixed'
  | 'Deprecated'
  | 'Security'
  | 'Notes'
  | 'Other';

export interface Subsection {
  kind: SubsectionKind;
  qualifier: string | null;
  bodyMarkdown: string;
  entryCount: number;
}

export type VersionStatus =
  | 'unreleased'
  | 'pre-release'
  | 'released'
  | 'retired';

export interface VersionSection {
  kind: 'version';
  id: string;
  number: number | null;
  label: string;
  subtitle: string | null;
  status: VersionStatus;
  intro: string | null;
  subsections: Subsection[];
}

export interface GroupSection {
  kind: 'group';
  id: string;
  number: number;
  title: string;
  intro: string | null;
  versions: VersionSection[];
}

export interface NotesSection {
  kind: 'notes';
  id: string;
  number: number;
  title: string;
  bodyMarkdown: string;
}

export type Section = VersionSection | GroupSection | NotesSection;

export interface ChangelogTotals {
  versions: number;
  released: number;
  entries: number;
}

export interface ChangelogDoc {
  title: string;
  intro: string;
  sections: Section[];
  totals: ChangelogTotals;
  generatedAt: string;
}

interface MdNode {
  type: string;
  depth?: number;
  children?: MdNode[];
  value?: string;
  position?: { start: { offset: number }; end: { offset: number } };
}

const VERSION_LABEL_RE = /^\[([^\]]+)\](?:\s+[—-]\s+(.+))?$/;
const SUBSECTION_KIND_RE = /^(Added|Changed|Removed|Fixed|Deprecated|Security|Notes)(?:\s+[—-]\s+(.+))?$/;
const BULLET_LINE_RE = /^[ \t]*[-*]\s/gm;

function deriveStatus(label: string, subtitle: string | null): VersionStatus {
  if (label.toLowerCase() === 'unreleased') return 'unreleased';
  if (/-pre/i.test(label) || /pre-release|development/i.test(subtitle ?? '')) return 'pre-release';
  if (/retired/i.test(subtitle ?? '')) return 'retired';
  return 'released';
}

function sectionId(s: string): string {
  return toSlug(s) || 'section';
}

function countEntries(md: string): number {
  return (md.match(BULLET_LINE_RE) ?? []).length;
}

function sliceSource(src: string, start: number | undefined, end: number | undefined): string {
  if (start == null || end == null) return '';
  return src.slice(start, end).trim();
}

function bodyBetween(src: string, after: MdNode, before: MdNode | null): string {
  const start = after.position?.end.offset;
  const end = before?.position?.start.offset ?? src.length;
  return sliceSource(src, start, end);
}

function parseHeadingText(node: MdNode): string {
  return mdastToString(node).trim();
}

function parseVersionHeading(text: string): { label: string; subtitle: string | null } | null {
  const m = text.match(VERSION_LABEL_RE);
  if (!m) return null;
  return { label: m[1], subtitle: m[2]?.trim() ?? null };
}

function parseSubsectionHeading(text: string): { kind: SubsectionKind; qualifier: string | null } {
  const m = text.match(SUBSECTION_KIND_RE);
  if (!m) return { kind: 'Other', qualifier: text };
  return { kind: m[1] as SubsectionKind, qualifier: m[2]?.trim() ?? null };
}

function findNextH2(children: MdNode[], fromIdx: number): MdNode | null {
  for (let i = fromIdx + 1; i < children.length; i += 1) {
    const n = children[i];
    if (n.type === 'heading' && n.depth === 2) return n;
  }
  return null;
}

function buildSubsections(src: string, headings: { node: MdNode; index: number }[], allChildren: MdNode[]): Subsection[] {
  return headings.map((cur, i) => {
    const next = headings[i + 1];
    const before: MdNode | null = next ? next.node : findNextH2(allChildren, cur.index);
    const text = parseHeadingText(cur.node);
    const { kind, qualifier } = parseSubsectionHeading(text);
    const body = bodyBetween(src, cur.node, before);
    return { kind, qualifier, bodyMarkdown: body, entryCount: countEntries(body) };
  });
}

/**
 * Parse a CHANGELOG.md string into a structured document. The parser
 * walks the top-level mdast children once and groups H2 sections,
 * recognizing three shapes:
 *
 *   1. `## [label] — subtitle` → standalone version block
 *   2. `## Group title` containing `### [label] — subtitle` H3s → group
 *   3. `## Other title` with prose → notes block
 *
 * Within a version block, H3 subsections that match
 * `Added | Changed | Removed | Fixed | Deprecated | Security | Notes`
 * (with optional ` — qualifier`) are recognized as keep-a-changelog
 * subsections; the qualifier is preserved so we can render
 * `Added — platform foundations` distinctly from `Added`.
 *
 * Each top-level section is assigned a sequential `number`. Nested
 * versions inside a group carry `number: null` — the group has the
 * number, its versions don't.
 */
export function parseChangelog(src: string, generatedAt: string): ChangelogDoc {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(src) as unknown as MdNode;
  const children = tree.children ?? [];

  const h1Idx = children.findIndex(n => n.type === 'heading' && n.depth === 1);
  const titleNode = h1Idx >= 0 ? children[h1Idx] : null;
  const title = titleNode ? parseHeadingText(titleNode) : 'Changelog';

  const firstH2Idx = children.findIndex(n => n.type === 'heading' && n.depth === 2);
  const introStart = titleNode?.position?.end.offset;
  const introEnd = firstH2Idx >= 0 ? children[firstH2Idx].position?.start.offset : src.length;
  const intro = sliceSource(src, introStart, introEnd);

  const sections: Section[] = [];
  let n = 0;
  for (let i = firstH2Idx; i >= 0 && i < children.length; ) {
    const h2 = children[i];
    if (h2.type !== 'heading' || h2.depth !== 2) {
      i += 1;
      continue;
    }
    const nextH2Idx = (() => {
      for (let j = i + 1; j < children.length; j += 1) {
        const next = children[j];
        if (next.type === 'heading' && next.depth === 2) return j;
      }
      return children.length;
    })();

    const text = parseHeadingText(h2);
    const versionMatch = parseVersionHeading(text);

    const h3s: { node: MdNode; index: number }[] = [];
    for (let j = i + 1; j < nextH2Idx; j += 1) {
      const node = children[j];
      if (node.type === 'heading' && node.depth === 3) h3s.push({ node, index: j });
    }

    n += 1;
    if (versionMatch) {
      const status = deriveStatus(versionMatch.label, versionMatch.subtitle);
      const introBody = h3s.length > 0
        ? bodyBetween(src, h2, h3s[0].node)
        : sliceSource(src, h2.position?.end.offset, children[nextH2Idx]?.position?.start.offset ?? src.length);
      sections.push({
        kind: 'version',
        id: sectionId(versionMatch.label),
        number: n,
        label: versionMatch.label,
        subtitle: versionMatch.subtitle,
        status,
        intro: introBody.trim() || null,
        subsections: buildSubsections(src, h3s, children),
      });
    } else {
      const versionH3s = h3s.filter(h => parseVersionHeading(parseHeadingText(h.node)));
      if (versionH3s.length > 0) {
        const groupIntro = bodyBetween(src, h2, versionH3s[0].node);
        const versions: VersionSection[] = versionH3s.map((h, k) => {
          const m = parseVersionHeading(parseHeadingText(h.node));
          if (!m) throw new Error('unreachable: version heading filtered above');
          const next = versionH3s[k + 1]?.node ?? null;
          const before = next ?? findNextH2(children, h.index);
          const body = bodyBetween(src, h.node, before);
          return {
            kind: 'version',
            id: sectionId(m.label),
            number: null,
            label: m.label,
            subtitle: m.subtitle,
            status: deriveStatus(m.label, m.subtitle),
            intro: null,
            subsections: [{
              kind: 'Other',
              qualifier: null,
              bodyMarkdown: body,
              entryCount: countEntries(body),
            }],
          };
        });
        sections.push({
          kind: 'group',
          id: sectionId(text),
          number: n,
          title: text,
          intro: groupIntro.trim() || null,
          versions,
        });
      } else {
        const body = sliceSource(src, h2.position?.end.offset, children[nextH2Idx]?.position?.start.offset ?? src.length);
        sections.push({
          kind: 'notes',
          id: sectionId(text),
          number: n,
          title: text,
          bodyMarkdown: body,
        });
      }
    }

    i = nextH2Idx;
  }

  return {
    title,
    intro: intro.trim(),
    sections,
    totals: aggregateTotals(sections),
    generatedAt,
  };
}

function aggregateTotals(sections: Section[]): ChangelogTotals {
  const totals: ChangelogTotals = { versions: 0, released: 0, entries: 0 };
  for (const s of sections) {
    if (s.kind === 'version') {
      totals.versions += 1;
      if (s.status === 'released') totals.released += 1;
      for (const sub of s.subsections) totals.entries += sub.entryCount;
    } else if (s.kind === 'group') {
      for (const v of s.versions) {
        totals.versions += 1;
        if (v.status === 'released') totals.released += 1;
        for (const sub of v.subsections) totals.entries += sub.entryCount;
      }
    } else {
      totals.entries += countEntries(s.bodyMarkdown);
    }
  }
  return totals;
}

const FILE_CACHE_TTL_MS = 2000;
let cache: { mtimeMs: number; expiresAt: number; doc: ChangelogDoc } | null = null;

export async function getChangelog(): Promise<ChangelogDoc> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.doc;
  const file = changelogPath();
  const st = await stat(file);
  if (cache && cache.mtimeMs === st.mtimeMs) {
    cache.expiresAt = now + FILE_CACHE_TTL_MS;
    return cache.doc;
  }
  const src = await readFile(file, 'utf8');
  const doc = parseChangelog(src, st.mtime.toISOString());
  cache = { mtimeMs: st.mtimeMs, expiresAt: now + FILE_CACHE_TTL_MS, doc };
  return doc;
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize);

/**
 * Render a slice of changelog markdown to a React element. No directive
 * or wikilink machinery — the changelog is plain markdown with strong/em,
 * inline code (we style it in `.changelog-prose`), and bullet lists.
 */
export async function renderChangelogMarkdown(md: string): Promise<ReactElement | null> {
  if (!md.trim()) return null;
  const tree = renderer.parse(md);
  const hast = await renderer.run(tree);
  return toJsxRuntime(hast as never, {
    Fragment,
    jsx: jsx as never,
    jsxs: jsxs as never,
  }) as ReactElement;
}
