# `wai doctor` + actionable connection errors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `fetch failed` with actionable diagnostics. Add a single `wai doctor` command that surfaces dev-env health (server reachability, configured URL vs. running port, workspace presence, version skew) and `--fix` it where safe — turning two recurring papercuts (stale CLI binary on PATH, stale `~/.whoami/config.json` server URL) into one self-explanatory surface that scales as we add more checks.

**Architecture:** Three pieces, layered: (1) a pure `probeServers` utility that pings well-known localhost candidates for a wai server; (2) `ApiClient` catches connection failures, runs the probe, and throws a `ConnectionError` whose message names the alive port and the exact `wai config` command to fix it; (3) a new `wai doctor` command runs all the same checks proactively (server, workspace, version) and with `--fix` writes the discovered server URL into `~/.whoami/config.json`. A new `/api/version` route lets doctor display the running frontend's version next to the CLI's. No per-command preflight (deferred — error-time probing has zero cost on the happy path).

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`. Frontend route is Next 16 App Router (matches `frontend/app/api/healthz/route.ts`).

**Spec reference:** Surfaced from the P0.2 verification spot-check in conversation 2026-05-09 — both papercuts (`wai` binary out of date, `wai config` pointing at a dead port) wasted reviewer time and produced misleading error output.

---

## Scope

**In scope:**
- `frontend/app/api/version/route.ts` — new GET endpoint returning `{ apiVersion, version, startedAt }`.
- `cli/src/probe.ts` — pure probe + candidate-list helpers.
- `cli/src/api-client.ts` — wrap fetch failures, throw `ConnectionError` with port-probe enrichment.
- `cli/src/commands/doctor.ts` — new command, dependency-injected.
- `cli/src/index.ts` — register `doctor` subcommand + help block.
- `cli/test/probe.test.ts`, `cli/test/api-client.test.ts` (extend), `cli/test/doctor.test.ts` — unit coverage.
- `cli/AGENTS.md` — add `doctor` to commands table.
- `CHANGELOG.md` — `[Unreleased]` Added entry.
- `docs/superpowers/plans/README.md` — new row.

**Out of scope:**
- **Per-command preflight ping.** Error-time probing covers the same failure modes without adding latency to every CLI invocation. Revisit if users hit "the server moved between commands" within a single session — no evidence today.
- **CLI staleness self-check.** Comparing CLI version to a "minimum required" from the server requires a contract that doesn't exist yet (the API surface is unversioned beyond `v2`). Doctor displays both versions side-by-side; the human reads the mismatch. A future plan can add a hard contract version.
- **Auto-reinstalling the CLI binary.** Out of doctor's lane — a global `npm i -g .` modifies the user's PATH. Doctor surfaces the version skew; user fixes it.
- **Workspace `--fix`.** If `$WHOAMI_ROOT` is missing, the right action depends on the user (clone vs. mkdir vs. set env var). Doctor reports; user acts.

## File structure

```
frontend/app/api/version/route.ts   NEW. GET /api/version → JSON.
cli/src/probe.ts                    NEW. probeServers + commonServerCandidates.
cli/src/api-client.ts               MODIFY. ConnectionError class; wrap fetch in json().
cli/src/commands/doctor.ts          NEW. runDoctor (DI-style).
cli/src/index.ts                    MODIFY. Wire `doctor` subcommand + help.
cli/test/probe.test.ts              NEW.
cli/test/api-client.test.ts         MODIFY. Add ConnectionError tests.
cli/test/doctor.test.ts             NEW.
cli/AGENTS.md                       MODIFY. Add doctor row to commands table.
CHANGELOG.md                        MODIFY. [Unreleased] Added entry.
docs/superpowers/plans/README.md    MODIFY. Add row.
```

## Conventions adhered to

- Commands live at `cli/src/commands/<name>.ts`, exporting `run<Name>` with all I/O dependency-injected (matches `check.ts`, `init.ts`, `export.ts`). Tests never touch real disk or real network.
- Output to stdout is parseable when `--json`; human-readable otherwise. Errors to stderr. Non-zero exit on failure.
- New errors extend `ApiError` so the existing `catch` in `index.ts` formats them.
- `/api/version` matches the pattern of `frontend/app/api/healthz/route.ts` (NextResponse.json + `dynamic = 'force-dynamic'`).
- The version constant is duplicated between `cli/src/index.ts` and `frontend/app/api/version/route.ts`; both reference `cli/package.json` as the source of truth in a comment. A shared `core/src/version.ts` is a future cleanup, not part of this plan.

---

## Task 1: `/api/version` route on the frontend

**Files:**
- Create: `frontend/app/api/version/route.ts`

- [ ] **Step 1: Write the route**

Create `frontend/app/api/version/route.ts`:

```typescript
import { NextResponse } from 'next/server';

