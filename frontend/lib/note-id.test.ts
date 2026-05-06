import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNoteId } from './server-services';

test('generateNoteId: format', () => {
  for (let i = 0; i < 100; i++) {
    const id = generateNoteId();
    assert.match(id, /^n_[0-9a-hjkmnpqrstvwxyz]{8}$/);
  }
});

test('generateNoteId: unique across 1000 calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateNoteId());
  assert.equal(seen.size, 1000);
});
