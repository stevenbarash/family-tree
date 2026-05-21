import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePositiveInt } from '../src/flags.js';

test('parsePositiveInt: a positive integer string parses to that number', () => {
  assert.equal(parsePositiveInt('25', 50), 25);
  assert.equal(parsePositiveInt('1', 50), 1);
});

test('parsePositiveInt: a negative value falls back instead of passing through', () => {
  // The bug this guards: `parseInt(x, 10) || fallback` lets a negative
  // through because -5 is truthy, so `--limit -5` reached the API query
  // string and `--recent -3` became `git log -n -3`.
  assert.equal(parsePositiveInt('-5', 50), 50);
});

test('parsePositiveInt: zero falls back (a zero-length result is never wanted)', () => {
  assert.equal(parsePositiveInt('0', 50), 50);
});

test('parsePositiveInt: a non-numeric string falls back', () => {
  assert.equal(parsePositiveInt('abc', 50), 50);
});

test('parsePositiveInt: a missing flag (undefined) falls back', () => {
  assert.equal(parsePositiveInt(undefined, 50), 50);
});

test('parsePositiveInt: a bare flag (boolean true) falls back', () => {
  // `--limit` with no following token parses as boolean true.
  assert.equal(parsePositiveInt(true, 50), 50);
});
