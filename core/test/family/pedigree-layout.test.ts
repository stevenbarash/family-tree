import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPedigree } from '../../src/family/pedigree-layout.ts';
import type { BrowserPerson } from '../../src/family/browser.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function makePerson(
  record: string,
  generation: number,
  side: 'self' | 'paternal' | 'maternal',
  pathFromRoot: string[],
  role?: 'father' | 'mother',
): BrowserPerson {
  return {
    record,
    name: record,
    birth: null,
    death: null,
    generation,
    side,
    role,
    label: '',
    pathFromRoot,
  };
}

test('layoutPedigree: empty ancestors returns only the focal node at origin', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const result = layoutPedigree({ focal, ancestors: [], maxGeneration: 4 });
  assert.equal(result.nodes.length, 1);
  assert.deepEqual(result.nodes[0], { kind: 'present', record: 'I1', x: 0, y: 0, generation: 0, side: 'self' });
  assert.deepEqual(result.edges, []);
});

test('layoutPedigree: 1 generation places father left, mother right', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const mother = makePerson('I3', 1, 'maternal', ['I3'], 'mother');
  const result = layoutPedigree({ focal, ancestors: [father, mother], maxGeneration: 4 });

  const fatherNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
  const motherNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I3')!;

  assert.ok(fatherNode.x < 0, `father should be left of center, got x=${fatherNode.x}`);
  assert.ok(motherNode.x > 0, `mother should be right of center, got x=${motherNode.x}`);
  assert.equal(fatherNode.x, -motherNode.x, 'father and mother should be symmetric');
  assert.equal(fatherNode.y, mother.generation * -180);
  assert.equal(result.edges.length, 2);
  assert.deepEqual(result.edges.sort((a, b) => a.source.localeCompare(b.source)), [
    { source: 'I2', target: 'I1' },
    { source: 'I3', target: 'I1' },
  ]);
});

test('layoutPedigree: 3 generations spread monotonically by horizontal position', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const mother = makePerson('I3', 1, 'maternal', ['I3'], 'mother');
  const ff = makePerson('I4', 2, 'paternal', ['I2', 'I4'], 'father');
  const fm = makePerson('I5', 2, 'paternal', ['I2', 'I5'], 'mother');
  const mf = makePerson('I6', 2, 'maternal', ['I3', 'I6'], 'father');
  const mm = makePerson('I7', 2, 'maternal', ['I3', 'I7'], 'mother');
  const result = layoutPedigree({
    focal,
    ancestors: [father, mother, ff, fm, mf, mm],
    maxGeneration: 4,
  });

  // Generation 2 should be evenly spread, monotonic L→R: ff < fm < mf < mm
  const g2 = result.nodes.filter(n => n.kind === 'present' && n.generation === 2).sort((a, b) => a.x - b.x);
  assert.deepEqual(g2.map(n => (n.kind === 'present' ? n.record : '')), ['I4', 'I5', 'I6', 'I7']);
  // Edges include child→parent at each step
  assert.ok(result.edges.some(e => e.source === 'I4' && e.target === 'I2'));
  assert.ok(result.edges.some(e => e.source === 'I7' && e.target === 'I3'));
});

test('layoutPedigree: asymmetric tree (only paternal line) collapses to a vertical column', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  const result = layoutPedigree({ focal, ancestors: [father, ff], maxGeneration: 4 });

  assert.equal(result.nodes.length, 3);
  // Adaptive layout: a single-lineage chain (no siblings to spread against)
  // stacks vertically below the focal. Encodes the "use only the space you
  // need" invariant — asymmetric trees don't waste horizontal whitespace
  // showing missing-ancestor slots.
  for (const node of result.nodes) {
    if (node.kind !== 'present') continue;
    assert.equal(node.x, 0, `${node.record} should be on the focal's vertical column (x=0)`);
  }
});

test('layoutPedigree: maxGeneration clamps the visible nodes', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const deep = makePerson('I9', 6, 'paternal', ['a', 'b', 'c', 'd', 'e', 'I9'], 'father');
  const result = layoutPedigree({ focal, ancestors: [deep], maxGeneration: 4 });
  assert.equal(result.nodes.find(n => n.kind === 'present' && n.record === 'I9'), undefined,
    'ancestor beyond maxGeneration should be filtered out');
});

test('layoutPedigree: a sole ancestor with no sibling is placed on the focal column', () => {
  const focal = makePerson('I1', 0, 'self', []);
  // One ancestor at generation 1, no sibling. Adaptive layout has no second
  // child to spread against — places this node on the focal's vertical column.
  const lone = makePerson('I2', 1, 'paternal', ['I2']);
  const result = layoutPedigree({ focal, ancestors: [lone], maxGeneration: 4 });

  const node = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
  assert.equal(node.x, 0,
    'a single ancestor with no sibling collapses to focal column under adaptive layout');
});

