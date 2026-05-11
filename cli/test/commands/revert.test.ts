import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRevert, parseLogBlocks, type RevertDeps } from '../../src/commands/revert.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const RUN_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const RUN_B = 'bbbbbbbb-0000-0000-0000-000000000002';

/**
 * Canned git log output. Format: <sha>\n<subject>\n<body with trailers>\n---
 * Newest commit first.
 *
 * Run A: slug=alice; phases 2 (research), 3 (outline), 4 (draft), 6 (verify), 7 (log)
 * Run B: slug=bob;   phases 2 (research), 4 (draft)
 */
const CANNED_LOG = [
  // Run A — alice — phase 7 (log) — newest
  `sha7\nlog(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 7\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run A — alice — phase 6 (verify)
  `sha6\nverify(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 6\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run A — alice — phase 4 (draft)
  `sha4\ndraft(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 4\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run B — bob — phase 4 (draft)
  `sha_b4\ndraft(bob): pipeline-run ${RUN_B}\npipeline-run: ${RUN_B}\nphase: 4\nslug: bob\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run A — alice — phase 3 (outline)
  `sha3\noutline(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 3\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run A — alice — phase 5 (draft-episode)
  `sha5\ndraft-ep(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 5\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run B — bob — phase 2 (research)
  `sha_b2\nresearch(bob): pipeline-run ${RUN_B}\npipeline-run: ${RUN_B}\nphase: 2\nslug: bob\ninputs: derived\nfabrication-guard: pass\n---`,
  // Run A — alice — phase 2 (research) — oldest
  `sha2\nresearch(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 2\nslug: alice\ninputs: derived\nfabrication-guard: pass\n---`,
].join('\n');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDeps(over: Partial<RevertDeps> = {}): RevertDeps & {
  reverted: Array<{ shas: ReadonlyArray<string>; message: string }>;
  output: string[];
  errors: string[];
} {
  const reverted: Array<{ shas: ReadonlyArray<string>; message: string }> = [];
  const output: string[] = [];
  const errors: string[] = [];

  return {
    rootDir: '/repo',
    gitLog: (_root, _args) => CANNED_LOG,
    gitRevert: (_root, shas, message) => { reverted.push({ shas, message }); },
    dryRun: false,
    write: (s) => { output.push(s); },
    writeErr: (s) => { errors.push(s); },
    reverted,
    output,
    errors,
    ...over,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('parseLogBlocks: extracts sha, subject, runId, phase, slug', () => {
  const blocks = parseLogBlocks(CANNED_LOG);
  // Should parse 8 entries
  assert.equal(blocks.length, 8);
  const first = blocks[0]!;
  assert.equal(first.sha, 'sha7');
  assert.equal(first.runId, RUN_A);
  assert.equal(first.phase, 7);
  assert.equal(first.slug, 'alice');
});

test('slug-latest: reverts most recent run for slug', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'slug-latest', slug: 'alice' }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 1);
  const { shas, message } = deps.reverted[0]!;
  // All alice commits in run A: sha7, sha6, sha4, sha3, sha5, sha2 (in order from log)
  assert.ok(shas.includes('sha7'));
  assert.ok(shas.includes('sha2'));
  assert.ok(shas.every(s => s.startsWith('sha') && !s.includes('_b')));
  assert.ok(message.includes('pipeline-run'));
  assert.ok(message.includes(RUN_A));
  assert.ok(message.startsWith('revert(alice):'));
});

test('slug-latest: exit 2 when no runs found for slug', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'slug-latest', slug: 'nobody' }, deps);
  assert.equal(code, 2);
  assert.equal(deps.reverted.length, 0);
  assert.ok(deps.errors.some(e => e.includes('no pipeline runs found')));
});

test('slug-run: reverts only commits from specified run UUID', async () => {
  const deps = makeDeps();
  // Ask for bob's run B specifically
  const code = await runRevert({ kind: 'slug-run', slug: 'bob', runId: RUN_B }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 1);
  const { shas, message } = deps.reverted[0]!;
  // Bob's run B has sha_b4 and sha_b2
  assert.deepEqual([...shas].sort(), ['sha_b2', 'sha_b4'].sort());
  assert.ok(message.includes(RUN_B));
  assert.ok(message.startsWith('revert(bob):'));
});

test('slug-phase draft: matches phases 4 and 5', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'slug-phase', slug: 'alice', phase: 'draft' }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 1);
  const { shas, message } = deps.reverted[0]!;
  // Alice's draft phases in run A: sha4 (phase 4) and sha5 (phase 5)
  assert.equal(shas.length, 2);
  assert.ok(shas.includes('sha4'));
  assert.ok(shas.includes('sha5'));
  assert.ok(message.toLowerCase().includes('draft'));
  assert.ok(message.startsWith('revert(alice):'));
});

test('last: reverts most recent pipeline run regardless of slug', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'last' }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 1);
  const { shas, message } = deps.reverted[0]!;
  // Most recent run is RUN_A (alice, sha7 is newest)
  assert.ok(shas.every(s => !s.includes('_b')), 'should only include alice run A commits');
  assert.ok(message.includes(RUN_A));
});

test('list: prints run table, does not call gitRevert', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'list', slug: 'alice' }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 0, 'list must not call gitRevert');
  const allOutput = deps.output.join('');
  assert.ok(allOutput.includes(RUN_A), 'output should contain run UUID');
  assert.ok(allOutput.includes('alice'), 'output should reference slug');
});

test('dry-run: prints what would be reverted, does not call gitRevert', async () => {
  const deps = makeDeps({ dryRun: true });
  const code = await runRevert({ kind: 'slug-latest', slug: 'alice' }, deps);
  assert.equal(code, 0);
  assert.equal(deps.reverted.length, 0, 'dry-run must not call gitRevert');
  const allOutput = deps.output.join('');
  assert.ok(allOutput.includes('would revert'), 'should say "would revert"');
});

test('slug-phase unknown phase name: exit 2 with helpful error', async () => {
  const deps = makeDeps();
  const code = await runRevert({ kind: 'slug-phase', slug: 'alice', phase: 'badphase' }, deps);
  assert.equal(code, 2);
  assert.equal(deps.reverted.length, 0);
  assert.ok(deps.errors.some(e => e.includes('unknown phase')));
});
