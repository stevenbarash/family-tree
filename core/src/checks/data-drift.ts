import type { Detector, Finding, RepoState, LoadedPage } from './types.ts';
import type { Correction } from '../pages/types.ts';
import type { DerivedRecord } from '../gedcom/types.ts';

interface SourcedCorrection extends Correction {
  pagePath: string;
}

function flatCorrections(pages: ReadonlyArray<LoadedPage>, opts: { canonicalOnly?: boolean } = {}): SourcedCorrection[] {
  const out: SourcedCorrection[] = [];
  for (const p of pages) {
    if (!p.meta.corrections || p.meta.corrections.length === 0) continue;
    // Translation files (lang is set to a non-en BCP 47 code) carry
    // derivative corrections — locale-prose translations of the SAME
    // factual correction asserted by the canonical EN page. When asked
    // to compute conflicts (canonicalOnly), skip them: comparing the
    // English correction's prose against its Russian/Hebrew translation
    // would always look like a conflict but isn't one.
    if (opts.canonicalOnly && p.meta.lang !== undefined && p.meta.lang !== 'en') continue;
    const pageRecord = p.meta.gedcom?.record;
    for (const c of p.meta.corrections) {
      const target = c.record ?? pageRecord;
      if (!target) continue; // drop: no record to attach to
      out.push({ ...c, record: target, pagePath: p.path });
    }
  }
  return out;
}

function rawFieldValue(record: DerivedRecord, field: Correction['field']): string | null {
  switch (field) {
    case 'name': return record.name;
    case 'birth.date': return record.birth?.date ?? null;
    case 'birth.place': return record.birth?.place ?? null;
    case 'death.date': return record.death?.date ?? null;
    case 'death.place': return record.death?.place ?? null;
  }
}

export const detectDataDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  // For conflict detection, only consider canonical EN corrections —
  // translations are derivatives and would always "conflict" on the
  // translated prose. For per-correction classification (active /
  // promotable / orphan), include everything so each page's overlay
  // surfaces individually.
  const conflictCorrections = flatCorrections(state.pages, { canonicalOnly: true });
  const corrections = flatCorrections(state.pages);

  // Detect conflicts: same (record, field) with different values, from different canonical pages.
  const byKey = new Map<string, SourcedCorrection[]>();
  for (const c of conflictCorrections) {
    const key = `${c.record}::${c.field}`;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }

  const conflictKeys = new Set<string>();
  for (const [key, arr] of byKey) {
    const distinct = new Set(arr.map(c => c.value));
    if (distinct.size > 1) {
      conflictKeys.add(key);
      const values = [...distinct].map(v => `"${v}"`).join(' vs ');
      const sources = arr.map(c => c.pagePath).join(', ');
      findings.push({
        category: 'data',
        severity: 'error',
        message: `conflict on ${arr[0]!.record}/${arr[0]!.field}: ${values} (sources: ${sources})`,
        location: { file: arr[0]!.pagePath },
      });
    }
  }

  // Per-correction classification (skip those involved in conflicts — already reported).
  for (const c of corrections) {
    const key = `${c.record}::${c.field}`;
    if (conflictKeys.has(key)) continue;
    const record = state.derived.get(c.record!);
    if (!record) {
      findings.push({
        category: 'data',
        severity: 'error',
        message: `correction targets record ${c.record} which is not found in derived YAMLs`,
        location: { file: c.pagePath },
      });
      continue;
    }
    const raw = rawFieldValue(record, c.field);
    if (raw === c.value) {
      findings.push({
        category: 'data',
        severity: 'info',
        message: `promotable correction ${c.record}/${c.field} = "${c.value}" (GEDCOM already matches; drop or run \`wai promote-corrections --record ${c.record} --apply\`)`,
        location: { file: c.pagePath },
      });
    } else {
      findings.push({
        category: 'data',
        severity: 'info',
        message: `active correction ${c.record}/${c.field}: page "${c.value}" overlays GEDCOM "${raw ?? '(null)'}"`,
        location: { file: c.pagePath },
      });
    }
  }

  return findings;
};
