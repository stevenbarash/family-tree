import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/commands/doctor.js';

interface FakeFs {
  exists: (p: string) => boolean;
}

function fakeFs(paths: string[]): FakeFs {
  const set = new Set(paths);
  return { exists: (p) => set.has(p) };
}

test('doctor: all green → exit 0, prints "ok" lines', async () => {
  let out = '';
  let err = '';
  const code = await runDoctor({
    configuredUrl: 'http://localhost:3001',
    candidates: ['http://localhost:3001', 'http://localhost:3000'],
    probeServers: async () => [
      { url: 'http://localhost:3001', ok: true },
      { url: 'http://localhost:3000', ok: false },
    ],
    fetchVersion: async () => ({ apiVersion: 'v2', version: '2.0.0-pre.0', startedAt: '2026-05-09T12:00:00Z' }),
    cliVersion: '2.0.0-pre.0',
    workspaceRoot: '/home/u/whoami',
    fs: fakeFs(['/home/u/whoami', '/home/u/whoami/genealogy', '/home/u/whoami/pages']),
    fix: false,
    setServer: () => { throw new Error('setServer must not be called when --fix is off'); },
    write: (s) => { out += s; },
    writeErr: (s) => { err += s; },
  });
  assert.equal(code, 0);
  assert.match(out, /server.*http:\/\/localhost:3001.*ok/i);
  assert.match(out, /workspace.*\/home\/u\/whoami.*ok/i);
  assert.match(out, /cli.*2\.0\.0-pre\.0/);
  assert.match(out, /frontend.*2\.0\.0-pre\.0/);
});

test('doctor: configured URL dead but other port alive → exit 1, suggests fix command', async () => {
  let out = '';
  const code = await runDoctor({
    configuredUrl: 'http://localhost:3000',
    candidates: ['http://localhost:3000', 'http://localhost:3001'],
    probeServers: async () => [
      { url: 'http://localhost:3000', ok: false },
      { url: 'http://localhost:3001', ok: true },
    ],
    fetchVersion: async () => { throw new Error('unreachable'); },
    cliVersion: '2.0.0-pre.0',
    workspaceRoot: '/home/u/whoami',
    fs: fakeFs(['/home/u/whoami', '/home/u/whoami/genealogy', '/home/u/whoami/pages']),
    fix: false,
    setServer: () => { throw new Error('--fix off'); },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 1);
  assert.match(out, /server.*http:\/\/localhost:3000.*unreachable/i);
  assert.match(out, /found.*http:\/\/localhost:3001/i);
  assert.match(out, /wai doctor --fix|wai config server http:\/\/localhost:3001/);
});

test('doctor: nothing reachable → exit 1, suggests starting the frontend', async () => {
  let out = '';
  const code = await runDoctor({
    configuredUrl: 'http://localhost:3001',
    candidates: ['http://localhost:3001', 'http://localhost:3000'],
    probeServers: async () => [
      { url: 'http://localhost:3001', ok: false },
      { url: 'http://localhost:3000', ok: false },
    ],
    fetchVersion: async () => { throw new Error('unreachable'); },
    cliVersion: '2.0.0-pre.0',
    workspaceRoot: '/home/u/whoami',
    fs: fakeFs(['/home/u/whoami', '/home/u/whoami/genealogy', '/home/u/whoami/pages']),
    fix: false,
    setServer: () => { throw new Error('--fix off'); },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 1);
  assert.match(out, /no wai server found|frontend.*not running|cd frontend.*npm run dev/i);
});

test('doctor: missing workspace dir → exit 1, names what is missing', async () => {
  let out = '';
  const code = await runDoctor({
    configuredUrl: 'http://localhost:3001',
    candidates: ['http://localhost:3001'],
    probeServers: async () => [{ url: 'http://localhost:3001', ok: true }],
    fetchVersion: async () => ({ apiVersion: 'v2', version: '2.0.0-pre.0', startedAt: 'x' }),
    cliVersion: '2.0.0-pre.0',
    workspaceRoot: '/missing',
    fs: fakeFs([]),  // nothing exists
    fix: false,
    setServer: () => { throw new Error('--fix off'); },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 1);
  assert.match(out, /workspace.*\/missing.*missing|not found/i);
});

test('doctor: version skew between CLI and frontend → notes mismatch but does not exit non-zero', async () => {
  let out = '';
  const code = await runDoctor({
    configuredUrl: 'http://localhost:3001',
    candidates: ['http://localhost:3001'],
    probeServers: async () => [{ url: 'http://localhost:3001', ok: true }],
    fetchVersion: async () => ({ apiVersion: 'v2', version: '1.9.0', startedAt: 'x' }),
    cliVersion: '2.0.0-pre.0',
    workspaceRoot: '/home/u/whoami',
    fs: fakeFs(['/home/u/whoami', '/home/u/whoami/genealogy', '/home/u/whoami/pages']),
    fix: false,
    setServer: () => { throw new Error('--fix off'); },
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  // Skew is informational, not failure — agents may run mismatched versions intentionally.
  assert.equal(code, 0);
  assert.match(out, /skew|differ|mismatch|≠|!=/i);
});
