import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTrailer, parseLatestTrailer, findResumePoint, newRunId } from '../../../src/commands/author/pipeline-run.js';

test('formatTrailer: emits all fields in the expected order', () => {
  const out = formatTrailer({
    pipelineRun: '7c4a',
    phase: 2,
    slug: 'aidele',
    inputs: ['derived', 'talk', 'web'],
    sources: 12,
    fabricationGuard: 'pass',
  });
  assert.equal(out, 'pipeline-run: 7c4a\nphase: 2\nslug: aidele\ninputs: derived,talk,web\nsources: 12\nfabrication-guard: pass');
});

test('formatTrailer: omits sources when undefined', () => {
  const out = formatTrailer({
    pipelineRun: '7c4a', phase: 1, slug: 'aidele', inputs: ['derived'], fabricationGuard: 'pass',
  });
  assert.equal(out, 'pipeline-run: 7c4a\nphase: 1\nslug: aidele\ninputs: derived\nfabrication-guard: pass');
});

test('parseLatestTrailer: round-trips a formatted trailer', () => {
  const orig = {
    pipelineRun: '7c4a',
    phase: 4,
    slug: 'aidele',
    inputs: ['derived', 'talk', 'narrative'] as const,
    sources: 9,
    fabricationGuard: 'pass' as const,
  };
  const parsed = parseLatestTrailer(formatTrailer(orig));
  assert.deepEqual(parsed, orig);
});

test('findResumePoint: returns the most recent run for the slug', () => {
  const log = [
    'pipeline-run: r2', 'phase: 3', 'slug: aidele', 'inputs: derived,talk', 'sources: 5', 'fabrication-guard: pass',
    '',
    'pipeline-run: r1', 'phase: 7', 'slug: kelman-ayzman', 'inputs: derived,talk', 'fabrication-guard: pass',
  ].join('\n');
  const r = findResumePoint(log, 'aidele');
  assert.deepEqual(r, { runId: 'r2', nextPhase: 4 });
});

test('findResumePoint: returns null when slug has no prior run', () => {
  const log = 'pipeline-run: r1\nphase: 7\nslug: someone\ninputs: derived\nfabrication-guard: pass';
  assert.equal(findResumePoint(log, 'aidele'), null);
});

test('newRunId: produces a valid UUID', () => {
  const id = newRunId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
