import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelative } from './relative-time';

const now = new Date('2026-05-06T20:00:00Z');

test('relative-time: minutes (en)', () => {
  assert.equal(formatRelative('2026-05-06T19:55:00Z', 'en', now), '5 minutes ago');
});
test('relative-time: hours (en)', () => {
  assert.equal(formatRelative('2026-05-06T18:00:00Z', 'en', now), '2 hours ago');
});
test('relative-time: yesterday (en, numeric:auto collapses 1d to "yesterday")', () => {
  assert.equal(formatRelative('2026-05-05T10:00:00Z', 'en', now), 'yesterday');
});
test('relative-time: older than a week falls back to locale date string', () => {
  // toLocaleDateString output is locale-specific; just sniff that the
  // year shows up so we don't pin the test to a specific date format.
  const result = formatRelative('2026-04-20T10:00:00Z', 'en', now);
  assert.match(result, /2026/);
});
test('relative-time: null returns empty', () => {
  assert.equal(formatRelative(null, 'en', now), '');
});
test('relative-time: russian locale', () => {
  // Intl.RelativeTimeFormat uses Slavic plurals; 5 minutes → "минут" (genitive)
  assert.equal(formatRelative('2026-05-06T19:55:00Z', 'ru', now), '5 минут назад');
});
test('relative-time: hebrew locale renders past relative form', () => {
  // Hebrew has a "dual" form for 2 (שעתיים = "two hours") so we can't
  // assert on "שעות". Just confirm the locale produced Hebrew script
  // and the "before" preposition לפני.
  const result = formatRelative('2026-05-06T18:00:00Z', 'he', now);
  assert.match(result, /לפני/);
});
