import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelative } from './relative-time';

const now = new Date('2026-05-06T20:00:00Z');

test('relative-time: minutes', () => {
  assert.equal(formatRelative('2026-05-06T19:55:00Z', now), '5m ago');
});
test('relative-time: hours', () => {
  assert.equal(formatRelative('2026-05-06T18:00:00Z', now), '2h ago');
});
test('relative-time: yesterday', () => {
  assert.equal(formatRelative('2026-05-05T10:00:00Z', now), 'yesterday');
});
test('relative-time: older than a week', () => {
  assert.equal(formatRelative('2026-04-20T10:00:00Z', now), '2026-04-20');
});
test('relative-time: null returns empty', () => {
  assert.equal(formatRelative(null, now), '');
});