// Keep in sync with cli/package.json `version` and cli/src/index.ts VERSION.
// `apiVersion` is the wai HTTP API surface; bump only on breaking contract change.
const VERSION = '2.0.0-pre.0';
const API_VERSION = 'v2';
const STARTED_AT = new Date().toISOString();

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    apiVersion: API_VERSION,
    version: VERSION,
    startedAt: STARTED_AT,
  });
}
```

- [ ] **Step 2: Verify by hand**

Run `cd frontend && npm run dev` (in another shell, if not already running) then:

```bash
curl -s http://localhost:3001/api/version | head
```

Expected: JSON with `apiVersion`, `version`, `startedAt`. The `startedAt` is the module-load time and stays stable for the life of the dev server — that's intentional (lets the CLI detect "server has been running since X").

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/version/route.ts
git commit -m "feat(frontend): add /api/version for wai doctor cross-check"
```

---

## Task 2: `probeServers` + `commonServerCandidates` utilities

**Files:**
- Create: `cli/src/probe.ts`
- Test: `cli/test/probe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cli/test/probe.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cli && npx tsx --test test/probe.test.ts
```

Expected: FAIL — `Cannot find module '../src/probe.js'`.

- [ ] **Step 3: Write the probe module**

Create `cli/src/probe.ts`:

```typescript
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_CANDIDATES = [
  'http://localhost:3001',
  'http://localhost:3000',
];

export interface ProbeResult {
  url: string;
  ok: boolean;
}

/**
 * Ping each candidate's `/api/healthz` with a short timeout. Never throws —
 * unreachable candidates report `ok: false`. Returns one result per input,
 * in order, so callers can correlate by index.
 */
export async function probeServers(
  candidates: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult[]> {
  return Promise.all(candidates.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}/api/healthz`, { signal: controller.signal });
      return { url, ok: res.ok };
    } catch {
      return { url, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }));
}

/**
 * Build the candidate list for a probe: the configured URL first (so it gets
 * tried before defaults), then the well-known dev-server ports, deduped.
 * Trailing slashes are stripped so equivalent URLs collapse.
 */
export function commonServerCandidates(configuredUrl: string): string[] {
  const norm = configuredUrl.replace(/\/$/, '');
  const out = [norm];
  for (const d of DEFAULT_CANDIDATES) {
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cli && npx tsx --test test/probe.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/src/probe.ts cli/test/probe.test.ts
git commit -m "feat(cli): add probeServers utility for port discovery"
```

---

## Task 3: `ConnectionError` in api-client

**Files:**
- Modify: `cli/src/api-client.ts`
- Test: `cli/test/api-client.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `cli/test/api-client.test.ts` (after the existing tests, before any final closing of the file — the file has no closing wrapper, tests are top-level):

```typescript
test('ApiClient: connection refused throws ConnectionError with hint', async () => {
  // Get a free port, then close so nothing listens.
  const dead = await new Promise<string>((resolve) => {
    const s = createServer(() => {});
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(`http://127.0.0.1:${port}`));
    });
  });
  const c = new ApiClient(dead);
  await assert.rejects(
    () => c.healthz(),
    (err: Error) => {
      assert.ok(err instanceof ConnectionError, `expected ConnectionError, got ${err.constructor.name}`);
      assert.match(err.message, new RegExp(dead));
      assert.match(err.message, /not responding|unreachable/i);
      return true;
    },
  );
});

