import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDetectors } from '../../../src/commands/check/run-detectors.js';
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

test('runDetectors: no-fix — returns findings, fixedCount=0', async () => {
  const finding: Finding = {
    category: 'format',
    severity: 'info',
    message: 'test finding',
    location: { file: '/tmp/x/g.ged', line: 1 },
  };
  const result = await runDetectors({
    state: emptyState(),
    detectors: [() => [finding]],
    only: null,
    fix: false,
    writeFile: () => { throw new Error('writeFile must not be called without fix'); },
    reload: async () => emptyState(),
  });
  assert.equal(result.fixedCount, 0);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.category, 'format');
});

test('runDetectors: no-fix — filters findings by only', async () => {
  const result = await runDetectors({
    state: emptyState(),
    detectors: [
      () => [{ category: 'format', severity: 'info', message: 'f', location: { file: 'a' } }],
      () => [{ category: 'data', severity: 'info', message: 'd', location: { file: 'b' } }],
    ],
    only: ['format'],
    fix: false,
    writeFile: () => {},
    reload: async () => emptyState(),
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.category, 'format');
});

test('runDetectors: fix path — applies fixes and returns remaining findings', async () => {
  const writes: Array<{ file: string; content: string }> = [];
  let reloaded = false;

  const state = emptyState();
  state.gedcomText = '0 @I1@ INDI\n2 DATE 11 MAR 1866\n';

  const result = await runDetectors({
    state,
    detectors: [
      (s) => {
        const lines = s.gedcomText.split('\n');
        const findings: Finding[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (/MAR 1866/.test(lines[i]!)) {
            findings.push({
              category: 'format',
              severity: 'info',
              message: 'fix me',
              location: { file: '/tmp/x/g.ged', line: i + 1 },
              fix: {
                file: '/tmp/x/g.ged',
                lineNumber: i + 1,
                oldLine: lines[i]!,
                newLine: lines[i]!.replace('MAR', 'Mar'),
              },
            });
          }
        }
        return findings;
      },
    ],
    only: null,
    fix: true,
    writeFile: (file, content) => writes.push({ file, content }),
    reload: async () => {
      reloaded = true;
      // Return clean state so no remaining findings after fix.
      const fresh = emptyState();
      fresh.gedcomText = '0 @I1@ INDI\n2 DATE 11 Mar 1866\n';
      return fresh;
    },
  });

  assert.equal(writes.length, 1);
  assert.match(writes[0]!.content, /11 Mar 1866/);
  assert.equal(result.fixedCount, 1);
  assert.equal(result.findings.length, 0, 'no remaining findings after fix');
  assert.equal(reloaded, true);
});

test('runDetectors: consistency category with fix=true — short-circuits without applying fixes', async () => {
  let writeFileCalled = false;
  const finding: Finding = {
    category: 'consistency',
    severity: 'error',
    message: 'link mismatch',
    location: { file: '/tmp/x/pages/a.md' },
    fix: {
      file: '/tmp/x/pages/a.md',
      lineNumber: 1,
      oldLine: 'old',
      newLine: 'new',
    },
  };

  const result = await runDetectors({
    state: emptyState(),
    detectors: [() => [finding]],
    only: ['consistency'],
    fix: true,
    writeFile: () => { writeFileCalled = true; },
    reload: async () => emptyState(),
  });

  assert.equal(writeFileCalled, false, 'writeFile must not be called for consistency fixes');
  assert.equal(result.fixedCount, 0);
  // Original findings are returned (not post-fix re-run).
  assert.equal(result.findings.length, 1);
});

test('runDetectors: stale oldLine causes fix to be skipped with writeErr', async () => {
  const errs: string[] = [];
  const writes: Array<{ file: string; content: string }> = [];

  const state = emptyState();
  state.gedcomText = 'line1\nline2\n';

  const result = await runDetectors({
    state,
    detectors: [() => [{
      category: 'format',
      severity: 'info',
      message: 'stale',
      location: { file: '/tmp/x/g.ged', line: 1 },
      fix: {
        file: '/tmp/x/g.ged',
        lineNumber: 1,
        oldLine: 'this does not match line1',
        newLine: 'replaced',
      },
    }]],
    only: null,
    fix: true,
    writeFile: (f, c) => writes.push({ file: f, content: c }),
    writeErr: (s) => errs.push(s),
    reload: async () => emptyState(),
  });

  assert.equal(writes.length, 0, 'no file written when all fixes are stale');
  assert.equal(errs.length, 1);
  assert.match(errs[0]!, /skipping fix/);
  assert.equal(result.fixedCount, 0);
});

test('runDetectors: remaining findings after partial fix are returned', async () => {
  const writes: Array<{ file: string; content: string }> = [];

  const state = emptyState();
  state.gedcomText = '0 @I1@ INDI\n';

  // fix path: apply one fix, but remaining state still has a data finding.
  const result = await runDetectors({
    state,
    detectors: [(s) => {
      if (s.gedcomText.includes('@I1@')) {
        return [{
          category: 'format',
          severity: 'info',
          message: 'fixable',
          location: { file: '/tmp/x/g.ged', line: 1 },
          fix: {
            file: '/tmp/x/g.ged',
            lineNumber: 1,
            oldLine: '0 @I1@ INDI',
            newLine: '0 @I1@ INDI',
          },
        }];
      }
      // After reload, return a data finding that cannot be auto-fixed.
      return [{
        category: 'data',
        severity: 'error',
        message: 'data problem',
        location: { file: '/tmp/x/g.ged' },
      }];
    }],
    only: null,
    fix: true,
    writeFile: (f, c) => writes.push({ file: f, content: c }),
    reload: async () => {
      const fresh = emptyState();
      fresh.gedcomText = ''; // trigger data finding on second pass
      return fresh;
    },
  });

  assert.equal(result.fixedCount, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.category, 'data');
});
