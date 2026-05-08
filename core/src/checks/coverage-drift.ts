import type { Detector, Finding, RepoState } from './types.ts';
import { findRedlinks } from '../pages/redlinks.ts';
import { joinCoords } from '../family/places-coords.ts';
import type { PlacesPerson } from '../family/places.ts';
import { canonical } from '../pages/wikilinks.ts';

export const detectCoverageDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];

  // 1. Redlinks
  const resolvable = new Set<string>();
  for (const p of state.pages) resolvable.add(canonical(p.slug.replace(/-/g, ' ')));
  for (const p of state.pages) resolvable.add(canonical(p.meta.title));

  const redlinks = findRedlinks(
    state.pages.map(p => ({ slug: p.slug, body: p.body })),
    resolvable,
  );
  for (const r of redlinks) {
    findings.push({
      category: 'coverage',
      severity: 'info',
      message: `redlink: [[${r.target}]] referenced by ${r.count} page${r.count === 1 ? '' : 's'} (${r.sources.slice(0, 3).join(', ')}${r.sources.length > 3 ? '…' : ''})`,
      location: { file: state.rootDir },
    });
  }

  // 2. Unmapped places — every place string from derived YAMLs that doesn't resolve via joinCoords.
  const people: PlacesPerson[] = [];
  for (const [, record] of state.derived) {
    if (record.birth?.place) {
      people.push({ place: record.birth.place, record: record.record, name: record.name });
    }
    if (record.death?.place) {
      people.push({ place: record.death.place, record: record.record, name: record.name });
    }
  }
  const { unmapped } = joinCoords({ coords: [...state.placesCoords], people });
  for (const u of unmapped) {
    findings.push({
      category: 'coverage',
      severity: 'info',
      message: `unmapped place: "${u.place}" referenced by ${u.people.length} record${u.people.length === 1 ? '' : 's'} (add an alias or new entry to genealogy/places-coords.yml)`,
      location: { file: state.rootDir },
    });
  }

  // 3. Orphan derived — derived records with no page covering them.
  const recordsWithPages = new Set<string>();
  for (const p of state.pages) {
    if (p.meta.gedcom?.record) recordsWithPages.add(p.meta.gedcom.record);
  }
  for (const [id] of state.derived) {
    if (!recordsWithPages.has(id)) {
      findings.push({
        category: 'coverage',
        severity: 'info',
        message: `orphan derived: ${id} (${state.derived.get(id)!.name}) has no page`,
        location: { file: state.rootDir },
      });
    }
  }

  return findings;
};
