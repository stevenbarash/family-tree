import { AncestorTile } from '@/components/family/ancestor-tile';
import { RegistryCard } from '@/components/family/registry-card';
import { roman } from '@/lib/utils';
import type { BrowserDescendantView, FamilyTreeView } from '@/lib/family';
import { MobileDisclosure } from './mobile-disclosure';
import { DESCENDANT_HEADING, GenerationHeader, SectionHeader, familyTreeHref } from './shared';

interface Props {
  view: FamilyTreeView;
}

export function DescendantsSection({ view }: Props) {
  if (view.descendants.total === 0) return null;

  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '120ms' }}>
      <SectionHeader title="Descendants" count={view.descendants.total} />
      <MobileDisclosure storageKey="descendants">
        <RegistryCard>
          {view.descendants.byGeneration.map(group => (
            <DescendantsBlock
              key={`desc-${group.generation}`}
              generation={group.generation}
              people={group.people}
            />
          ))}
        </RegistryCard>
      </MobileDisclosure>
    </section>
  );
}

function DescendantsBlock({
  generation,
  people,
}: {
  generation: number;
  people: BrowserDescendantView[];
}) {
  const heading = DESCENDANT_HEADING[generation] ?? `Generation +${generation}`;
  return (
    <section className="border-b rule-hair last:border-b-0">
      <GenerationHeader
        ordinal={`+${roman(generation)}`}
        heading={heading}
        count={String(people.length).padStart(2, '0')}
      />
      <div className="grid gap-x-2 px-2 pb-1.5 sm:grid-cols-2">
        {people.map((p, i) => (
          <AncestorTile
            key={`desc-${p.record}-${i}`}
            href={familyTreeHref(p.record)}
            name={p.name}
            meta={[p.detail, `via ${p.via}`].filter(Boolean).join('  ·  ')}
            ordinal={roman(i + 1).toLowerCase()}
            portrait={p.portrait}
          />
        ))}
      </div>
    </section>
  );
}
