import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPromote } from '../../src/corrections/promote.ts';

const FIXTURE_GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Doe/
2 GIVN John
2 SURN Doe
1 BIRT
2 DATE 1900
2 PLAC Brooklyn
1 DEAT
2 DATE 1990
2 PLAC Rome
0 @I2@ INDI
1 NAME Jane /Doe/
2 GIVN Jane
2 SURN Doe
1 DEAT
2 DATE 1985
0 TRLR
`;

const FIXTURE_PAGE = `---
title: John
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom:
  file: barash-tree.ged
  record: I1
  snapshot: abc
corrections:
  - field: death.date
    value: "1989"
    source: "Find A Grave #209496149"
---
Body content here.
`;

test('planPromote: updates death.date for existing DEAT block', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'Find A Grave #209496149',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989\n/);
  assert.match(result.gedcomText, /2 NOTE Find A Grave #209496149/);
  assert.doesNotMatch(result.gedcomText, /2 DATE 1990/);
});

test('planPromote: removes the correction from page frontmatter', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.doesNotMatch(result.pageText, /corrections:/);
  assert.match(result.pageText, /title: John/);
  assert.match(result.pageText, /Body content here/);
});

test('planPromote: errors when record id is not found in GEDCOM', () => {
  assert.throws(
    () =>
      planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
        record: 'I999',
        field: 'death.date',
        value: '1989',
        source: 'src',
      }),
    /not found/i,
  );
});

test('planPromote: errors on `name` field (v1 limitation)', () => {
  assert.throws(
    () =>
      planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
        record: 'I1',
        field: 'name',
        value: 'New Name',
        source: 'src',
      }),
    /name.*not supported/i,
  );
});

test('planPromote: adds a DATE line when DEAT block has none', () => {
  const ged = `0 @I1@ INDI
1 NAME X //
1 DEAT
0 TRLR
`;
  const page = `---
title: X
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"
---
`;
  const result = planPromote(ged, page, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989/);
});

test('planPromote: adds a DEAT block when none exists', () => {
  const ged = `0 @I1@ INDI
1 NAME X //
1 BIRT
2 DATE 1900
0 TRLR
`;
  const page = `---
title: X
owner: x
editors: []
type: person
aliases: []
categories: []
created: 2026-01-01
gedcom: { file: barash-tree.ged, record: I1, snapshot: abc }
corrections:
  - field: death.date
    value: "1989"
    source: "src"
---
`;
  const result = planPromote(ged, page, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1989\n2 NOTE src/);
});

test('planPromote: updates death.place', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.place',
    value: 'Italy',
    source: 'src',
  });
  assert.match(result.gedcomText, /1 DEAT\n2 DATE 1990\n2 PLAC Italy\n/);
  assert.doesNotMatch(result.gedcomText, /2 PLAC Rome/);
});

test('planPromote: leaves OTHER individuals’ records untouched', () => {
  const result = planPromote(FIXTURE_GEDCOM, FIXTURE_PAGE, {
    record: 'I1',
    field: 'death.date',
    value: '1989',
    source: 'src',
  });
  // I2's DEAT/DATE 1985 must survive
  assert.match(result.gedcomText, /0 @I2@ INDI[\s\S]+?1 DEAT\n2 DATE 1985/);
});
