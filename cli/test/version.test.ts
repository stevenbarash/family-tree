import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// cli package root (this file is cli/test/version.test.ts).
const cliRoot = fileURLToPath(new URL('../', import.meta.url));

function runWai(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', ...args], {
      cwd: cliRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('wai --version reports the package.json version', async () => {
  // `wai --version` (and the cliVersion `wai doctor` uses for skew
  // detection) must track package.json. A hardcoded copy silently drifts
  // the moment package.json is bumped for a release — which is exactly
  // what happened: the constant read 2.0.0-pre.0 while package.json had
  // already moved to 2.0.0-pre.1.
  const pkg = JSON.parse(readFileSync(`${cliRoot}package.json`, 'utf-8')) as { version: string };
  const { code, stdout, stderr } = await runWai(['--version']);
  assert.equal(code, 0, `exited ${code}; stderr:\n${stderr}`);
  assert.equal(stdout.trim(), pkg.version);
});
