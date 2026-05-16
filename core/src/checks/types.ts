import type { ParseResult } from '../gedcom/parser.ts';
import type { DerivedRecord } from '../gedcom/types.ts';
import type { PageMeta } from '../pages/types.ts';
import type { PlaceCoord } from '../family/places-coords.ts';

export interface LoadedPage {
  slug: string;
  path: string;            // absolute path
  meta: PageMeta;
  body: string;            // body only (frontmatter stripped). For prose-only inspection.
  text: string;            // full file contents, frontmatter included. For line-based fixes.
}

export interface RepoState {
  rootDir: string;
  gedcomPath: string;
  gedcomText: string;
  gedcomAst: ParseResult;
  pages: ReadonlyArray<LoadedPage>;
  derivedDir: string;
  derived: ReadonlyMap<string, DerivedRecord>;
  placesCoords: ReadonlyArray<PlaceCoord>;
}

export type FindingCategory = 'format' | 'data' | 'schema' | 'coverage' | 'consistency' | 'citation';
export type Severity = 'error' | 'warn' | 'info';

export interface Fix {
  /** Absolute path to the file the fix mutates. */
  file: string;
  /** Line-targeted replacement: replace the line at `lineNumber` with `newLine`. 1-indexed. */
  lineNumber: number;
  oldLine: string;
  newLine: string;
}

export interface Finding {
  category: FindingCategory;
  severity: Severity;
  message: string;
  location: { file: string; line?: number };
  fix?: Fix;
}

export type Detector = (state: RepoState) => Finding[];
