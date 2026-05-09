import { Document } from 'flexsearch';
import type { SearchDoc, SearchHit } from './types.ts';

export interface UpsertOptions {
  /** When true, the doc is hidden from default queries — used by the
   *  privacy gate to keep living-person details out of search results.
   *  Restricted docs still get indexed (so `--include-living` queries
   *  can find them); the filter is applied at query time. */
  restricted?: boolean;
}

export interface QueryOptions {
  limit?: number;
  /** When true, restricted docs are returned alongside public ones.
   *  Defaults to false — callers must opt in explicitly. */
  includeRestricted?: boolean;
}

export interface SearchIndex {
  upsert(doc: SearchDoc, opts?: UpsertOptions): void;
  remove(slug: string): void;
  query(q: string, opts?: QueryOptions): SearchHit[];
  /** Snapshot of the slugs currently flagged restricted. Used by
   *  `persist.ts` to round-trip the privacy state. */
  restrictedSlugs(): ReadonlySet<string>;
  /** Replace the restricted-slug set wholesale. Used by `persist.ts`
   *  on load — callers shouldn't normally touch this. */
  setRestrictedSlugs(slugs: Iterable<string>): void;
  // Internal: exposed for persistence in persist.ts.
  _raw(): Document<SearchDoc>;
}

export function createSearchIndex(): SearchIndex {
  const raw = makeIndex();
  const restricted = new Set<string>();
  return {
    upsert(doc, opts = {}) {
      raw.add(doc);
      if (opts.restricted) restricted.add(doc.slug);
      else restricted.delete(doc.slug);
    },
    remove(slug) {
      raw.remove(slug);
      restricted.delete(slug);
    },
    query(q, opts = {}) {
      const limit = opts.limit ?? 25;
      if (!q.trim()) return [];
      // Pull more raw hits than `limit` so we can drop restricted slugs and
      // still return up to `limit` public results without a second query.
      const rawLimit = opts.includeRestricted ? limit : limit * 3;
      const results = raw.search(q, { limit: rawLimit });
      const slugs = new Set<string>();
      for (const fieldResult of results) {
        for (const id of fieldResult.result) slugs.add(String(id));
      }
      let filtered = [...slugs];
      if (!opts.includeRestricted) filtered = filtered.filter(s => !restricted.has(s));
      return filtered.slice(0, limit).map(slug => ({ slug }));
    },
    restrictedSlugs() { return restricted; },
    setRestrictedSlugs(slugs) {
      restricted.clear();
      for (const s of slugs) restricted.add(s);
    },
    _raw() { return raw; },
  };
}

function makeIndex(): Document<SearchDoc> {
  return new Document<SearchDoc>({
    document: {
      id: 'slug',
      index: [
        { field: 'title',       tokenize: 'forward' },
        { field: 'aliases',     tokenize: 'forward' },
        { field: 'categories',  tokenize: 'forward' },
        { field: 'places',      tokenize: 'forward' },
        { field: 'related',     tokenize: 'forward' },
        { field: 'occupations', tokenize: 'forward' },
        { field: 'body',        tokenize: 'strict' },
        { field: 'type',        tokenize: 'strict' },
      ],
    },
    tokenize: 'forward',
  });
}
