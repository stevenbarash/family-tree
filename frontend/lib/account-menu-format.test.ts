import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeSignIn } from './account-menu-format.ts';

// relativeSignIn is asserted against Intl.RelativeTimeFormat itself so the
// test verifies the unit-bucketing logic, not a hardcoded ICU string.
function expected(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
}

test('relativeSignIn: under a minute → seconds', () => {
  const iat = 1_700_000_000;
  const now = (iat + 30) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-30, 'second'));
});

test('relativeSignIn: minutes bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 5 * 60) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-5, 'minute'));
});

test('relativeSignIn: hours bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 2 * 3600) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-2, 'hour'));
});

test('relativeSignIn: days bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 3 * 86400) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-3, 'day'));
});

test('relativeSignIn: 59s stays in the seconds bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 59) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-59, 'second'));
});

test('relativeSignIn: exactly 60s enters the minutes bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 60) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-1, 'minute'));
});

test('relativeSignIn: exactly 3600s enters the hours bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 3600) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-1, 'hour'));
});

test('relativeSignIn: exactly 86400s enters the days bucket', () => {
  const iat = 1_700_000_000;
  const now = (iat + 86400) * 1000;
  assert.equal(relativeSignIn(iat, now, 'en'), expected(-1, 'day'));
});