test('layoutPedigree: edges from clamped-out ancestors are not constructed', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  // Deep ancestor beyond maxGeneration — should be filtered, AND
  // any edge it would have produced (deep → father) must not exist.
  const deep = makePerson('I9', 6, 'paternal', ['I2', 'a', 'b', 'c', 'd', 'I9'], 'father');
  const result = layoutPedigree({
    focal,
    ancestors: [father, deep],
    maxGeneration: 4,
  });

  assert.equal(result.nodes.find(n => n.kind === 'present' && n.record === 'I9'), undefined);
  assert.ok(!result.edges.some(e => e.source === 'I9'),
    'no edge should originate from a clamped-out ancestor');
});

function makeRecord(
  recordId: string,
  parents: Array<{ record: string; role: 'father' | 'mother' }>,
): DerivedRecord {
  return {
    record: recordId,
    name: recordId,
    sex: undefined,
    birth: null,
    death: null,
    parents: parents.map(p => ({ record: p.record, name: p.record, role: p.role })),
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
  };
}

test('layoutPedigree: includeFrontier=false (default) emits no frontier nodes even with missing parents', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  // father has NO parents recorded — would normally produce 2 frontier slots
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father], maxGeneration: 4, recordLookup: lookup });
  // includeFrontier omitted ⇒ defaults to false
  for (const node of result.nodes) {
    assert.notEqual(node.kind, 'frontier', 'no frontier nodes should be emitted when includeFrontier is unset');
  }
});

test('layoutPedigree: includeFrontier=true emits a FrontierNode for a missing mother of a present father', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  // father has ONLY a father recorded; mother slot is missing
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [{ record: 'I4', role: 'father' }])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father], maxGeneration: 4, includeFrontier: true, recordLookup: lookup });

  const frontierNodes = result.nodes.filter(n => n.kind === 'frontier');
  assert.equal(frontierNodes.length, 1, 'should emit one frontier (the missing mother)');
  const fnode = frontierNodes[0]!;
  assert.equal(fnode.kind, 'frontier');
  if (fnode.kind !== 'frontier') throw new Error('type narrowing');
  assert.equal(fnode.descendantRecord, 'I2');
  assert.equal(fnode.role, 'mother');
  assert.equal(fnode.generation, 2);
  assert.equal(fnode.side, 'paternal');
  assert.equal(fnode.id, 'frontier:I2:mother');
});

test('layoutPedigree: frontier slot is positioned as a full leaf — present sibling and frontier are spread around their parent', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  // father has a recorded father (I3 = ff) but a missing mother
  const lookup = new Map<string, DerivedRecord>([
    ['I2', makeRecord('I2', [{ record: 'I3', role: 'father' }])],
  ]);
  const result = layoutPedigree({ focal, ancestors: [father, ff], maxGeneration: 4, includeFrontier: true, recordLookup: lookup });

  // father should be at midpoint of [ff, frontier_mother]
  const fatherNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I2')!;
  const ffNode = result.nodes.find(n => n.kind === 'present' && n.record === 'I3')!;
  const frontierMother = result.nodes.find(n => n.kind === 'frontier')!;
  if (frontierMother.kind !== 'frontier') throw new Error('type narrowing');

  assert.ok(ffNode.x < fatherNode.x, 'father (left) sibling is to the left of father');
  assert.ok(frontierMother.x > fatherNode.x, 'mother (right) frontier is to the right of father');
  assert.equal(fatherNode.x, (ffNode.x + frontierMother.x) / 2,
    'father should be at midpoint of its two children — present + frontier');
});

test('layoutPedigree: frontier slots are NOT emitted for missing parents of ancestors at maxGeneration', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  const fff = makePerson('I4', 3, 'paternal', ['I2', 'I3', 'I4'], 'father');
  // I4 (gen 3 — the deepest visible at maxGeneration=3) has missing parents.
  // Frontier slots for them would sit at gen 4, OUTSIDE the chart bound.
  // So they must not be emitted.
  const lookup = new Map<string, DerivedRecord>([
    ['I4', makeRecord('I4', [])],
  ]);
  const result = layoutPedigree({
    focal,
    ancestors: [father, ff, fff],
    maxGeneration: 3,
    includeFrontier: true,
    recordLookup: lookup,
  });
  for (const node of result.nodes) {
    assert.notEqual(node.kind, 'frontier',
      'frontier slots above maxGeneration must not be emitted');
  }
});