test('ApiClient: connection error suggests an alive candidate when one is found', async () => {
  // Stand up an "alive" server on one port, point the client at a different (closed) port.
  const alive = await new Promise<{ url: string; close: () => void }>((resolve) => {
    const s = createServer((req, res) => {
      if (req.url === '/api/healthz') {
        res.setHeader('content-type', 'application/json');
        res.end('{"status":"ok","started":"x"}');
      } else { res.statusCode = 404; res.end(); }
    });
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
  const dead = await new Promise<string>((resolve) => {
    const s = createServer(() => {});
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(`http://127.0.0.1:${port}`));
    });
  });
  try {
    const c = new ApiClient(dead, { extraCandidates: [alive.url] });
    await assert.rejects(
      () => c.healthz(),
      (err: Error) => {
        assert.ok(err instanceof ConnectionError);
        assert.match(err.message, new RegExp(alive.url));
        assert.match(err.message, /wai config server/);
        return true;
      },
    );
  } finally { alive.close(); }
});
```

You'll also need to add `ConnectionError` to the existing import at the top of the file:

```typescript
import { ApiClient, NotFound, BadRequest, ConnectionError } from '../src/api-client.js';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cli && npx tsx --test test/api-client.test.ts
```

Expected: FAIL — `ConnectionError` is not exported.

- [ ] **Step 3: Add `ConnectionError` and wrap fetch in api-client.ts**

Modify `cli/src/api-client.ts`. Add after the existing `ServerError` class:

```typescript
export class ConnectionError extends ApiError {
  constructor(message: string) {
    // status 0: not an HTTP error, but reuses the ApiError surface so the
    // catch block in index.ts formats it the same way.
    super(0, message);
  }
}
```

Also add an import + change the `ApiClient` constructor and `json()` method. Replace the existing `ApiClient` class with:

```typescript
import { probeServers, commonServerCandidates } from './probe.js';

export interface ApiClientOptions {
  /**
   * Extra URLs to include when probing on connection failure. Tests use this
   * to inject a known-alive port without touching real network defaults.
   */
  extraCandidates?: string[];
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly options: ApiClientOptions = {},
  ) {}

  async healthz(): Promise<{ status: string; started: string }> {
    return this.json('GET', '/api/healthz');
  }

  // ... (keep all existing methods unchanged) ...

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network-level failure (ECONNREFUSED, DNS, etc.). Probe well-known ports
      // for an alive wai server and surface the suggestion in the error message.
      throw await this.buildConnectionError(err as Error);
    }
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* keep as text */ }
    if (!res.ok) {
      const detail = parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : text || undefined;
      if (res.status === 404) throw new NotFound(404, detail);
      if (res.status === 400) throw new BadRequest(400, detail);
      throw new ServerError(res.status, detail);
    }
    return parsed as T;
  }

  private async buildConnectionError(cause: Error): Promise<ConnectionError> {
    const candidates = commonServerCandidates(this.baseUrl);
    const extras = (this.options.extraCandidates ?? []).filter(u => !candidates.includes(u));
    const all = [...candidates, ...extras];
    const results = await probeServers(all);
    const alive = results.filter(r => r.ok && r.url !== this.baseUrl.replace(/\/$/, ''));
    if (alive.length > 0) {
      const url = alive[0]!.url;
      return new ConnectionError(
        `server at ${this.baseUrl} is not responding (${cause.message}). ` +
        `Found a wai server at ${url} — run \`wai config server ${url}\` ` +
        `or \`wai doctor --fix\` to switch.`,
      );
    }
    return new ConnectionError(
      `server at ${this.baseUrl} is not responding (${cause.message}). ` +
      `Is the frontend running? (cd frontend && npm run dev). ` +
      `Run \`wai doctor\` for diagnostics.`,
    );
  }
}
```

(Don't actually replace methods one-by-one — keep all the existing `read`, `write`, etc. methods. The relevant changes are: the `import` at the top, the new `options` parameter, and the new `try/catch` around `fetch` plus the `buildConnectionError` helper.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cli && npx tsx --test test/api-client.test.ts
```

