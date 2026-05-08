import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormatDrift } from '../../src/checks/format-drift.ts';
import type { RepoState } from '../../src/checks/types.ts';
import type { LoadedPage } from '../../src/checks/types.ts';

function makeState(gedcomText: string): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText,
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [],
    derivedDir: '/tmp/x/genealogy/derived',
    derived: new Map(),
    placesCoords: [],
  };
}

test('detectFormatDrift: clean GEDCOM produces no findings', () => {
  const ged = `0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE 7 Sep 1997
2 PLAC Somewhere
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.deepEqual(findings, []);
});

test('detectFormatDrift: flags ALL-CAPS month in GEDCOM date', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 11 MAR 1866
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'format');
  assert.equal(findings[0]!.location.line, 3);
  assert.equal(findings[0]!.fix?.oldLine, '2 DATE 11 MAR 1866');
  assert.equal(findings[0]!.fix?.newLine, '2 DATE 11 Mar 1866');
});

test('detectFormatDrift: flags slash date and full month name', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 17/09/1923
1 DEAT
2 DATE 25 August 1889
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 2);
  assert.equal(findings[0]!.fix?.newLine, '2 DATE 17 Sep 1923');
  assert.equal(findings[1]!.fix?.newLine, '2 DATE 25 Aug 1889');
});

test('detectFormatDrift: ambiguous slash date is flagged with no fix', () => {
  const ged = `0 @I1@ INDI
1 BIRT
2 DATE 9/7/1997
`;
  const findings = detectFormatDrift(makeState(ged));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warn');
  assert.equal(findings[0]!.fix, undefined);
  assert.match(findings[0]!.message, /ambiguous/);
});

function makeStateWithPage(body: string): RepoState {
  const text = `---\ntitle: Test\n---\n${body}`;
  const page: LoadedPage = {
    slug: 'test',
    path: '/tmp/x/pages/test.md',
    meta: {} as any,
    body,
    text,
  };
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [page],
    derivedDir: '/tmp/x/genealogy/derived',
    derived: new Map(),
    placesCoords: [],
  };
}

test('detectFormatDrift: flags non-canonical date in page body', () => {
  // makeStateWithPage prepends 3 frontmatter lines: ---, title, ---.
  // So body line 1 → file line 4.
  const body = `Sofia died on 25 August 1889 in Pennsylvania.\n`;
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.location.file, '/tmp/x/pages/test.md');
  assert.equal(findings[0]!.location.line, 4);
  assert.match(findings[0]!.message, /25 Aug 1889/);
});

test('detectFormatDrift: ignores dates inside fenced code blocks', () => {
  const body = '```\n2 DATE 25 August 1889\n```\nNormal prose.\n';
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 0);
});

test('detectFormatDrift: catches dates in DOT-graph blocks (no special handling needed)', () => {
  const body = `<graphviz>\ndigraph X { "a" [label="(11 MAR 1866)"]; }\n</graphviz>\n`;
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.fix?.newLine ?? '', /11 Mar 1866/);
});

test('detectFormatDrift: line with fixable AND ambiguous dates emits two findings', () => {
  // 25 August 1889 is fixable; 9/7/1997 is ambiguous. Same line.
  const body = `Two events on this line: 25 August 1889 and 9/7/1997.\n`;
  const findings = detectFormatDrift(makeStateWithPage(body));
  assert.equal(findings.length, 2);
  // The fixable one carries a fix; the ambiguous one does not.
  const withFix = findings.find(f => f.fix !== undefined);
  const withoutFix = findings.find(f => f.fix === undefined);
  assert.ok(withFix, 'expected one finding with a fix');
  assert.ok(withoutFix, 'expected one finding without a fix (ambiguous warning)');
  assert.equal(withFix!.severity, 'info');
  assert.equal(withoutFix!.severity, 'warn');
  // Both share the same line.
  assert.equal(withFix!.location.line, withoutFix!.location.line);
  // The fix preserves the ambiguous slash and only rewrites the unambiguous date.
  assert.match(withFix!.fix!.newLine, /25 Aug 1889/);
  assert.match(withFix!.fix!.newLine, /9\/7\/1997/);
});

test('detectFormatDrift: page with no frontmatter walks from line 1', () => {
  // No leading "---" — bodyStartIndex returns 0.
  const text = `# Heading\n\nDied 25 August 1889.\n`;
  const page: LoadedPage = {
    slug: 'noheader',
    path: '/tmp/x/pages/noheader.md',
    meta: {} as any,
    body: text,
    text,
  };
  const state: RepoState = {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/genealogy/barash-tree.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [page],
    derivedDir: '/tmp/x/genealogy/derived',
    derived: new Map(),
    placesCoords: [],
  };
  const findings = detectFormatDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.location.line, 3);  // file line 3 (no frontmatter offset)
});
