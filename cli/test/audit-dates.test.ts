import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAuditDates } from '../src/commands/audit-dates.js';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wai-audit-dates-'));
  mkdirSync(join(root, 'genealogy', 'derived'), { recursive: true });
  mkdirSync(join(root, 'pages'), { recursive: true });
  return root;
}

test('audit dates: clean repo prints "no ambiguous" and exits 0', () => {
  const root = makeRoot();
  writeFileSync(join(root, 'genealogy', 'barash-tree.ged'), '0 @I1@ INDI\n1 NAME Test\n2 DATE 5 May 2001\n');
  writeFileSync(join(root, 'genealogy', 'derived', 'I1.yml'), 'record: I1\nbirth:\n  date: 5 May 2001\n');
  writeFileSync(join(root, 'pages', 'jane.md'), '# Jane\n\nBorn 5 May 2001.\n');

  let out = '';
  const code = runAuditDates({ rootDir: root, json: false, write: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.match(out, /no ambiguous slash dates/);
});

test('audit dates: ambiguous date in GEDCOM is reported with file + line + column', () => {
  const root = makeRoot();
  writeFileSync(
    join(root, 'genealogy', 'barash-tree.ged'),
    '0 @I1@ INDI\n1 NAME Test\n1 BIRT\n2 DATE 9/7/1997\n',
  );
  writeFileSync(join(root, 'genealogy', 'derived', 'I1.yml'), 'record: I1\n');
  writeFileSync(join(root, 'pages', 'p.md'), '# P\n');

  let out = '';
  const code = runAuditDates({ rootDir: root, json: false, write: (s) => { out += s; } });
  assert.equal(code, 1);
  assert.match(out, /gedcom \(1\)/);
  assert.match(out, /genealogy\/barash-tree\.ged/);
  assert.match(out, /4:8\s+9\/7\/1997/); // line 4, col 8 ("2 DATE " is 7 chars → col 8)
});

test('audit dates: ambiguous date in page prose is reported under pages group', () => {
  const root = makeRoot();
  writeFileSync(join(root, 'genealogy', 'barash-tree.ged'), '0 HEAD\n');
  writeFileSync(
    join(root, 'pages', 'jane.md'),
    '# Jane\n\nBorn 3/4/1955 in Kyiv.\n',
  );

  let out = '';
  const code = runAuditDates({ rootDir: root, json: false, write: (s) => { out += s; } });
  assert.equal(code, 1);
  assert.match(out, /pages \(1\)/);
  assert.match(out, /pages\/jane\.md/);
  assert.match(out, /3\/4\/1955/);
});

test('audit dates: unambiguous slash dates (day > 12) are NOT reported', () => {
  const root = makeRoot();
  writeFileSync(
    join(root, 'genealogy', 'barash-tree.ged'),
    '0 @I1@ INDI\n2 DATE 17/9/1923\n2 DATE 9/17/1923\n',
  );

  let out = '';
  const code = runAuditDates({ rootDir: root, json: false, write: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.match(out, /no ambiguous slash dates/);
});

test('audit dates: --json output is parseable and lists every hit grouped by source', () => {
  const root = makeRoot();
  writeFileSync(
    join(root, 'genealogy', 'barash-tree.ged'),
    '0 @I1@ INDI\n2 DATE 9/7/1997\n',
  );
  writeFileSync(
    join(root, 'pages', 'jane.md'),
    'Born 3/4/1955.\n',
  );

  let out = '';
  const code = runAuditDates({ rootDir: root, json: true, write: (s) => { out += s; } });
  assert.equal(code, 1);
  const parsed = JSON.parse(out);
  assert.equal(parsed.total, 2);
  const gedcom = parsed.groups.find((g: { source: string }) => g.source === 'gedcom');
  const pages = parsed.groups.find((g: { source: string }) => g.source === 'pages');
  assert.equal(gedcom.hits.length, 1);
  assert.equal(gedcom.hits[0].text, '9/7/1997');
  assert.equal(pages.hits.length, 1);
  assert.equal(pages.hits[0].text, '3/4/1955');
});

test('audit dates: missing genealogy/ or pages/ does not crash', () => {
  const root = mkdtempSync(join(tmpdir(), 'wai-audit-dates-bare-'));
  let out = '';
  const code = runAuditDates({ rootDir: root, json: false, write: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.match(out, /no ambiguous slash dates/);
});