Expected: PASS — all original tests still pass + 2 new connection-error tests pass.

- [ ] **Step 5: Commit**

```bash
git add cli/src/api-client.ts cli/test/api-client.test.ts
git commit -m "feat(cli): actionable ConnectionError with port-probe hint"
```

---

## Task 4: `wai doctor` command (read-only)

**Files:**
- Create: `cli/src/commands/doctor.ts`
- Test: `cli/test/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cli/test/doctor.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cli && npx tsx --test test/doctor.test.ts
```

Expected: FAIL — `Cannot find module '../src/commands/doctor.js'`.

- [ ] **Step 3: Write the doctor command**

Create `cli/src/commands/doctor.ts`:

```typescript
import type { ProbeResult } from '../probe.js';

export interface VersionInfo {
  apiVersion: string;
  version: string;
  startedAt: string;
}

export interface DoctorOptions {
  configuredUrl: string;
  candidates: string[];
  probeServers: (urls: string[]) => Promise<ProbeResult[]>;
  fetchVersion: (url: string) => Promise<VersionInfo>;
  cliVersion: string;
  workspaceRoot: string;
  fs: { exists: (p: string) => boolean };
  fix: boolean;
  setServer: (url: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runDoctor(opts: DoctorOptions): Promise<number> {
  let problems = 0;

  // --- Server section ---
  const probes = await opts.probeServers(opts.candidates);
  const configured = probes.find(p => p.url === opts.configuredUrl.replace(/\/$/, ''));
  const otherAlive = probes.filter(p => p.ok && p.url !== opts.configuredUrl.replace(/\/$/, ''));

  if (configured?.ok) {
    opts.write(`server     ${opts.configuredUrl}  ok\n`);
  } else {
    problems++;
    opts.write(`server     ${opts.configuredUrl}  unreachable\n`);
    if (otherAlive.length > 0) {
      const url = otherAlive[0]!.url;
      opts.write(`           found wai server at ${url}\n`);
      if (opts.fix) {
        opts.setServer(url);
        opts.write(`           --fix: saved server=${url}\n`);
        problems--; // self-healed
      } else {
        opts.write(`           run \`wai doctor --fix\` or \`wai config server ${url}\`\n`);
      }
    } else {
      opts.write(`           no wai server found on ports 3001 or 3000\n`);
      opts.write(`           is the frontend running? (cd frontend && npm run dev)\n`);
    }
  }

  // --- Frontend version (only if reachable) ---
  const reachableUrl = configured?.ok ? opts.configuredUrl : otherAlive[0]?.url;
  let frontendVersion: string | undefined;
  if (reachableUrl) {
    try {
      const v = await opts.fetchVersion(reachableUrl);
      frontendVersion = v.version;
      const skew = v.version !== opts.cliVersion;
      const skewNote = skew ? '  (skew vs cli)' : '';
      opts.write(`frontend   ${v.version}  api=${v.apiVersion}  started=${v.startedAt}${skewNote}\n`);
    } catch {
      opts.write(`frontend   version check failed (server reachable but /api/version errored)\n`);
    }
  }

  // --- CLI version ---
  opts.write(`cli        ${opts.cliVersion}\n`);
  if (frontendVersion && frontendVersion !== opts.cliVersion) {
    opts.write(`           note: cli ${opts.cliVersion} ≠ frontend ${frontendVersion} — versions differ but skew is informational, not blocking\n`);
  }

  // --- Workspace section ---
  if (!opts.fs.exists(opts.workspaceRoot)) {
    problems++;
    opts.write(`workspace  ${opts.workspaceRoot}  missing (set $WHOAMI_ROOT or create it)\n`);
  } else {
    const checks: Array<[string, string]> = [
      ['genealogy/', `${opts.workspaceRoot}/genealogy`],
      ['pages/', `${opts.workspaceRoot}/pages`],
    ];
    const missing = checks.filter(([, p]) => !opts.fs.exists(p));
    if (missing.length === 0) {
      opts.write(`workspace  ${opts.workspaceRoot}  ok\n`);
    } else {
      problems++;
      opts.write(`workspace  ${opts.workspaceRoot}  missing: ${missing.map(([n]) => n).join(', ')}\n`);
    }
  }

  return problems > 0 ? 1 : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cli && npx tsx --test test/doctor.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/doctor.ts cli/test/doctor.test.ts
