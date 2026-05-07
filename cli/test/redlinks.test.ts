import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRedlinks } from '../src/commands/redlinks.js';

const sample = {
  redlinks: [
    { target: 'Unknown One', canonical: 'unknown one', count: 3, sources: ['a', 'b', 'c'] },
    { target: 'Unknown Two', canonical: 'unknown two', count: 1, sources: ['a'] },
  ],
};

test('redlinks: prints "no redlinks" on empty', async () => {
  let out = '';
  await runRedlinks({
    limit: 25,
    json: false,
    client: { redlinks: async () => ({ redlinks: [] }) } as any,
    write: (s) => { out += s; },
  });
  assert.match(out, /no redlinks/);
});

test('redlinks: text output sorts by count and shows target', async () => {
  let out = '';
  await runRedlinks({
    limit: 25,
    json: false,
    client: { redlinks: async () => sample } as any,
    write: (s) => { out += s; },
  });
  const lines = out.trim().split('\n');
  assert.match(lines[0]!, /3\s+Unknown One/);
  assert.match(lines[1]!, /1\s+Unknown Two/);
});

test('redlinks: --limit caps the printed list', async () => {
  let out = '';
  await runRedlinks({
    limit: 1,
    json: false,
    client: { redlinks: async () => sample } as any,
    write: (s) => { out += s; },
  });
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /Unknown One/);
});

test('redlinks: --json prints the raw payload', async () => {
  let out = '';
  await runRedlinks({
    limit: 25,
    json: true,
    client: { redlinks: async () => sample } as any,
    write: (s) => { out += s; },
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.redlinks.length, 2);
  assert.equal(parsed.redlinks[0].target, 'Unknown One');
});
