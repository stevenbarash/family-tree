import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHistory, parseLogBlocksForHistory, type HistoryOptions } from '../../src/commands/history.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const RUN_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const RUN_B = 'bbbbbbbb-0000-0000-0000-000000000002';

/**
 * Canned git log output. Format: <sha>\n<subject>\n<body with trailers>\n---
 * Mix of pipeline and non-pipeline commits. Newest first.
 *
 * Run A: slug=alice; phases 2 (research), 3 (outline), 4 (draft)
 * Run B: slug=bob;   phases 2 (research), 4 (draft)
 * Manual edits: no pipeline-run trailer (but may have slug for filtering)
 */
const CANNED_LOG = [
  // Manual edit — alice — no pipeline-run (has slug for grep matching)
  `sha8\nmanual: update alice notes\nManual edit.\nslug: alice\n---`,
  // Run A — alice — phase 4 (draft)
  `sha4\ndraft(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 4\nslug: alice\n---`,
  // Run B — bob — phase 4 (draft)
  `sha_b4\ndraft(bob): pipeline-run ${RUN_B}\npipeline-run: ${RUN_B}\nphase: 4\nslug: bob\n---`,
  // Run A — alice — phase 3 (outline)
  `sha3\noutline(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 3\nslug: alice\n---`,
  // Manual edit — bob — no pipeline-run (has slug for grep matching)
  `sha_b_manual\nmanual: fix bob biography\nManual edit.\nslug: bob\n---`,
  // Run A — alice — phase 2 (research)
  `sha2\nresearch(alice): pipeline-run ${RUN_A}\npipeline-run: ${RUN_A}\nphase: 2\nslug: alice\n---`,
].join('\n');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOpts(over: Partial<HistoryOptions> = {}): HistoryOptions & {
  output: string[];
  errors: string[];
} {
  const output: string[] = [];
  const errors: string[] = [];

  return {
    rootDir: '/repo',
    format: 'table',
    filter: 'pipeline-only',
    gitLog: (_root, args) => {
      // Simulate grep filtering for testing
      let fullLog = CANNED_LOG;

      // Find the grep argument like "--grep=slug: alice"
      const grepArg = args.find(a => a.startsWith('--grep='));
      if (grepArg) {
        // Extract slug from "--grep=slug: alice"
        const match = grepArg.match(/--grep=slug:\s*(\S+)/);
        if (!match) return '';

        const slugToMatch = match[1]!;
        const blocks = fullLog.split(/\n---\n/);
        const filtered = blocks.filter(block => block.includes(`slug: ${slugToMatch}`));
        fullLog = filtered.map(b => b.trim()).join('\n---\n') + (filtered.length > 0 ? '\n---\n' : '');
      }

      // Handle -n limit (e.g., "-n 2")
      const limitArg = args.find(a => /^-n\s*\d+$/.test(a) || /^-\d+$/.test(a));
      if (limitArg) {
        let limit: number;
        if (limitArg.match(/^-\d+$/)) {
          // Format: "-2"
          limit = parseInt(limitArg.slice(1), 10);
        } else {
          // Format: "-n 2"
          const match = limitArg.match(/^-n\s*(\d+)$/);
          limit = match ? parseInt(match[1]!, 10) : 0;
        }
        const blocks = fullLog.split(/\n---\n/).filter(b => b.trim());
        return blocks.slice(0, limit).join('\n---\n') + (blocks.length > 0 ? '\n---\n' : '');
      }

      return fullLog;
    },
    write: (s) => { output.push(s); },
    writeErr: (s) => { errors.push(s); },
    output,
    errors,
    ...over,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('parseLogBlocksForHistory: extracts all commits (pipeline and manual)', () => {
  const commits = parseLogBlocksForHistory(CANNED_LOG);
  // Should parse 6 entries
  assert.equal(commits.length, 6);

  // Check manual edit (no pipeline-run, but has slug)
  const manual = commits.find(c => c.sha === 'sha8');
  assert.ok(manual);
  assert.equal(manual.runId, null);
  assert.equal(manual.phase, null);
  assert.equal(manual.slug, 'alice');

  // Check pipeline commit
  const pipeline = commits.find(c => c.sha === 'sha4');
  assert.ok(pipeline);
  assert.equal(pipeline.runId, RUN_A);
  assert.equal(pipeline.phase, 4);
  assert.equal(pipeline.slug, 'alice');
});

test('filter pipeline-only: excludes commits without pipeline-run trailer', async () => {
  const opts = makeOpts({ slug: 'alice', filter: 'pipeline-only' });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  // Should have 3 pipeline commits for alice (no manual edits)
  const lines = output.trim().split('\n');
  // Header + 3 data rows
  assert.equal(lines.length, 4);
  assert.ok(!output.includes('manual'));
});

test('filter no-pipeline: includes only manual edits', async () => {
  const opts = makeOpts({ slug: 'alice', filter: 'no-pipeline' });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  const lines = output.trim().split('\n');
  // Header + 1 manual edit for alice
  assert.equal(lines.length, 2);
  assert.ok(output.includes('manual'));
  assert.ok(!output.includes(RUN_A));
});

test('--json returns structured data', async () => {
  const opts = makeOpts({ slug: 'alice', format: 'json', filter: 'pipeline-only' });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  const data = JSON.parse(output);
  assert.ok(Array.isArray(data));
  // Should have 3 pipeline-only commits for alice
  assert.equal(data.length, 3);
  assert.ok(data.every((c: any) => c.runId !== null));
  assert.ok(data[0].sha);
  assert.ok(data[0].subject);
});

test('--recent without slug returns recent pipeline commits across all slugs', async () => {
  // When requesting recent with no slug, the mock will return the 2 most recent commits
  // from the full log (sha8=alice manual, sha4=alice pipeline). Then with filter='pipeline-only',
  // sha8 is excluded, leaving 1 data line (sha4).
  const opts = makeOpts({ recent: 2, filter: 'pipeline-only' });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  // With -n 2 (getting 2 newest commits, 1 of which is pipeline-only)
  const lines = output.trim().split('\n');
  // Header + 1 data row (the manual edit is filtered out)
  assert.equal(lines.length, 2);
});

test('table format shows truncated sha (7 chars)', async () => {
  const opts = makeOpts({ slug: 'alice', filter: 'pipeline-only' });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  // Check that sha is 7 chars in the table
  const lines = output.trim().split('\n');
  const dataLine = lines[1]; // First data line (after header)
  assert.ok(dataLine);
  // Table format: "sha7chr  run  phase  slug  subject"
  // Extract the first 7 characters of the sha column
  const sha = dataLine.slice(0, 7);
  assert.equal(sha.length, 7);
  // Verify it's actually hex-like (should start with 's')
  assert.ok(sha.startsWith('s'));
});

test('no slug + no --recent: exit 2', async () => {
  const opts = makeOpts();
  const code = await runHistory(opts);
  assert.equal(code, 2);
  assert.ok(opts.errors.some(e => e.includes('provide a slug or --recent')));
});

test('empty result renders (no commits) message', async () => {
  const opts = makeOpts({
    gitLog: () => '', // Empty log
    slug: 'nobody',
    filter: 'pipeline-only',
  });
  const code = await runHistory(opts);
  assert.equal(code, 0);
  const output = opts.output.join('');
  assert.ok(output.includes('(no commits)'));
});
