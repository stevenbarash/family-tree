import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeServers, commonServerCandidates } from '../src/probe.js';

test('probeServers: empty array returns empty', async () => {
  const results = await probeServers([]);
  assert.equal(results.length, 0);
});

test('commonServerCandidates: empty string', () => {
  const out = commonServerCandidates('');
  assert.equal(out[0], '');
  assert.ok(out.includes('http://localhost:3001'));
});

test('commonServerCandidates: double trailing slash', () => {
  // Strip every trailing slash, not just one — otherwise a configured URL
  // like `http://host:3001//` reaches `fetch` as `http://host:3001//api/...`
  // and the deduped-against-defaults comparison in doctor/api-client
  // (which normalize the same way) breaks for any URL with >1 trailing /.
  const out = commonServerCandidates('http://localhost:3001//');
  assert.equal(out[0], 'http://localhost:3001');
});

test('probeServers: never throws, even on malformed URL', async () => {
  const results = await probeServers(['not-a-url', 'also-bad']);
  assert.equal(results.length, 2);
  assert.equal(results[0]!.ok, false);
  assert.equal(results[1]!.ok, false);
});
