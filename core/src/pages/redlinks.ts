import { WIKILINK_RE, canonical } from './wikilinks.ts';

export interface RedlinkEntry {
  target: string;
  canonical: string;
  count: number;
  sources: string[];
}

export function findRedlinks(
  pages: ReadonlyArray<{ slug: string; body: string }>,
  resolvableCanonicals: ReadonlySet<string>,
): RedlinkEntry[] {
  const byCanon = new Map<string, RedlinkEntry>();
  for (const page of pages) {
    const seenInPage = new Set<string>();
    for (const m of page.body.matchAll(WIKILINK_RE)) {
      const target = m[1]!.trim();
      const c = canonical(target);
      if (resolvableCanonicals.has(c)) continue;
      if (seenInPage.has(c)) continue;
      seenInPage.add(c);
      let entry = byCanon.get(c);
      if (!entry) {
        entry = { target, canonical: c, count: 0, sources: [] };
        byCanon.set(c, entry);
      }
      entry.count += 1;
      entry.sources.push(page.slug);
    }
  }
  return [...byCanon.values()].sort(
    (a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical),
  );
}
