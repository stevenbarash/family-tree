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
  assert.match(out, /1 finding[\.\s]/);
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
  assert.match(out, /1 finding[\.\s]/);
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

test('check --fix: applies fixes, reports applied count, returns 0 if all fixed', async () => {
  let out = '';
  const writes: Array<{ file: string; content: string }> = [];
  // Fake initial state has the unfixed file content; after --fix the rerun
  // should see the patched content with no findings.
  let pass = 0;
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: true,
    only: null,
    failOn: null,
    loadState: async () => {
      const state = emptyState();
      if (pass === 0) {
        state.gedcomText = '0 @I1@ INDI\n2 DATE 11 MAR 1866\n';
      } else {
        state.gedcomText = '0 @I1@ INDI\n2 DATE 11 Mar 1866\n';
      }
      pass += 1;
      return state;
    },
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
    write: (s) => { out += s; },
    writeErr: () => {},
    writeFile: (file, content) => writes.push({ file, content }),
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.file, '/tmp/x/g.ged');
  assert.match(writes[0]!.content, /11 Mar 1866/);
  assert.equal(code, 0);
  assert.match(out, /1 fix(es)? applied/);
});

test('check --fix: applied count excludes fixes whose oldLine no longer matches', async () => {
  let out = '';
  const errs: string[] = [];
  const writes: Array<{ file: string; content: string }> = [];
  let pass = 0;
  // Detector emits 2 fixes for the same file; one fix's oldLine is stale.
  const code = await runCheck({
    rootDir: '/tmp/x',
    json: false,
    fix: true,
    only: null,
    failOn: null,
    loadState: async () => {
      const state = emptyState();
      // gedcomText has 2 lines but the detector will emit a fix for line 2
      // claiming an oldLine that doesn't match line 2.
      state.gedcomText = pass === 0
        ? '0 @I1@ INDI\n2 DATE 11 MAR 1866\n'
        : '0 @I1@ INDI\n2 DATE 11 Mar 1866\n';
      pass += 1;
      return state;
    },
    detectors: [
      (s) => {
        if (s.gedcomText.includes('11 MAR 1866')) {
          return [
            {
              category: 'format',
              severity: 'info',
              message: 'real fix',
              location: { file: '/tmp/x/g.ged', line: 2 },
              fix: { file: '/tmp/x/g.ged', lineNumber: 2, oldLine: '2 DATE 11 MAR 1866', newLine: '2 DATE 11 Mar 1866' },
            },
            {
              category: 'format',
              severity: 'info',
              message: 'stale fix (oldLine wrong)',
              location: { file: '/tmp/x/g.ged', line: 2 },
              fix: { file: '/tmp/x/g.ged', lineNumber: 2, oldLine: 'this does not match', newLine: '2 DATE 11 Mar 1866' },
            },
          ];
        }
        return [];
      },
    ],
    write: (s) => { out += s; },
    writeErr: (s) => { errs.push(s); },
    writeFile: (file, content) => writes.push({ file, content }),
  });
  // 2 fixes were proposed but only 1 had a matching oldLine.
  assert.match(out, /^1 fix applied/m);
  // The skipped fix produced a stderr warning.
  assert.equal(errs.length, 1);
  assert.match(errs[0]!, /skipping fix/);
  assert.equal(code, 0);
});
