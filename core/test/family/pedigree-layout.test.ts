import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPedigree } from '../../src/family/pedigree-layout.ts';
import type { BrowserPerson } from '../../src/family/browser.ts';

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
  assert.deepEqual(result.nodes[0], { record: 'I1', x: 0, y: 0, generation: 0, side: 'self' });
  assert.deepEqual(result.edges, []);
});

test('layoutPedigree: 1 generation places father left, mother right', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const mother = makePerson('I3', 1, 'maternal', ['I3'], 'mother');
  const result = layoutPedigree({ focal, ancestors: [father, mother], maxGeneration: 4 });

  const fatherNode = result.nodes.find(n => n.record === 'I2')!;
  const motherNode = result.nodes.find(n => n.record === 'I3')!;

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
  const g2 = result.nodes.filter(n => n.generation === 2).sort((a, b) => a.x - b.x);
  assert.deepEqual(g2.map(n => n.record), ['I4', 'I5', 'I6', 'I7']);
  // Edges include child→parent at each step
  assert.ok(result.edges.some(e => e.source === 'I4' && e.target === 'I2'));
  assert.ok(result.edges.some(e => e.source === 'I7' && e.target === 'I3'));
});

test('layoutPedigree: asymmetric tree (only paternal line) places nodes correctly', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const father = makePerson('I2', 1, 'paternal', ['I2'], 'father');
  const ff = makePerson('I3', 2, 'paternal', ['I2', 'I3'], 'father');
  const result = layoutPedigree({ focal, ancestors: [father, ff], maxGeneration: 4 });

  assert.equal(result.nodes.length, 3);
  // No mother node at gen 1 → gap stays. Father's position unchanged.
  const fatherNode = result.nodes.find(n => n.record === 'I2')!;
  const ffNode = result.nodes.find(n => n.record === 'I3')!;
  assert.ok(fatherNode.x < 0);
  assert.ok(ffNode.x < fatherNode.x, "father's father should be further left than father");
});

test('layoutPedigree: maxGeneration clamps the visible nodes', () => {
  const focal = makePerson('I1', 0, 'self', []);
  const deep = makePerson('I9', 6, 'paternal', ['a', 'b', 'c', 'd', 'e', 'I9'], 'father');
  const result = layoutPedigree({ focal, ancestors: [deep], maxGeneration: 4 });
  assert.equal(result.nodes.find(n => n.record === 'I9'), undefined,
    'ancestor beyond maxGeneration should be filtered out');
});
