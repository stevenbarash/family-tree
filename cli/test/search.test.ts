import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSearch } from '../src/commands/search.js';

test('search: prints rows for hits', async () => {
  let out = '';
  await runSearch({
    query: 'abby',
    limit: 25,
    json: false,
    client: { search: async () => ({ results: [{ slug: 'abby-rickelman', title: 'Abby Rickelman', type: 'person' }] }) } as any,
    write: (s) => { out += s; },
  });
  assert.match(out, /abby-rickelman/);
  assert.match(out, /\(person\)/);
});

test('search: --json emits array', async () => {
  let out = '';
  await runSearch({
    query: 'abby',
    limit: 25,
    json: true,
    client: { search: async () => ({ results: [{ slug: 'a', title: 'A', type: 'person' }] }) } as any,
    write: (s) => { out += s; },
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].slug, 'a');
});

test('search: --include-living forwards true to client', async () => {
  let receivedFlag: boolean | undefined = undefined;
  await runSearch({
    query: 'smith',
    limit: 25,
    json: true,
    includeLiving: true,
    client: {
      search: async (_q: string, _limit: number, includeLiving?: boolean) => {
        receivedFlag = includeLiving;
        return { results: [] };
      },
    } as any,
    write: () => {},
  });
  assert.equal(receivedFlag, true);
});

test('search: default (no --include-living) forwards false-y to client', async () => {
  let receivedFlag: boolean | undefined = undefined;
  await runSearch({
    query: 'smith',
    limit: 25,
    json: true,
    client: {
      search: async (_q: string, _limit: number, includeLiving?: boolean) => {
        receivedFlag = includeLiving;
        return { results: [] };
      },
    } as any,
    write: () => {},
  });
  assert.equal(receivedFlag, undefined);
});

test('search: empty query rejects', async () => {
  await assert.rejects(
    () => runSearch({
      query: '   ',
      limit: 25,
      json: false,
      client: { search: async () => ({ results: [] }) } as any,
      write: () => {},
    }),
    /required/i,
  );
});
