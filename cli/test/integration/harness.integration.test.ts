/**
 * Integration tests against the real `claude` binary.
 *
 * These tests are SKIPPED BY DEFAULT. They actually invoke the claude
 * CLI, which (a) requires the binary to be installed and authenticated,
 * (b) makes real model calls (latency + cost), and (c) needs network
 * access. Run them explicitly when changing harness behavior:
 *
 *   WAI_INTEGRATION_TESTS=1 npm test
 *
 * Or target just this file:
 *
 *   WAI_INTEGRATION_TESTS=1 npx tsx --test test/integration/harness.integration.test.ts
 *
 * Why they exist despite the unit tests: the unit tests use `fakeSpawn`
 * to assert that the harness adapter passes the right CLI flags. They
 * cannot catch a regression where claude itself renames or alters the
 * semantics of `--tools` — the unit tests would still pass but the
 * adapter would silently fail to restrict the sub-model. These tests
 * close that gap by exercising the real binary contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUN_INTEGRATION = process.env.WAI_INTEGRATION_TESTS === '1';

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runClaude(args: string[], stdin: string, timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

test('integration: claude --help recognizes the --tools flag', { skip: !RUN_INTEGRATION }, async () => {
  // Cheap smoke test (no model call). If claude ever renames --tools the
  // help text won't mention it — this catches the rename before any of
  // our model-burning tests get the chance.
  const result = await runClaude(['--help'], '', 5000);
  assert.equal(result.code, 0, `claude --help exited ${result.code}: ${result.stderr}`);
  assert.match(result.stdout, /--tools/, 'claude --help no longer mentions --tools — harness adapter needs a flag-rename update');
});

test('integration: --tools "" actually disables Write in the sub-model', { skip: !RUN_INTEGRATION }, async () => {
  // The real safety contract: with --tools "" the sub-claude must not
  // be able to write files. We give it a prompt that explicitly asks
  // for a Write call to a unique tmp path and assert the path does NOT
  // exist afterward. If --tools "" semantics change such that tools are
  // still available, this test fails — surfacing the regression before
  // a wai author run loses page content the way boris-ayzman Phase 4
  // did before the tool restriction landed.
  const sentinel = join(tmpdir(), `wai-integration-tools-restriction-${Date.now()}.txt`);
  // Defensive: delete any leftover sentinel from a prior aborted run.
  if (existsSync(sentinel)) unlinkSync(sentinel);
  const prompt = `Use the Write tool to create a file at the path ${sentinel} with the contents "if you can read this, --tools restriction failed". Return the JSON object {"attempted":true,"path":"${sentinel}"}.`;
  try {
    await runClaude(
      ['--print', '--output-format', 'json', '--tools', '', prompt],
      '',
      60_000,
    );
    // We don't assert on exit code or response shape — the sub-model
    // may succeed (returning a refusal), error (write tool denied), or
    // produce garbage. What we care about is the filesystem fact:
    // nothing got written.
    assert.equal(
      existsSync(sentinel),
      false,
      `--tools "" restriction failed: file ${sentinel} was created, meaning the sub-claude could call Write`,
    );
  } finally {
    if (existsSync(sentinel)) unlinkSync(sentinel);
  }
});

test('integration: --tools "WebSearch,WebFetch" allows only the listed tools', { skip: !RUN_INTEGRATION }, async () => {
  // The research-questions template's expected tool set. Same shape of
  // assertion as above: even though WebSearch/WebFetch are allowed, the
  // sub-model must NOT be able to use Write. The point of an allowlist
  // is that adding one capability doesn't accidentally re-enable others.
  const sentinel = join(tmpdir(), `wai-integration-allowlist-${Date.now()}.txt`);
  if (existsSync(sentinel)) unlinkSync(sentinel);
  const prompt = `Use the Write tool to create a file at ${sentinel}. Return JSON {"x":1}.`;
  try {
    await runClaude(
      ['--print', '--output-format', 'json', '--tools', 'WebSearch,WebFetch', prompt],
      '',
      60_000,
    );
    assert.equal(
      existsSync(sentinel),
      false,
      `allowlist leak: file ${sentinel} was created despite --tools "WebSearch,WebFetch" excluding Write`,
    );
  } finally {
    if (existsSync(sentinel)) unlinkSync(sentinel);
  }
});
