import { GroupedList } from '@/components/family/grouped-list';
import { PersonRow } from '@/components/family/person-row';
import { roman } from '@/lib/utils';
import type { FamilyTreeView } from '@/lib/family';
import type { PedigreeKind } from '@core/gedcom/types.ts';
import { RelationLabel, SectionHeader, familyTreeHref, joinMeta, relationMeta } from './shared';

const PEDIGREE_FAMILY_LABEL: Record<PedigreeKind, string> = {
  adopted: 'Adoptive family',
  foster: 'Foster family',
  sealing: 'Sealed family',
};

interface Props {
  view: FamilyTreeView;
}

function MarriageMeta({
  marriedDate,
  marriedPlace,
}: {
  marriedDate: string | null;
  marriedPlace: string | null;
}) {
  const text = joinMeta([
    marriedDate ? `m. ${marriedDate}` : null,
    marriedPlace,
  ]);
  if (!text) return null;
  return (
    <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
      {text}
    </span>
  );
}

export function FamilySection({ view }: Props) {
  const { familyOfOrigin, marriages } = view.selectedFamilies;
  const stepFamilies = view.selectedStepFamilies;
  const cousins = view.cohort.cousins;

  // Half-siblings appear inside step-family cards when their parent's other
  // marriage is in the GEDCOM. Anything not represented falls through to a
  // standalone group so they don't disappear silently.
  const halfInStepCards = new Set<string>(
    stepFamilies.flatMap(sf => sf.halfSiblings.map(h => h.record)),
  );
  const standaloneHalfSiblings = view.cohort.siblings.filter(
    s => s.kind === 'half' && !halfInStepCards.has(s.record),
  );

  const familyMembers =
    familyOfOrigin.reduce(
      (acc, f) => acc + (f.father ? 1 : 0) + (f.mother ? 1 : 0) + f.siblings.length,
      0,
    ) +
    marriages.reduce((acc, m) => acc + (m.spouse ? 1 : 0) + m.children.length, 0) +
    stepFamilies.reduce(
      (acc, sf) => acc + (sf.stepParent ? 1 : 0) + sf.halfSiblings.length,
      0,
    );
  const total = familyMembers + standaloneHalfSiblings.length + cousins.length;

  if (total === 0) return null;

  const fooHeader = (foo: FamilyTreeView['selectedFamilies']['familyOfOrigin'][number], idx: number) => {
    const base = foo.pedigree ? PEDIGREE_FAMILY_LABEL[foo.pedigree] : 'Family of origin';
    return familyOfOrigin.length > 1 ? `${base} (${roman(idx + 1).toLowerCase()})` : base;
  };
  const marrLabel = (idx: number) =>
    marriages.length > 1 ? `Marriage (${roman(idx + 1).toLowerCase()})` : 'Marriage';
  const stepLabel = (sf: FamilyTreeView['selectedStepFamilies'][number]) => {
    const base = sf.via.role === 'father' ? "Father's other marriage" : "Mother's other marriage";
    const sameParentCount = stepFamilies.filter(s => s.via.record === sf.via.record).length;
    if (sameParentCount === 1) return base;
    const idxAmongParent = stepFamilies
      .filter(s => s.via.record === sf.via.record)
      .findIndex(s => s.fam === sf.fam);
    return `${base} (${roman(idxAmongParent + 1).toLowerCase()})`;
  };

  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '80ms' }}>
      <SectionHeader title="Family" count={total} />
      <div className="flex flex-col gap-6">
        {familyOfOrigin.map((foo, idx) => (
          <GroupedList
            key={`foo-${foo.fam}`}
            title={fooHeader(foo, idx)}
            action={<MarriageMeta marriedDate={foo.marriedDate} marriedPlace={foo.marriedPlace} />}
          >
            {foo.father ? (
              <PersonRow
                href={familyTreeHref(foo.father.record)}
                name={foo.father.name}
                meta={relationMeta(foo.father)}
                portrait={foo.father.portrait}
                trailing={<RelationLabel>father</RelationLabel>}
              />
            ) : null}
            {foo.mother ? (
              <PersonRow
                href={familyTreeHref(foo.mother.record)}
                name={foo.mother.name}
                meta={relationMeta(foo.mother)}
                portrait={foo.mother.portrait}
                trailing={<RelationLabel>mother</RelationLabel>}
              />
            ) : null}
            {foo.siblings.map((s, i) => (
              <PersonRow
                key={`sib-${s.record}`}
                href={familyTreeHref(s.record)}
                name={s.name}
                ordinal={roman(i + 1).toLowerCase()}
                meta={relationMeta(s)}
                portrait={s.portrait}
                trailing={<RelationLabel>sibling</RelationLabel>}
              />
            ))}
          </GroupedList>
        ))}

        {marriages.map((m, idx) => (
          <GroupedList
            key={`marr-${m.fam}`}
            title={marrLabel(idx)}
            action={<MarriageMeta marriedDate={m.marriedDate} marriedPlace={m.marriedPlace} />}
          >
            {m.spouse ? (
              <PersonRow
                href={familyTreeHref(m.spouse.record)}
                name={m.spouse.name}
                meta={relationMeta(m.spouse)}
                portrait={m.spouse.portrait}
                trailing={<RelationLabel>spouse</RelationLabel>}
              />
            ) : null}
            {m.children.map((c, i) => (
              <PersonRow
                key={`chil-${c.record}`}
                href={familyTreeHref(c.record)}
                name={c.name}
                ordinal={roman(i + 1).toLowerCase()}
                meta={relationMeta(c)}
                portrait={c.portrait}
                trailing={<RelationLabel>child</RelationLabel>}
              />
            ))}
          </GroupedList>
        ))}

        {stepFamilies.map(sf => {
          const stepRole = sf.via.role === 'father' ? 'step-mother' : 'step-father';
          return (
            <GroupedList
              key={`step-${sf.fam}`}
              title={stepLabel(sf)}
              action={<MarriageMeta marriedDate={sf.marriedDate} marriedPlace={sf.marriedPlace} />}
            >
              {sf.stepParent ? (
                <PersonRow
                  href={familyTreeHref(sf.stepParent.record)}
                  name={sf.stepParent.name}
                  meta={relationMeta(sf.stepParent)}
                  portrait={sf.stepParent.portrait}
                  trailing={<RelationLabel>{stepRole}</RelationLabel>}
                />
              ) : null}
              {sf.halfSiblings.map((h, i) => (
                <PersonRow
                  key={`half-in-${sf.fam}-${h.record}`}
                  href={familyTreeHref(h.record)}
                  name={h.name}
                  ordinal={roman(i + 1).toLowerCase()}
                  meta={relationMeta(h)}
                  portrait={h.portrait}
                  trailing={<RelationLabel>half-sibling</RelationLabel>}
                />
              ))}
            </GroupedList>
          );
        })}

        {standaloneHalfSiblings.length > 0 ? (
          <GroupedList title={`Half-siblings (${standaloneHalfSiblings.length})`}>
            {standaloneHalfSiblings.map((s, i) => (
              <PersonRow
                key={`half-${s.record}`}
                href={familyTreeHref(s.record)}
                name={s.name}
                ordinal={roman(i + 1).toLowerCase()}
                meta={s.detail}
                portrait={s.portrait}
                trailing={<RelationLabel>half-sibling</RelationLabel>}
              />
            ))}
          </GroupedList>
        ) : null}

        {cousins.length > 0 ? (
          <GroupedList title={`First cousins (${cousins.length})`}>
            {cousins.map((c, i) => (
              <PersonRow
                key={`cousin-${c.record}`}
                href={familyTreeHref(c.record)}
                name={c.name}
                ordinal={roman(i + 1).toLowerCase()}
                meta={[c.detail, `via ${c.via}`].filter(Boolean).join('  ·  ')}
                portrait={c.portrait}
                trailing={<RelationLabel>cousin</RelationLabel>}
              />
            ))}
          </GroupedList>
        ) : null}
      </div>
    </section>
  );
}
