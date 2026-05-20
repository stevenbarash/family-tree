import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeAuthedUrl } from './sync.ts';

test('composeAuthedUrl: embeds the token into an https URL', () => {
  assert.equal(
    composeAuthedUrl('https://github.com/u/r.git', 'TOK'),
    'https://x-access-token:TOK@github.com/u/r.git',
  );
});

test('composeAuthedUrl: returns the URL unchanged when there is no token', () => {
  assert.equal(
    composeAuthedUrl('https://github.com/u/r.git', ''),
    'https://github.com/u/r.git',
  );
});

test('composeAuthedUrl: leaves non-https (ssh) URLs alone', () => {
  assert.equal(
    composeAuthedUrl('git@github.com:u/r.git', 'TOK'),
    'git@github.com:u/r.git',
  );
});
