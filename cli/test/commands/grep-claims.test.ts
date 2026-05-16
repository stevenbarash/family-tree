import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGrepClaims } from '../../src/commands/grep-claims.js';

function setupWiki(): string {
  const root = mkdtempSync(join(tmpdir(), 'grep-claims-'));
  mkdirSync(join(root, 'pages'), { recursive: true });
  mkdirSync(join(root, 'assets', 'sources', 'a-source'), { recursive: true });
  mkdirSync(join(root, 'pages', '_archived'), { recursive: true });
  return root;
}

test('grep-claims: finds the phrase across live, talk, and transcript files', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'boris.md'), 'Boris had the For Defense of Kyiv medal.\n');
    writeFileSync(join(root, 'pages', 'boris.talk.md'), '## Notes\n\nDefence-of-Kyiv claim repeated here.\n- For Defense of Kyiv: needs verification\n');
    writeFileSync(join(root, 'assets', 'sources', 'a-source', 'transcript.md'), 'Original Ukrainian: За оборону Києва.\n');
    let out = '';
    const code = runGrepClaims({
      rootDir: root,
      phrases: ['For Defense of Kyiv', 'За оборону Києва'],
      includeSources: true,
      includeTalk: true,
      caseInsensitive: true,
      json: false,
      write: (s) => { out += s; },
    });
    assert.equal(code, 0);
    assert.match(out, /pages\/boris\.md/);
    assert.match(out, /pages\/boris\.talk\.md/);
    assert.match(out, /assets\/sources\/a-source\/transcript\.md/);
    assert.match(out, /3 hits across 3 files/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: --no-talk skips talk files', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'boris.md'), 'Boris had the medal.\n');
    writeFileSync(join(root, 'pages', 'boris.talk.md'), 'talk had the medal too\n');
    let out = '';
    runGrepClaims({
      rootDir: root,
      phrases: ['medal'],
      includeSources: false,
      includeTalk: false,
      caseInsensitive: true,
      json: false,
      write: (s) => { out += s; },
    });
    assert.match(out, /pages\/boris\.md/);
    assert.doesNotMatch(out, /pages\/boris\.talk\.md/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: --no-sources skips assets/sources transcripts', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'a.md'), 'main wiki match.\n');
    writeFileSync(join(root, 'assets', 'sources', 'a-source', 'transcript.md'), 'source match.\n');
    let out = '';
    runGrepClaims({
      rootDir: root,
      phrases: ['match'],
      includeSources: false,
      includeTalk: true,
      caseInsensitive: true,
      json: false,
      write: (s) => { out += s; },
    });
    assert.match(out, /pages\/a\.md/);
    assert.doesNotMatch(out, /transcript\.md/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: skips _archived and dotfiles', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'a.md'), 'visible\n');
    writeFileSync(join(root, 'pages', '_archived', 'old.md'), 'visible\n');
    writeFileSync(join(root, 'pages', '.draft.md'), 'visible\n');
    let out = '';
    const code = runGrepClaims({
      rootDir: root,
      phrases: ['visible'],
      includeSources: false,
      includeTalk: true,
      caseInsensitive: true,
      json: false,
      write: (s) => { out += s; },
    });
    assert.equal(code, 0);
    assert.match(out, /1 hit across 1 file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: --json output groups by primary + variants', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'a.md'), 'English here\nUkrainian below\nза оборону Києва\n');
    let out = '';
    runGrepClaims({
      rootDir: root,
      phrases: ['English', 'За оборону Києва'],
      includeSources: false,
      includeTalk: true,
      caseInsensitive: true,
      json: true,
      write: (s) => { out += s; },
    });
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed.phrases, ['English', 'За оборону Києва']);
    assert.equal(parsed.hits.length, 2);
    assert.ok(parsed.hits.some((h: { line: number; phrase: string }) => h.line === 1 && h.phrase === 'English'));
    assert.ok(parsed.hits.some((h: { line: number; phrase: string }) => h.line === 3 && h.phrase === 'За оборону Києва'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: case-sensitive mode is honoured', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'a.md'), 'BORIS\nboris\nBoris\n');
    let out = '';
    runGrepClaims({
      rootDir: root,
      phrases: ['Boris'],
      includeSources: false,
      includeTalk: true,
      caseInsensitive: false,
      json: false,
      write: (s) => { out += s; },
    });
    // Only the third line ("Boris") matches in case-sensitive mode.
    assert.match(out, /1 hit across 1 file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: zero hits returns 0 with informative message', () => {
  const root = setupWiki();
  try {
    writeFileSync(join(root, 'pages', 'a.md'), 'unrelated content\n');
    let out = '';
    const code = runGrepClaims({
      rootDir: root,
      phrases: ['nonexistent'],
      includeSources: true,
      includeTalk: true,
      caseInsensitive: true,
      json: false,
      write: (s) => { out += s; },
    });
    assert.equal(code, 0);
    assert.match(out, /no hits for "nonexistent"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('grep-claims: empty phrase array errors out', () => {
  let out = '';
  const code = runGrepClaims({
    rootDir: '/tmp',
    phrases: [],
    includeSources: true,
    includeTalk: true,
    caseInsensitive: true,
    json: false,
    write: (s) => { out += s; },
  });
  assert.equal(code, 2);
  assert.match(out, /no phrase to search for/);
});
