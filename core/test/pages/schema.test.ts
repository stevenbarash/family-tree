import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageMeta } from '../../src/pages/schema.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/pages/migrations/index.ts';

test('parsePageMeta: accepts a minimal valid frontmatter object', () => {
  const meta = parsePageMeta({
    title: 'Steven Barash',
    owner: 'steven',
    editors: [],
    type: 'person',
    aliases: [],
    categories: ['Family'],
    created: '2026-04-29',
  });
  assert.equal(meta.title, 'Steven Barash');
  assert.equal(meta.owner, 'steven');
  assert.equal(meta.type, 'person');
});

test('parsePageMeta: accepts a gedcom block', () => {
  const meta = parsePageMeta({
    title: 'X',
    owner: 'steven',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    gedcom: { file: 'a.ged', record: 'I1', snapshot: 'abc' },
    created: '2026-04-29',
  });
  assert.deepEqual(meta.gedcom, { file: 'a.ged', record: 'I1', snapshot: 'abc' });
});

test('parsePageMeta: rejects invalid type', () => {
  assert.throws(() => parsePageMeta({
    title: 'X', owner: 'a', editors: [], type: 'invalid', aliases: [], categories: [], created: '2026-04-29',
  }));
});

test('parsePageMeta: rejects missing title', () => {
  assert.throws(() => parsePageMeta({
    owner: 'a', editors: [], type: 'person', aliases: [], categories: [], created: '2026-04-29',
  }));
});

test('parsePageMeta: rejects bad date format', () => {
  assert.throws(() => parsePageMeta({
    title: 'X', owner: 'a', editors: [], type: 'person', aliases: [], categories: [], created: '2026/04/29',
  }));
});

test('parsePageMeta defaults missing schemaVersion to CURRENT_SCHEMA_VERSION', () => {
  const out = parsePageMeta({
    title: 'Test',
    owner: 'me',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-05-01',
  });
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('parsePageMeta accepts an explicit schemaVersion', () => {
  const out = parsePageMeta({
    schemaVersion: 1,
    title: 'Test',
    owner: 'me',
    editors: [],
    type: 'person',
    aliases: [],
    categories: [],
    created: '2026-05-01',
  });
  assert.equal(out.schemaVersion, 1);
});

test('parsePageMeta rejects non-integer schemaVersion', () => {
  assert.throws(() =>
    parsePageMeta({
      schemaVersion: 1.5,
      title: 'Test',
      owner: 'me',
      editors: [],
      type: 'person',
      aliases: [],
      categories: [],
      created: '2026-05-01',
    }),
  );
});

const MINIMAL_VALID = {
  schemaVersion: 1,
  title: 'Test',
  owner: 'steven',
  editors: [],
  type: 'person' as const,
  aliases: [],
  categories: [],
  created: '2026-05-07',
};

test('parsePageMeta: corrections field defaults to empty array when absent', () => {
  const meta = parsePageMeta(MINIMAL_VALID);
  assert.deepEqual(meta.corrections, []);
});

test('parsePageMeta: accepts a single valid correction', () => {
  const meta = parsePageMeta({
    ...MINIMAL_VALID,
    corrections: [
      { field: 'death.date', value: '1989', source: 'Find A Grave #209496149' },
    ],
  });
  assert.equal(meta.corrections.length, 1);
  assert.equal(meta.corrections[0]!.field, 'death.date');
  assert.equal(meta.corrections[0]!.value, '1989');
  assert.equal(meta.corrections[0]!.source, 'Find A Grave #209496149');
});

test('parsePageMeta: accepts correction with explicit record id', () => {
  const meta = parsePageMeta({
    ...MINIMAL_VALID,
    corrections: [
      { record: 'I372189255251', field: 'death.date', value: '1989', source: 'src' },
    ],
  });
  assert.equal(meta.corrections[0]!.record, 'I372189255251');
});

test('parsePageMeta: rejects correction with invalid record id', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [
        { record: 'not-a-record-id', field: 'death.date', value: '1989', source: 'src' },
      ],
    }),
  );
});

test('parsePageMeta: rejects correction with field not in whitelist', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [
        { field: 'occupation', value: 'farmer', source: 'src' },
      ],
    }),
  );
});

test('parsePageMeta: rejects correction with empty value or source', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [{ field: 'name', value: '', source: 'src' }],
    }),
  );
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: [{ field: 'name', value: 'X', source: '' }],
    }),
  );
});

test('parsePageMeta: corrections is an array — single object rejected', () => {
  assert.throws(() =>
    parsePageMeta({
      ...MINIMAL_VALID,
      corrections: { field: 'name', value: 'X', source: 's' },
    }),
  );
});
