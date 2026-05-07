import { WIKILINK_RE, canonical } from '@core/pages/wikilinks.ts';

export interface IndexEntry {
  slug: string;
  title: string;
  aliases: string[];
}

export interface SlugIndex {
  byCanonical: Map<string, string>;
}

export function buildSlugIndex(entries: IndexEntry[]): SlugIndex {
  const byCanonical = new Map<string, string>();
  for (const e of entries) {
    byCanonical.set(canonical(e.title), e.slug);
    for (const a of e.aliases) byCanonical.set(canonical(a), e.slug);
  }
  return { byCanonical };
}

export function resolveWikilinks(md: string, index: SlugIndex): string {
  return md.replace(WIKILINK_RE, (_, target: string, anchor?: string, label?: string) => {
    const slug = index.byCanonical.get(canonical(target));
    const text = label ?? (anchor ? `${target}#${anchor}` : target);
    if (!slug) return `<span class="redlink" title="Page not yet written">${text}</span>`;
    const href = anchor
      ? `/${slug}#${anchor.toLowerCase().replace(/\s+/g, '-')}`
      : `/${slug}`;
    return `[${text}](${href})`;
  });
}
