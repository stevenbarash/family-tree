import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../src/commands/check.js';
import type { RepoState, Finding } from '@core/checks/types.ts';

function emptyState(): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages: [],
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

test('check: clean state prints "0 findings" and exit 0', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => []],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => { throw new Error('writeFile must not be called when --fix is off'); },
  });
  assert.equal(code, 0);
  assert.match(out, /0 findings/);
});

test('check: findings produce non-zero exit', async () => {
  let out = '';
  const finding: Finding = {
    category: 'format',
    severity: 'info',
    message: 'non-canonical date',
    location: { file: '/tmp/x/g.ged', line: 5 },
  };
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => [finding]],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => { throw new Error('no fix'); },
  });
  assert.equal(code, 1);
  assert.match(out, /format/);
  assert.match(out, /1 findings/);
});

test('check: --json prints JSON', async () => {
  let out = '';
  const finding: Finding = {
    category: 'format',
    severity: 'info',
    message: 'x',
    location: { file: 'a', line: 1 },
  };
  await runCheck({
    rootDir: '/tmp/x',
    json: true,
    fix: false,
    only: null,
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [() => [finding]],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].category, 'format');
});

test('check: --only filters detectors by category', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: ['format'],
    failOn: null,
    loadState: async () => emptyState(),
    detectors: [
      () => [{ category: 'format', severity: 'info', message: 'a', location: { file: 'a' } }],
      () => [{ category: 'data', severity: 'info', message: 'b', location: { file: 'b' } }],
    ],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  // 1 format finding (kept), data finding (filtered out)
  assert.equal(code, 1);
  assert.match(out, /1 findings/);
  assert.doesNotMatch(out, /\bb\b/);
});

test('check: --fail-on filters exit code by category', async () => {
  let out = '';
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: false,
    only: null,
    failOn: ['data'],
    loadState: async () => emptyState(),
    detectors: [
      () => [{ category: 'format', severity: 'info', message: 'a', location: { file: 'a' } }],
    ],
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: () => {},
  });
  // Findings exist but only format (not data) → exit 0
  assert.equal(code, 0);
});