git commit -m "feat(cli): wai doctor command for dev-env health checks"
```

---

## Task 5: Wire `doctor` into `index.ts` + help

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add the `doctor` import**

In `cli/src/index.ts`, add to the imports near the other command imports:

```typescript
import { runDoctor } from './commands/doctor.js';
import { probeServers, commonServerCandidates } from './probe.js';
import { existsSync as exists } from 'node:fs';  // (if not already imported)
```

(`existsSync` is already imported as `existsSync` — reuse it; the alias above is just illustrative if you need a different name.)

- [ ] **Step 2: Add the help block**

In the `HELP` template literal in `cli/src/index.ts`, add a `Diagnostics:` section just above `Server:`:

```
Diagnostics:
  doctor                      Diagnose dev-env: server reachability, workspace,
                                versions. Exit 1 on problems.
        [--fix]                 Auto-correct safe issues (e.g. update server URL
                                to a discovered alive port)
```

- [ ] **Step 3: Add the `doctor` case**

In the `switch (args.cmd)` in `main()`, add a case before the `'healthz'` case:

```typescript
      case 'doctor': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const configuredUrl = getServer();
        const code = await runDoctor({
          configuredUrl,
          candidates: commonServerCandidates(configuredUrl),
          probeServers,
          fetchVersion: async (url) => {
            const res = await fetch(`${url}/api/version`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<{ apiVersion: string; version: string; startedAt: string }>;
          },
          cliVersion: VERSION,
          workspaceRoot: root,
          fs: { exists: (p) => existsSync(p) },
          fix: !!args.flags.fix,
          setServer,
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
```

- [ ] **Step 4: Smoke test**

```bash
cd cli && npx tsx src/index.ts doctor
```

Expected (with frontend running on :3001 and `~/whoami` populated):
- Lines for `server`, `frontend`, `cli`, `workspace`.
- Exit code 0.

```bash
cd cli && WHOAMI_SERVER=http://localhost:9999 npx tsx src/index.ts doctor; echo "exit=$?"
```

Expected:
- `server  http://localhost:9999  unreachable`
- `found wai server at http://localhost:3001` (assuming frontend is running there)
- `run \`wai doctor --fix\`...`
- `exit=1`

```bash
cd cli && WHOAMI_SERVER=http://localhost:9999 npx tsx src/index.ts doctor --fix; echo "exit=$?"
```

Expected: `--fix: saved server=http://localhost:3001`, `exit=0`. Then revert: `wai config server http://localhost:3001` (or restore the prior URL by hand if you set one).

- [ ] **Step 5: Run the full CLI test suite**

```bash
cd cli && npm test
```

Expected: all tests pass (including the new ones in `probe.test.ts`, `doctor.test.ts`, and the extended `api-client.test.ts`).

- [ ] **Step 6: Typecheck**

```bash
cd cli && npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): wire wai doctor into command surface"
```

---

## Task 6: Documentation

**Files:**
- Modify: `cli/AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add `doctor` to `cli/AGENTS.md` commands table**

In the Commands table in `cli/AGENTS.md`, add a row after `init` (and update the "Running `wai` locally" section to point at `wai doctor` instead of the manual `wai healthz` recipe):

```markdown
| `doctor`         | Diagnose dev-env health: server reachability + port discovery, workspace presence, version skew. `--fix` auto-corrects the configured server URL when an alternative wai server is reachable. Standalone for the workspace checks; talks to the API for reachability. |
```

In the "Running `wai` locally" section, replace the lines:

```
The CLI's default server URL is `http://localhost:3001` — same port the
frontend script pins. If they ever drift, `wai healthz` returns
`fetch failed`; fix with either:
```

with:

```
The CLI's default server URL is `http://localhost:3001` — same port the
frontend script pins. If they ever drift, run `wai doctor` (or `wai
doctor --fix` to auto-update the configured URL to whatever wai server
is actually responding on localhost). For manual override:
```

- [ ] **Step 2: Add CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased] — v2 development` → `### Added`, add:

```markdown
- **`wai doctor`** command and actionable connection errors. Replaces
  `fetch failed` with a probe-based hint that names the alive port and
  the exact `wai config server` command to run; `wai doctor` runs the
  same checks proactively (server reachability, workspace presence,
  CLI/frontend version skew) and `--fix` writes the discovered URL into
  `~/.whoami/config.json`. New `/api/version` route on the frontend.
  (`cli/src/probe.ts`, `cli/src/commands/doctor.ts`,
  `frontend/app/api/version/route.ts`.)
```

- [ ] **Step 3: Add plan to the index**

In `docs/superpowers/plans/README.md`, add a row to the table (alphabetical-by-date — goes after the `2026-05-08-…` entries):

```markdown
| ✅ | [`2026-05-09-wai-doctor.md`](./2026-05-09-wai-doctor.md) | `wai doctor` + actionable connection errors | Single command for dev-env diagnostics; `ConnectionError` with port-probe hint replaces `fetch failed`. Surfaced from P0.2 verification papercuts. |
```

(Use `🚧 in-progress` until merged; flip to `✅` and update the count line below the table at merge time.)

- [ ] **Step 4: Commit docs**

```bash
git add cli/AGENTS.md CHANGELOG.md docs/superpowers/plans/README.md docs/superpowers/plans/2026-05-09-wai-doctor.md
git commit -m "docs: wai doctor — AGENTS, CHANGELOG, plan index"
```

---

## Self-review

**Spec coverage** — every claim in the recommendation is implemented:
- "Better error on connection failure" → Task 3 (ConnectionError + buildConnectionError).
- "Auto-probe :3001 → :3000 with hint" → Task 2 (commonServerCandidates) + Task 3.
- "wai doctor" → Task 4 + Task 5.
- "—fix" → Task 4 (fix branch in runDoctor) + Task 5 (flag wiring).
- "/api/version" → Task 1.
- "Workspace check" → Task 4 (fs.exists checks).
- "Version skew display" → Task 4 (test 5 covers).
- "Per-command preflight (deferred)" → explicitly out-of-scope with rationale.

**Placeholder scan:** no TBDs, no "implement later." Every code block is the exact code an engineer types.

**Type consistency:**
- `ProbeResult { url, ok }` — defined in probe.ts (Task 2), consumed in doctor.ts (Task 4) via `import type`.
- `VersionInfo { apiVersion, version, startedAt }` — defined in doctor.ts; matches the JSON shape returned by Task 1's route.
- `DoctorOptions.fs.exists` — matches `existsSync` signature (path → boolean) used in Task 5's wiring.
- `setServer(url: string): void` — matches the existing signature in `cli/src/config.ts`.
- `ConnectionError extends ApiError` — caught by the existing `catch (err) { if (err instanceof ApiError)` in `index.ts:412`.

No type drift detected.
