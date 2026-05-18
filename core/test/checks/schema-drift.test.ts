import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSchemaDrift } from '../../src/checks/schema-drift.ts';
import type { RepoState, LoadedPage } from '../../src/checks/types.ts';
import type { PageMeta } from '../../src/pages/types.ts';

function page(slug: string, schemaVersion: number): LoadedPage {
  const meta: PageMeta = {
    schemaVersion,
    title: 'T',
    owner: 'x',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-01-01',
    corrections: [],
  };
  return { slug, path: `/tmp/x/pages/${slug}.md`, meta, body: '', text: '' };
}

function makeState(pages: LoadedPage[]): RepoState {
  return {
    rootDir: '/tmp/x',
    gedcomPath: '/tmp/x/g.ged',
    gedcomText: '',
    gedcomAst: { individuals: new Map(), families: new Map() } as any,
    pages,
    derivedDir: '/tmp/x/d',
    derived: new Map(),
    placesCoords: [],
  };
}

test('schema-drift: all pages at current version → no findings', () => {
  const state = makeState([page('a', 1), page('b', 1)]);
  assert.deepEqual(detectSchemaDrift(state), []);
});

test('schema-drift: page below current version → one finding', () => {
  // Simulate a future scenario where CURRENT_SCHEMA_VERSION has bumped to 2.
  // The detector takes CURRENT_SCHEMA_VERSION at module load — to test, we
  // construct a page with version 0 (artificially behind).
  const state = makeState([page('a', 0)]);
  const findings = detectSchemaDrift(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.category, 'schema');
  assert.match(findings[0]!.message, /schemaVersion 0/);
  assert.match(findings[0]!.message, /wai migrate/i);
});

test('schema-drift: multiple pages below version → one finding per page', () => {
  const state = makeState([page('a', 0), page('b', 0), page('c', 1)]);
  const findings = detectSchemaDrift(state);
  assert.equal(findings.length, 2);
});

test('schema-drift: surfaces parseErrors as error findings', () => {
  const state = makeState([page('a', 1)]);
  const stateWithErrors = {
    ...state,
    parseErrors: [
      { path: '/x/pages/ru/broken.md',
        error: '[{"path":["translationOf"],"message":"expected a page slug, not a path or filename","code":"invalid_format"}]' },
      { path: '/x/pages/en/another.md',
        error: 'unexpected non-Zod error string' },
    ],
  };
  const findings = detectSchemaDrift(stateWithErrors);
  // 0 from the existing version-check (page is at v1) + 2 from parseErrors
  assert.equal(findings.length, 2);
  assert.equal(findings[0]!.severity, 'error');
  assert.equal(findings[0]!.category, 'schema');
  assert.match(findings[0]!.message, /translationOf: expected a page slug/);
  assert.equal(findings[0]!.location.file, '/x/pages/ru/broken.md');
  assert.match(findings[1]!.message, /unexpected non-Zod error string/);
});

test('schema-drift: empty parseErrors works (back-compat with old fixtures)', () => {
  // RepoState.parseErrors is optional; absence should not crash the detector.
  const state = makeState([page('a', 1)]);
  // state.parseErrors is undefined here
  assert.deepEqual(detectSchemaDrift(state), []);
});
