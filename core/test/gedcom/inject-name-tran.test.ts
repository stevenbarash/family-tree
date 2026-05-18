import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectNameTran, stripExistingTrans } from '../../src/gedcom/inject-name-tran.ts';

const MINIMAL = `0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME Alice /Smith/
2 GIVN Alice
2 SURN Smith
1 SEX F
1 BIRT
2 DATE 1 JAN 1900
0 @I2@ INDI
1 NAME Bob /Smith/
1 SEX M
0 TRLR
`;

test('injectNameTran: adds TRAN lines under the right NAME block', () => {
  const out = injectNameTran(MINIMAL, [
    { record: 'I1', locale: 'ru', title: 'Алиса Смит' },
    { record: 'I1', locale: 'he', title: 'אליס סמית' },
  ]);
  assert.match(out, /1 NAME Alice \/Smith\/\n2 GIVN Alice\n2 SURN Smith\n2 TRAN Алиса Смит\n3 LANG ru\n2 TRAN אליס סמית\n3 LANG he\n1 SEX F/);
  // I2 has no entries — should be untouched
  assert.match(out, /1 NAME Bob \/Smith\/\n1 SEX M/);
});

test('injectNameTran: idempotent — running twice produces identical output to once', () => {
  const entries = [
    { record: 'I1', locale: 'ru', title: 'Алиса Смит' },
    { record: 'I1', locale: 'uk', title: 'Аліса Сміт' },
    { record: 'I1', locale: 'he', title: 'אליס סמית' },
  ];
  const once = injectNameTran(MINIMAL, entries);
  const twice = injectNameTran(once, entries);
  assert.equal(twice, once, 'second injection should yield identical text');
});

test('injectNameTran: re-running with different entries replaces, never accumulates', () => {
  const first = injectNameTran(MINIMAL, [
    { record: 'I1', locale: 'ru', title: 'Алиса Смит' },
  ]);
  const second = injectNameTran(first, [
    { record: 'I1', locale: 'ru', title: 'Алиса Кузнецова' },  // surname changed
  ]);
  // Only one TRAN line total in I1's NAME block
  assert.equal((second.match(/2 TRAN /g) ?? []).length, 1);
  assert.match(second, /2 TRAN Алиса Кузнецова\n3 LANG ru/);
  assert.doesNotMatch(second, /Алиса Смит/);
});

test('injectNameTran: locale order is ru, uk, he, then alphabetical others', () => {
  const out = injectNameTran(MINIMAL, [
    { record: 'I1', locale: 'he', title: 'A' },
    { record: 'I1', locale: 'fr', title: 'F' },
    { record: 'I1', locale: 'ru', title: 'R' },
    { record: 'I1', locale: 'uk', title: 'U' },
  ]);
  const tranLines = out.split('\n').filter(l => l.startsWith('2 TRAN '));
  assert.deepEqual(tranLines, ['2 TRAN R', '2 TRAN U', '2 TRAN A', '2 TRAN F']);
});

test('injectNameTran: records without entries are untouched', () => {
  const out = injectNameTran(MINIMAL, [
    { record: 'I_NONEXISTENT', locale: 'ru', title: 'X' },
  ]);
  // I1 had no entries → no TRAN added; I2 same
  assert.doesNotMatch(out, /2 TRAN /);
  assert.equal(out, MINIMAL.trimEnd() + '\n' === MINIMAL ? MINIMAL : MINIMAL,
    'Output equals input modulo trailing newline');
});

test('injectNameTran: preserves SEX and BIRT substructures of the record', () => {
  const out = injectNameTran(MINIMAL, [
    { record: 'I1', locale: 'ru', title: 'Алиса Смит' },
  ]);
  assert.match(out, /1 SEX F/);
  assert.match(out, /1 BIRT\n2 DATE 1 JAN 1900/);
});

test('injectNameTran: leaves non-INDI records (HEAD, TRLR) alone', () => {
  const out = injectNameTran(MINIMAL, [
    { record: 'HEAD', locale: 'ru', title: 'should not inject' },
  ]);
  assert.doesNotMatch(out, /2 TRAN should not inject/);
});

test('stripExistingTrans: removes 2 TRAN + 3 LANG pairs', () => {
  const withTrans = `0 @I1@ INDI
1 NAME X /Y/
2 GIVN X
2 SURN Y
2 TRAN Икс Игрек
3 LANG ru
2 TRAN איקס יגרק
3 LANG he
1 SEX M
`;
  const out = stripExistingTrans(withTrans);
  assert.doesNotMatch(out, /2 TRAN /);
  assert.doesNotMatch(out, /3 LANG /);
  // Other lines preserved
  assert.match(out, /2 GIVN X/);
  assert.match(out, /2 SURN Y/);
  assert.match(out, /1 SEX M/);
});

test('stripExistingTrans: no-op on text without TRAN lines', () => {
  assert.equal(stripExistingTrans(MINIMAL), MINIMAL);
});
