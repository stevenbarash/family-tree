import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Finding } from '@core/checks/types.ts';
import { findingsForRunSlug, atOrAboveSeverity } from '../../../src/commands/author/run-findings.js';

const root = '/data';
const at = (file: string, severity: Finding['severity'] = 'warn'): Finding => ({
  category: 'citation',
  severity,
  message: 'm',
  location: { file },
});

test('findingsForRunSlug: matches the canonical en page and its talk page', () => {
  const findings = [
    at(join(root, 'pages', 'en', 'foo.md')),
    at(join(root, 'pages', 'en', 'foo.talk.md')),
  ];
  assert.equal(findingsForRunSlug(findings, root, 'foo').length, 2);
});

test('findingsForRunSlug: ignores the legacy flat path (the bug that left the gate dead)', () => {
  // Canonical articles live under pages/en/ since the v2 layout migration;
  // the old filter matched pages/<slug>.md and so matched nothing real.
  const findings = [at(join(root, 'pages', 'foo.md'))];
  assert.equal(findingsForRunSlug(findings, root, 'foo').length, 0);
});

test('findingsForRunSlug: ignores findings on other slugs', () => {
  const findings = [at(join(root, 'pages', 'en', 'bar.md'))];
  assert.equal(findingsForRunSlug(findings, root, 'foo').length, 0);
});

test('atOrAboveSeverity: warn floor keeps warn and error, drops info', () => {
  const findings = [at('a', 'info'), at('b', 'warn'), at('c', 'error')];
  assert.deepEqual(
    atOrAboveSeverity(findings, 'warn').map(f => f.severity).sort(),
    ['error', 'warn'],
  );
});
