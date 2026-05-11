import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalAppend, journalReadCompleted, journalReadStartedNotCompleted } from '../../../src/commands/author/cohort-journal.js';

function fakeJournal() {
  const files: Record<string, string> = {};
  const dirs: string[] = [];
  return {
    files,
    dirs,
    deps: {
      rootDir: '/repo',
      appendFile: (p: string, c: string) => { files[p] = (files[p] ?? '') + c; },
      mkdirP: (p: string) => { dirs.push(p); },
    },
    readFile: (p: string) => files[p] ?? null,
  };
}

test('journalAppend: writes JSONL line; creates dir', () => {
  const { files, dirs, deps } = fakeJournal();
  journalAppend({ ts: '2026-05-11T00:00:00Z', runId: 'r1', slug: 'aidele', status: 'started' }, deps);
  assert.equal(dirs[0], '/repo/data/author-runs');
  assert.match(files['/repo/data/author-runs/r1.jsonl']!, /"slug":"aidele".*"status":"started"/);
});

test('journalReadCompleted: returns slugs marked completed', () => {
  const { files, deps, readFile } = fakeJournal();
  files['/repo/data/author-runs/r1.jsonl'] = [
    '{"ts":"t","runId":"r1","slug":"a","status":"started"}',
    '{"ts":"t","runId":"r1","slug":"a","status":"completed"}',
    '{"ts":"t","runId":"r1","slug":"b","status":"started"}',
    '',
  ].join('\n');
  const c = journalReadCompleted('r1', deps.rootDir, readFile);
  assert.deepEqual([...c], ['a']);
});

test('journalReadCompleted: returns empty set when journal missing', () => {
  const { deps, readFile } = fakeJournal();
  const c = journalReadCompleted('r1', deps.rootDir, readFile);
  assert.equal(c.size, 0);
});

test('journalReadStartedNotCompleted: returns started without completed', () => {
  const { files, deps, readFile } = fakeJournal();
  files['/repo/data/author-runs/r1.jsonl'] = [
    '{"ts":"t","runId":"r1","slug":"a","status":"started"}',
    '{"ts":"t","runId":"r1","slug":"a","status":"completed"}',
    '{"ts":"t","runId":"r1","slug":"b","status":"started"}',
  ].join('\n');
  const partial = journalReadStartedNotCompleted('r1', deps.rootDir, readFile);
  assert.deepEqual([...partial], ['b']);
});

test('journalReadCompleted: tolerates malformed lines', () => {
  const { files, deps, readFile } = fakeJournal();
  files['/repo/data/author-runs/r1.jsonl'] = 'not json\n{"ts":"t","runId":"r1","slug":"a","status":"completed"}\n';
  const c = journalReadCompleted('r1', deps.rootDir, readFile);
  assert.deepEqual([...c], ['a']);
});
