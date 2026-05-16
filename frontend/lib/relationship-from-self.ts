import { computeRelationship } from '@core/family/relationship.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';

export interface RelationshipFromSelfInput {
  selfRecord: string;
  targetRecord: string;
  records: Map<string, DerivedRecord>;
  /** Resolver: given a GEDCOM record id and the person's name, return the wiki slug if a page exists. */
  findSlug: (record: string, name: string) => string | undefined;
}

export interface RelationshipCrumb {
  record: string;
  name: string;
  slug?: string;
}

export interface RelationshipFromSelf {
  /** Human-readable relationship label, e.g. "great-grandmother on your mother's side". */
  label: string;
  /** Path of crumbs from self → LCA → target, both endpoints included. */
  crumbs: ReadonlyArray<RelationshipCrumb>;
  /** Total path length (number of hops). Useful for emphasis: degree===1 is parent/child/spouse. */
  degree: number;
}

export function computeRelationshipFromSelf(
  input: RelationshipFromSelfInput,
): RelationshipFromSelf | null {
  const { selfRecord, targetRecord, records, findSlug } = input;
  if (targetRecord === selfRecord) return null;
  if (!records.has(targetRecord)) return null;
  if (!records.has(selfRecord)) return null;
  const rel = computeRelationship({ records, fromRecord: selfRecord, toRecord: targetRecord });
  if (!rel) return null;
  const crumbs: RelationshipCrumb[] = rel.path.map((record) => {
    const rec = records.get(record);
    const name = rec?.name ?? record;
    return { record, name, slug: findSlug(record, name) };
  });
  return {
    label: rel.label,
    crumbs,
    degree: rel.path.length - 1,
  };
}
