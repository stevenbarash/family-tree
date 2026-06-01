import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRead } from '../src/commands/read.js';

test('read: prints body to stdout (default)', async () => {
  let out = '';
  await runRead({
    slug: 'foo',
    json: false,
    write: (s: string) => { out += s; },
    client: { read: async () => ({ slug: 'foo', meta: { title: 'Foo' }, body: 'hello' }) } as any,
  });
  assert.equal(out, 'hello\n');
});

test('read: --json emits full page', async () => {
  let out = '';
  await runRead({
    slug: 'foo',
    json: true,
    write: (s: string) => { out += s; },
    client: { read: async () => ({ slug: 'foo', meta: { title: 'Foo' }, body: 'hello' }) } as any,
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.slug, 'foo');
  assert.equal(parsed.body, 'hello');
});

test('read: rejects empty slug without calling the API', async () => {
  let called = false;
  await assert.rejects(
    () => runRead({ slug: '', json: false, write: () => {}, client: { read: async () => { called = true; return {} as any; } } as any }),
    /slug/i,
  );
  assert.equal(called, false);
});
