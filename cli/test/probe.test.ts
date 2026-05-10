import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { probeServers, commonServerCandidates } from '../src/probe.js';

function listenOn(handler: (req: any, res: any) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s: Server = createServer(handler);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}

test('probeServers: alive server reports ok', async () => {
  const s = await listenOn((req, res) => {
    if (req.url === '/api/healthz') {
      res.setHeader('content-type', 'application/json');
      res.end('{"status":"ok","started":"now"}');
    } else { res.statusCode = 404; res.end(); }
  });
  try {
    const results = await probeServers([s.url]);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.url, s.url);
    assert.equal(results[0]!.ok, true);
  } finally { s.close(); }
});

test('probeServers: closed port reports not ok', async () => {
  // Open then immediately close to claim a free port that nothing listens on.
  const s = await listenOn(() => {});
  const closedUrl = s.url;
  s.close();
  // Tiny wait for OS to release the port handler — fetch should still ECONNREFUSED.
  const results = await probeServers([closedUrl]);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.ok, false);
});

test('probeServers: returns one result per candidate, in order', async () => {
  const alive = await listenOn((req, res) => {
    if (req.url === '/api/healthz') { res.end('{}'); } else { res.statusCode = 404; res.end(); }
  });
  const dead = await listenOn(() => {});
  const deadUrl = dead.url;
  dead.close();
  try {
    const results = await probeServers([deadUrl, alive.url]);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.url, deadUrl);
    assert.equal(results[0]!.ok, false);
    assert.equal(results[1]!.url, alive.url);
    assert.equal(results[1]!.ok, true);
  } finally { alive.close(); }
});

test('commonServerCandidates: dedupes configured URL against defaults', () => {
  const out = commonServerCandidates('http://localhost:3001');
  assert.deepEqual(out, ['http://localhost:3001', 'http://localhost:3000']);
});

test('commonServerCandidates: configured URL first when novel', () => {
  const out = commonServerCandidates('http://localhost:4000');
  assert.deepEqual(out, ['http://localhost:4000', 'http://localhost:3001', 'http://localhost:3000']);
});

test('commonServerCandidates: strips trailing slash', () => {
  const out = commonServerCandidates('http://localhost:3001/');
  assert.deepEqual(out, ['http://localhost:3001', 'http://localhost:3000']);
});
