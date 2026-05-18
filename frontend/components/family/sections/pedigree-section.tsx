import '@xyflow/react/dist/style.css';
import { getTranslations } from 'next-intl/server';
import { layoutPedigree, type PedigreeNode as LayoutNode } from '@core/family/pedigree-layout.ts';
import type { BrowserPerson } from '@core/family/browser.ts';
import type { FamilyTreeView, BrowserPersonView } from '@/lib/family';
import PedigreeChart from '@/components/family/pedigree-chart-dynamic.client';
import { familyTreeHref, SectionHeader } from './shared';
import { AncestorTile } from '@/components/family/ancestor-tile';

const MAX_GENERATION = 4;
const NODE_HALF_WIDTH = 88; // half of `w-44` from PedigreeNode
const NODE_HALF_HEIGHT = 28; // approx half-height of the rendered card

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

  const layout = layoutPedigree({
    focal: view.root as BrowserPerson,
    ancestors: ancestors as BrowserPerson[],
    maxGeneration: MAX_GENERATION,
  });

  // Index ancestors by record for cheap lookup when building node data.
  const byRecord = new Map<string, BrowserPersonView>();
  byRecord.set(view.root.record, view.root);
  for (const a of ancestors) byRecord.set(a.record, a);

  const nodes = layout.nodes.map((n: LayoutNode) => {
    const person = byRecord.get(n.record);
    const name = person?.name ?? n.record;
    const years = person ? formatYears(person) : null;
    const generationLabel = n.generation === 0 ? 'self' : `generation ${n.generation}`;
    return {
      id: n.record,
      position: { x: n.x - NODE_HALF_WIDTH, y: n.y - NODE_HALF_HEIGHT },
      data: {
        record: n.record,
        name,
        years,
        portrait: person?.portrait,
        isFocal: n.generation === 0,
        href: familyTreeHref(n.record),
      },
      // Per-node aria-label applied by React Flow via domAttributes; complements
      // the <a aria-label> on the inner link (screen readers benefit from both).
      ariaLabel: `${name}, ${generationLabel}${years ? `, ${years}` : ''}`,
    };
  });
  const edges = layout.edges.map(e => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
  }));

  return (
    <section className="mb-12">
      <SectionHeader title={t('title')} count={layout.nodes.length} />

      {/* Desktop: interactive chart */}
      <div className="hidden md:block">
        <PedigreeChart nodes={nodes} edges={edges} />
      </div>

      {/* Mobile: stacked generations list — keep what works */}
      <div className="md:hidden">
        <ol className="space-y-3" aria-label={t('navigateAria')}>
          {view.byGeneration.slice(0, MAX_GENERATION).map(gen => (
            <li key={`pedigree-mobile-gen-${gen.generation}`}>
              <div className="mb-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                Generation {gen.generation}
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
