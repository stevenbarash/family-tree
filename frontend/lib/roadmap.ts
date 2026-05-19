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

function roadmapPath(): string {
  const override = process.env.WHOAMI_ROADMAP_PATH;
  if (override) return override;
  return path.resolve(process.cwd(), '..', 'docs', 'ROADMAP.md');
}

export type RoadmapSectionKind =
  | 'snapshot'
  | 'track'
  | 'parking'
  | 'cut'
  | 'shipped'
  | 'narrative';

export interface RoadmapSection {
  kind: RoadmapSectionKind;
  id: string;
  title: string;
  trackName: string | null;
  bodyMarkdown: string;
  itemCount: number;
}

export interface RoadmapTotals {
  tracks: number;
  shipped: number;
  inFlight: number;
  ready: number;
  parked: number;
  cut: number;
}

export interface RoadmapDoc {
  title: string;
  intro: string;
  lastUpdated: string | null;
  sections: RoadmapSection[];
  totals: RoadmapTotals;
  generatedAt: string;
}

interface MdNode {
  type: string;
  depth?: number;
  children?: MdNode[];
  value?: string;
  position?: { start: { offset: number }; end: { offset: number } };
}

function mdastToString(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  if (!node.children) return '';
  return node.children.map(c => mdastToString(c)).join('');
}

function parseHeadingText(node: MdNode): string {
  return mdastToString(node).trim();
}

function sliceSource(src: string, start: number | undefined, end: number | undefined): string {
  if (start == null || end == null) return '';
  return src.slice(start, end).trim();
}

function classify(title: string): { kind: RoadmapSectionKind; trackName: string | null } {
  if (/^Status snapshot/i.test(title)) return { kind: 'snapshot', trackName: null };
  if (/^Track:\s*/i.test(title)) {
    const trackName = title.replace(/^Track:\s*/i, '').trim();
    return { kind: 'track', trackName };
  }
  if (/^Parking lot/i.test(title)) return { kind: 'parking', trackName: null };
  if (/^Cut from roadmap/i.test(title)) return { kind: 'cut', trackName: null };
  if (/^Recently shipped/i.test(title)) return { kind: 'shipped', trackName: null };
  return { kind: 'narrative', trackName: null };
}

const TABLE_ROW_LINE_RE = /^\|[^|]+\|/gm;
const TABLE_HEADER_LINE_RE = /^\|\s*-+/gm;

function countTableRows(md: string): number {
  const totalRows = (md.match(TABLE_ROW_LINE_RE) ?? []).length;
  const headers = (md.match(TABLE_HEADER_LINE_RE) ?? []).length;
  return Math.max(0, totalRows - headers * 2);
}

function sectionId(title: string): string {
  return toSlug(title) || 'section';
}

function extractLastUpdated(intro: string): string | null {
  // Match "**Last updated:** 2026-05-19 (...)" — take just the YYYY-MM-DD,
  // since the parenthetical annotation often spans multiple lines and
  // looks truncated in the compact stats display.
  const m = intro.match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function aggregateTotals(sections: RoadmapSection[], src: string): RoadmapTotals {
  let tracks = 0;
  let parked = 0;
  let cut = 0;
  for (const s of sections) {
    if (s.kind === 'track') tracks += 1;
    if (s.kind === 'parking') parked += s.itemCount;
    if (s.kind === 'cut') cut += s.itemCount;
  }
  const shipped = (src.match(/✅/g) ?? []).length;
  const inFlight = (src.match(/🚧/g) ?? []).length;
  const ready = (src.match(/⏳/g) ?? []).length;
  return { tracks, shipped, inFlight, ready, parked, cut };
}

/**
 * Parse a ROADMAP.md string into a structured document. The roadmap is
 * a single-level H2 layout (no H3 subsections). Each H2 is classified
 * by title prefix:
 *
 *   "Status snapshot — ..."        → snapshot   (pulled to a hero card)
 *   "Track: <name>"                → track      (item table)
 *   "Parking lot ..."              → parking    (item table)
 *   "Cut from roadmap"             → cut        (item table)
 *   "Recently shipped ..."         → shipped    (historical table)
 *   anything else                  → narrative  (prose section)
 *
 * Body markdown for each section is the slice between its H2 and the
 * next H2 (or EOF). Tables, lists, and prose within a section render
 * via the same remark+rehype+sanitize pipeline as the changelog page.
 */
export function parseRoadmap(src: string, generatedAt: string): RoadmapDoc {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(src) as unknown as MdNode;
  const children = tree.children ?? [];

  const h1Idx = children.findIndex(n => n.type === 'heading' && n.depth === 1);
  const titleNode = h1Idx >= 0 ? children[h1Idx] : null;
  const title = titleNode ? parseHeadingText(titleNode) : 'Roadmap';

  const firstH2Idx = children.findIndex(n => n.type === 'heading' && n.depth === 2);
  const introStart = titleNode?.position?.end.offset;
  const introEnd = firstH2Idx >= 0 ? children[firstH2Idx].position?.start.offset : src.length;
  const intro = sliceSource(src, introStart, introEnd);

  const sections: RoadmapSection[] = [];
  for (let i = firstH2Idx; i >= 0 && i < children.length; ) {
    const h2 = children[i];
    if (h2.type !== 'heading' || h2.depth !== 2) {
      i += 1;
      continue;
    }
    let nextH2Idx = children.length;
    for (let j = i + 1; j < children.length; j += 1) {
      const next = children[j];
      if (next.type === 'heading' && next.depth === 2) {
        nextH2Idx = j;
        break;
      }
    }

    const headingText = parseHeadingText(h2);
    const { kind, trackName } = classify(headingText);
    const body = sliceSource(
      src,
      h2.position?.end.offset,
      children[nextH2Idx]?.position?.start.offset ?? src.length,
    );

    sections.push({
      kind,
      id: sectionId(headingText),
      title: headingText,
      trackName,
      bodyMarkdown: body,
      itemCount: countTableRows(body),
    });

    i = nextH2Idx;
  }

  return {
    title,
    intro,
    lastUpdated: extractLastUpdated(intro),
    sections,
    totals: aggregateTotals(sections, src),
    generatedAt,
  };
}

const FILE_CACHE_TTL_MS = 2000;
let cache: { mtimeMs: number; expiresAt: number; doc: RoadmapDoc } | null = null;

export async function getRoadmap(): Promise<RoadmapDoc> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.doc;
  const file = roadmapPath();
  const st = await stat(file);
  if (cache && cache.mtimeMs === st.mtimeMs) {
    cache.expiresAt = now + FILE_CACHE_TTL_MS;
    return cache.doc;
  }
  const src = await readFile(file, 'utf8');
  const doc = parseRoadmap(src, st.mtime.toISOString());
  cache = { mtimeMs: st.mtimeMs, expiresAt: now + FILE_CACHE_TTL_MS, doc };
  return doc;
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize);

/**
 * Render a slice of roadmap markdown to a React element. Uses the same
 * remark+rehype+sanitize pipeline as the changelog; tables, lists,
 * inline code, and links all flow through unmodified.
 */
export async function renderRoadmapMarkdown(md: string): Promise<ReactElement | null> {
  if (!md.trim()) return null;
  const tree = renderer.parse(md);
  const hast = await renderer.run(tree);
  return toJsxRuntime(hast as never, {
    Fragment,
    jsx: jsx as never,
    jsxs: jsxs as never,
  }) as ReactElement;
}
