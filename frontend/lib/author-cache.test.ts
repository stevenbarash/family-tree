import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthor, _clearAuthorCache } from './author-cache.ts';

test('resolveAuthor: caches within the TTL, reloads after it', async () => {
  _clearAuthorCache();
  let calls = 0;
  const loader = async (userId: string) => {
    calls++;
    return { name: `User ${userId}`, email: `${userId}@x.test` };
  };
  let clock = 1_000_000;
  const now = () => clock;

  const first = await resolveAuthor('U-cache-1', loader, now);
  assert.deepEqual(first, { name: 'User U-cache-1', email: 'U-cache-1@x.test' });
  assert.equal(calls, 1);

  // within the 5-minute TTL — served from cache, loader not called again
  clock += 60_000;
  await resolveAuthor('U-cache-1', loader, now);
  assert.equal(calls, 1);

  // past the TTL — loader called again
  clock += 5 * 60_000;
  await resolveAuthor('U-cache-1', loader, now);
  assert.equal(calls, 2);
});

test('resolveAuthor: distinct userIds cache independently', async () => {
  _clearAuthorCache();
  let calls = 0;
  const loader = async (userId: string) => {
    calls++;
    return { name: userId, email: `${userId}@x.test` };
  };
  const now = () => 2_000_000;
  await resolveAuthor('U-a', loader, now);
  await resolveAuthor('U-b', loader, now);
  assert.equal(calls, 2);
});
