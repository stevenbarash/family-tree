import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './changelog.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parses the live CHANGELOG.md', async () => {
  const file = path.resolve(__dirname, '..', '..', 'CHANGELOG.md');
  const src = await readFile(file, 'utf8');
  const doc = parseChangelog(src, '2026-05-07T00:00:00Z');
  assert.equal(doc.title, 'Changelog');
  assert.ok(doc.sections.length > 3, `expected >3 sections, got ${doc.sections.length}`);
  const unreleased = doc.sections.find(s => s.kind === 'version' && s.label === 'Unreleased');
  assert.ok(unreleased, 'Unreleased section present');
  if (unreleased && unreleased.kind === 'version') {
    assert.equal(unreleased.status, 'unreleased');
    assert.ok(unreleased.subsections.length > 0);
  }
  const v2 = doc.sections.find(s => s.kind === 'version' && s.label === 'v2.0.0-pre');
  assert.ok(v2, 'v2.0.0-pre present');
  if (v2 && v2.kind === 'version') {
    assert.equal(v2.status, 'pre-release');
    const added = v2.subsections.find(s => s.kind === 'Added' && s.qualifier === 'platform foundations');
    assert.ok(added, 'Added — platform foundations subsection present');
  }
  const cliGroup = doc.sections.find(s => s.kind === 'group' && /CLI v1\.x/.test(s.title));
  assert.ok(cliGroup, 'CLI v1.x group present');
  if (cliGroup && cliGroup.kind === 'group') {
    assert.ok(cliGroup.versions.length >= 5, `expected ≥5 v1.x versions, got ${cliGroup.versions.length}`);
  }
});
