import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTalkThreadShape } from '../../src/checks/talk-thread-shape.ts';
import type { LoadedPage, RepoState } from '../../src/checks/types.ts';

function loadedPage(slug: string, body: string): LoadedPage {
  return {
    slug,
    path: `/fake/${slug}.md`,
    meta: {} as any,
    body,
    text: body,
  };
}

function state(pages: LoadedPage[]): RepoState {
  return {
    rootDir: '/fake',
    gedcomPath: '/fake/x.ged',
    gedcomText: '',
    gedcomAst: { records: [] } as any,
    pages,
    derivedDir: '/fake/derived',
    derived: new Map(),
    placesCoords: [],
  };
}

test('detectTalkThreadShape: empty body → no findings', () => {
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo.talk', '')])), []);
});

test('detectTalkThreadShape: canonical ## + ::open with body → no findings', () => {
  const body = [
    '## Birth year 1881 vs 1887',
    '::open',
    '',
    'body content',
  ].join('\n');
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo.talk', body)])), []);
});

test('detectTalkThreadShape: canonical ### + ::closed → no findings', () => {
  const body = '### Resolved: foo\n::closed\n\nbody';
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo.talk', body)])), []);
});

test('detectTalkThreadShape: tolerates blank lines between heading and marker', () => {
  const body = '## Heading\n\n\n::open\n\nbody';
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo.talk', body)])), []);
});

test('detectTalkThreadShape: orphan marker (no heading above) → one finding', () => {
  const body = [
    '## Open editorial questions',
    '',
    'Intro prose.',
    '',
    '::open',
    '**Marriage to Sonya**: question body...',
  ].join('\n');
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)])).filter(f => f.message.includes('orphan'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.location.line, 5);
  assert.equal(findings[0]!.category, 'schema');
  assert.equal(findings[0]!.severity, 'warn');
  assert.match(findings[0]!.message, /Intro prose/);
});

test('detectTalkThreadShape: orphan marker at top of file → one finding with "top of file" hint', () => {
  const body = '::open\nbody';
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /at top of file/);
});

test('detectTalkThreadShape: single-line `## ::open <id>` → one finding', () => {
  const body = '## ::open holocaust-framing-hebrew\n\n**Issue:** ...';
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /same line as heading/);
  assert.equal(findings[0]!.location.line, 1);
});

test('detectTalkThreadShape: single-line at h3 also caught', () => {
  const body = '### ::closed bug-fixed\n\nbody';
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /same line as heading/);
});

test('detectTalkThreadShape: MediaWiki == heading == + marker → caught as orphan', () => {
  const body = '== Resolved: foo ==\n\n::closed\n\nbody';
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /orphan/);
  assert.match(findings[0]!.message, /Resolved: foo/);
});

test('detectTalkThreadShape: mixed file with canonical + orphan + single-line', () => {
  const body = [
    '## Canonical',
    '::open',
    '',
    'canonical body',
    '',
    '::closed',
    'orphan body',
    '',
    '## ::open identifier',
    '',
    'single-line body',
  ].join('\n');
  const findings = detectTalkThreadShape(state([loadedPage('foo.talk', body)]));
  assert.equal(findings.length, 2);
  assert.match(findings[0]!.message, /orphan/);
  assert.match(findings[1]!.message, /same line/);
});

test('detectTalkThreadShape: ignores non-talk pages entirely', () => {
  const body = '::open\nbody';
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo', body)])), []);
});

test('detectTalkThreadShape: marker inside a paragraph mid-line is not flagged', () => {
  // E.g. "this is an `::open` question" inline — only line-start markers trigger
  const body = 'Some prose mentioning ::open inline.\n\n## Real thread\n::open\n\nbody';
  assert.deepEqual(detectTalkThreadShape(state([loadedPage('foo.talk', body)])), []);
});
