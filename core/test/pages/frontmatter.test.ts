import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePage, serializePage, peekSchemaVersion } from '../../src/pages/frontmatter.ts';
import {
  CURRENT_SCHEMA_VERSION,
  FutureSchemaVersionError,
} from '../../src/pages/migrations/index.ts';

const SAMPLE = `---
title: Abby Rickelman
owner: steven
editors: []
type: person
aliases: []
categories: [Family, People]
created: 2026-04-29
---

Body text here.
`;

test('parsePage: parses frontmatter and body', () => {
  const page = parsePage('abby-rickelman', SAMPLE);
  assert.equal(page.slug, 'abby-rickelman');
  assert.equal(page.meta.title, 'Abby Rickelman');
  assert.deepEqual(page.meta.categories, ['Family', 'People']);
  assert.match(page.body, /^Body text here\./);
});

test('parsePage: throws on invalid frontmatter (missing title)', () => {
  const bad = '---\nowner: steven\ntype: person\n---\nbody';
  assert.throws(() => parsePage('x', bad));
});

test('serializePage: round-trips frontmatter + body', () => {
  const page = parsePage('abby-rickelman', SAMPLE);
  const text = serializePage(page);
  const re = parsePage('abby-rickelman', text);
  assert.deepEqual(re.meta, page.meta);
  assert.equal(re.body.trim(), 'Body text here.');
});

test('serializePage: preserves gedcom block', () => {
  const page = parsePage('x', `---
title: X
owner: steven
editors: []
type: person
aliases: []
categories: []
gedcom:
  file: a.ged
  record: I1
  snapshot: abc
created: 2026-04-29
---
Body
`);
  const text = serializePage(page);
  assert.match(text, /gedcom:/);
  assert.match(text, /file: a\.ged/);
  assert.match(text, /record: I1/);
});

test('serializePage round-trips every PageMeta field including portrait and schemaVersion', () => {
  const page = {
    slug: 'sample',
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      title: 'Sample',
      owner: 'me',
      editors: ['a', 'b'],
      type: 'person' as const,
      aliases: ['Sam'],
      categories: ['demo'],
      gedcom: { file: 'tree.ged', record: 'I42', snapshot: 'abc123' },
      portrait: 'sha256:deadbeef',
      created: '2026-05-01',
      corrections: [],
    },
    body: 'Body text\n',
  };

  const serialized = serializePage(page);
  const round = parsePage(page.slug, serialized);

  assert.deepEqual(round.meta, page.meta);
});

test('serializePage omits portrait when not set (no empty/null emission)', () => {
  const page = {
    slug: 'sample',
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      title: 'Sample',
      owner: 'me',
      editors: [],
      type: 'person' as const,
      aliases: [],
      categories: [],
      created: '2026-05-01',
      corrections: [],
    },
    body: 'x',
  };
  const serialized = serializePage(page);
  assert.ok(!/^portrait:/m.test(serialized), `expected no portrait line, got:\n${serialized}`);
});

test('peekSchemaVersion returns 1 when frontmatter has no schemaVersion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'peek-'));
  const file = join(dir, 'p.md');
  writeFileSync(file, '---\ntitle: x\n---\nbody');
  assert.equal(peekSchemaVersion(file), 1);
});

test('peekSchemaVersion returns the explicit value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'peek-'));
  const file = join(dir, 'p.md');
  writeFileSync(file, '---\nschemaVersion: 7\ntitle: x\n---\nbody');
  assert.equal(peekSchemaVersion(file), 7);
});

test('parsePage defaults missing schemaVersion to CURRENT_SCHEMA_VERSION', () => {
  const raw = `---
title: Sample
owner: me
editors: []
type: person
aliases: []
categories: []
created: 2026-05-01
---
body`;
  const page = parsePage('sample', raw);
  assert.equal(page.meta.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('parsePage: extracts translation frontmatter from translation file', () => {
  const md = `---
schemaVersion: 1
title: Эбби
lang: ru
translation_of: abby-rickelman
canonical_sha: a3f2c19abc
translated_at: '2026-05-17'
owner: x
editors: []
type: person
aliases: []
categories: []
created: '2026-05-01'
corrections: []
---
русский body`;
  const page = parsePage('abby-rickelman', md);
  assert.equal(page.meta.translationOf, 'abby-rickelman');
  assert.equal(page.meta.canonicalSha, 'a3f2c19abc');
  assert.equal(page.meta.translatedAt, '2026-05-17');
  assert.equal(page.meta.lang, 'ru');
});

test('parsePage: canonical EN file has undefined translation fields', () => {
  const md = `---
schemaVersion: 1
title: Abby
owner: x
editors: []
type: person
aliases: []
categories: []
created: '2026-05-01'
corrections: []
---
body`;
  const page = parsePage('abby', md);
  assert.equal(page.meta.translationOf, undefined);
  assert.equal(page.meta.canonicalSha, undefined);
  assert.equal(page.meta.translatedAt, undefined);
  assert.equal(page.meta.lang, undefined);
});

test('serializePage: round-trips translation frontmatter', () => {
  const page = {
    slug: 'abby-rickelman',
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      title: 'Эбби',
      owner: 'x',
      editors: [],
      type: 'person' as const,
      aliases: [],
      categories: [],
      created: '2026-05-01',
      corrections: [],
      lang: 'ru',
      translationOf: 'abby-rickelman',
      canonicalSha: 'a3f2c19abc',
      translatedAt: '2026-05-17',
    },
    body: 'русский body\n',
  };
  const serialized = serializePage(page);
  // Disk form is snake_case for translation_of/canonical_sha/translated_at.
  assert.match(serialized, /^lang: ru$/m);
  assert.match(serialized, /^translation_of: abby-rickelman$/m);
  assert.match(serialized, /^canonical_sha: a3f2c19abc$/m);
  assert.match(serialized, /^translated_at: '?2026-05-17'?$/m);
  const round = parsePage(page.slug, serialized);
  assert.deepEqual(round.meta, page.meta);
});

test('parsePage throws FutureSchemaVersionError for too-new pages', () => {
  const raw = `---
schemaVersion: ${CURRENT_SCHEMA_VERSION + 1}
title: Sample
owner: me
editors: []
type: person
aliases: []
categories: []
created: 2026-05-01
---
body`;
  assert.throws(() => parsePage('sample', raw), FutureSchemaVersionError);
});
