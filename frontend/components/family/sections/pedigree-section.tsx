import '@xyflow/react/dist/style.css';
import { getTranslations } from 'next-intl/server';
import { layoutPedigree } from '@core/family/pedigree-layout.ts';
import type { BrowserPerson } from '@core/family/browser.ts';
import { getCachedDerivedRecords } from '@/lib/family';
import type { FamilyTreeView, BrowserPersonView } from '@/lib/family';
import PedigreeChart from '@/components/family/pedigree-chart-dynamic.client';
import { familyTreeHref } from './shared';
import { AncestorTile } from '@/components/family/ancestor-tile';
import { SectionHeader } from './shared';

const MAX_GENERATION = 4;
const NODE_HALF_WIDTH = 88; // half of `w-44` from PedigreeNode
const NODE_HALF_HEIGHT = 28; // approx half-height of the rendered card

function kinshipLabelKey(
  generation: number,
  side: 'paternal' | 'maternal',
  role: 'father' | 'mother',
): { key: 'kinship.father' } | { key: 'kinship.mother' } | { key: 'kinship.paternalGrandfather' } | { key: 'kinship.paternalGrandmother' } | { key: 'kinship.maternalGrandfather' } | { key: 'kinship.maternalGrandmother' } | { key: 'kinship.unknownAncestor'; vars: { n: string } } {
  if (generation === 1) {
    if (role === 'father') return { key: 'kinship.father' };
    return { key: 'kinship.mother' };
  }
  if (generation === 2) {
    if (side === 'paternal') {
      if (role === 'father') return { key: 'kinship.paternalGrandfather' };
      return { key: 'kinship.paternalGrandmother' };
    }
    if (role === 'father') return { key: 'kinship.maternalGrandfather' };
    return { key: 'kinship.maternalGrandmother' };
  }
  // gen 3+: generic template "Unknown {n}-great-grandparent"
  return { key: 'kinship.unknownAncestor', vars: { n: String(generation - 2) } };
}

interface Props {
  view: FamilyTreeView;
}

function formatYears(p: BrowserPersonView): string | null {
  const b = p.birth?.date ?? null;
  const d = p.death?.date ?? null;
  if (!b && !d) return null;
  const by = b?.match(/\b(\d{4})\b/)?.[1] ?? '?';
  const dy = d?.match(/\b(\d{4})\b/)?.[1] ?? '';
  return dy ? `${by}–${dy}` : `b. ${by}`;
}

export async function PedigreeSection({ view }: Props) {
  const t = await getTranslations('Page.FamilyTree.pedigree');

  // Flatten generations into a single ancestor array for the pure layout.
  const ancestors: BrowserPersonView[] = [];
  for (const gen of view.byGeneration) {
    for (const p of gen.paternal) ancestors.push(p);
    for (const p of gen.maternal) ancestors.push(p);
  }
  if (ancestors.length === 0) {
    return (
      <section className="mb-12">
        <SectionHeader title={t('title')} count={0} />
        <p className="font-display text-sm text-muted-foreground">{t('emptyState')}</p>
      </section>
    );
  }

  const recordLookup = getCachedDerivedRecords();
  const layout = layoutPedigree({
    focal: view.root as BrowserPerson,
    ancestors: ancestors as BrowserPerson[],
    maxGeneration: MAX_GENERATION,
    includeFrontier: true,
    recordLookup,
  });

  // Index ancestors by record for cheap lookup when building node data.
  const byRecord = new Map<string, BrowserPersonView>();
  byRecord.set(view.root.record, view.root);
  for (const a of ancestors) byRecord.set(a.record, a);

  const nodes = layout.nodes.map((n) => {
    if (n.kind === 'present') {
      const person = byRecord.get(n.record);
      const name = person?.name ?? n.record;
      const years = person ? formatYears(person) : null;
      const generationLabel = n.generation === 0
        ? t('selfLabel')
        : t('generationLabel', { n: String(n.generation) });
      return {
        id: n.record,
        type: 'pedigree' as const,
        position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
        data: {
          record: n.record,
          name,
          years,
          portrait: person?.portrait,
          isFocal: n.generation === 0,
          href: familyTreeHref(n.record),
        },
      };
    }
    // Frontier node — render a dashed placeholder for the missing parent.
    const labelSpec = kinshipLabelKey(n.generation, n.side, n.role);
    const kinshipLabel = 'vars' in labelSpec ? t(labelSpec.key, labelSpec.vars) : t(labelSpec.key);
    return {
      id: n.id,
      type: 'frontier' as const,
      position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
      data: {
        kinshipLabel,
        missingLabel: t('frontierMissing'),
        ariaLabel: t('frontierAriaLabel', { kinship: kinshipLabel }),
        descendantRecord: n.descendantRecord,
        href: familyTreeHref(n.descendantRecord),
      },
    };
  });

  const edges = layout.edges.map(e => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    frontier: e.source.startsWith('frontier:'),
  }));

  return (
    <section className="mb-12">
      <SectionHeader title={t('title')} count={layout.nodes.filter(n => n.kind === 'present').length} />

      {/* Desktop: interactive chart */}
      <div className="hidden md:block">
        <PedigreeChart
          nodes={nodes}
          edges={edges}
          ariaLabel={t('chartAriaLabel', { n: String(layout.nodes.filter(n => n.kind === 'present').length) })}
        />
      </div>

      {/* Mobile: stacked generations list — keep what works */}
      <div className="md:hidden">
        <ol className="space-y-3" aria-label={t('navigateAria')}>
          {view.byGeneration.slice(0, MAX_GENERATION).map(gen => (
            <li key={`pedigree-mobile-gen-${gen.generation}`}>
              <div className="mb-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                {t('mobileGenerationHeader', { n: String(gen.generation) })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[...gen.paternal, ...gen.maternal].map((p, i) => (
                  <AncestorTile
                    key={`pedigree-mobile-${p.record}-${i}`}
                    href={familyTreeHref(p.record)}
                    name={p.name}
                    meta={formatYears(p) ?? ''}
                    ordinal=""
                    portrait={p.portrait}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
