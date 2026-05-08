export interface SearchDoc {
  // Index signature satisfies FlexSearch's DocumentData constraint.
  [key: string]: string;
  slug: string;
  title: string;
  type: string;
  body: string;
  aliases: string;
  categories: string;
  places: string;
  occupations: string;
  related: string;
}

export interface SearchHit {
  slug: string;
  score?: number;
}

export interface SearchResult {
  slug: string;
  title: string;
  type: string;
  snippet?: string;
  /** Raw birth-place string from the joined derived record, if any. */
  place?: string | null;
  /** Coarse bucket used for the place facet — typically the trailing
   *  comma-separated component of the place string (country/region). */
  placeBucket?: string | null;
}
