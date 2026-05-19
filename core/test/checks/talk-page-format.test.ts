import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTalkPageFormat } from '../../src/checks/talk-page-format.ts';
import type { LoadedPage, RepoState } from '../../src/checks/types.ts';

function loadedPage(slug: string, text: string, locale: 'en' | 'ru' | 'uk' | 'he' = 'en'): LoadedPage {
  return { slug, path: `/fake/pages/${locale}/${slug}.md`, meta: {} as any, body: text, text };
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

function fm(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    schemaVersion: '1',
    title: '"Talk: Asya Goltsman"',
    author: 'Claude Opus 4.7',
    type: 'meta',
    aliases: '[]',
    categories: '[]',
    created: '2026-05-16',
  };
  const merged = { ...defaults, ...overrides };
  const order = ['schemaVersion', 'title', 'author', 'type', 'aliases', 'categories', 'created'];
  const lines = ['---'];
  for (const k of order) {
    if (merged[k] === undefined) continue;
    lines.push(`${k}: ${merged[k]}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

test('canonical talk page → no findings', () => {
  const text = fm() + '\n## Research notes\n\n### 2026-05-16\n- a captured fact\n';
  assert.deepEqual(detectTalkPageFormat(state([loadedPage('foo.talk', text)])), []);
});

test('non-talk page is ignored entirely', () => {
  const text = '---\ntitle: Foo\n---\n\nbody';
  assert.deepEqual(detectTalkPageFormat(state([loadedPage('foo', text)])), []);
});

test('missing schemaVersion → finding + insertion fix', () => {
  // Build a frontmatter without schemaVersion.
  const text = [
    '---',
    'title: "Talk: Foo"',
    'author: x',
    'type: meta',
    'aliases: []',
    'categories: []',
    'created: 2026-05-16',
    '---',
    '',
  ].join('\n');
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const sv = findings.find(f => f.message.includes('schemaVersion'));
  assert.ok(sv);
  assert.equal(sv.category, 'schema');
  assert.equal(sv.severity, 'warn');
  assert.equal(sv.fix?.lineNumber, 1);
  assert.equal(sv.fix?.oldLine, '---');
  assert.equal(sv.fix?.newLine, '---\nschemaVersion: 1');
});

test('title without "Talk:" prefix → finding + replace fix', () => {
  const text = fm({ title: 'Asya Goltsman' });
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const title = findings.find(f => f.message.includes('title missing'));
  assert.ok(title);
  assert.equal(title.category, 'format');
  assert.equal(title.severity, 'info');
  assert.equal(title.fix?.newLine, 'title: "Talk: Asya Goltsman"');
});

test('title with "Talk:" prefix but unquoted is left alone', () => {
  // We accept both quoted and unquoted as long as the prefix is present.
  // Actually — the rule is "Talk: <Subject>" prefix; quoting is just YAML.
  // An unquoted "Talk: Foo" parses identically. Don't churn it.
  const text = fm({ title: 'Talk: Foo' });
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  assert.equal(findings.filter(f => f.message.includes('title')).length, 0);
});

test('type: person → finding + replace fix', () => {
  const text = fm({ type: 'person' });
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const type = findings.find(f => f.message.includes('type is "person"'));
  assert.ok(type);
  assert.equal(type.category, 'schema');
  assert.equal(type.severity, 'warn');
  assert.equal(type.fix?.newLine, 'type: meta');
});

test('::open thread present but categories empty → add tag', () => {
  const text = fm({ categories: '[]' }) + '\n## Some open question\n::open\n\nbody\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('categories'));
  assert.ok(cat);
  assert.equal(cat.fix?.newLine, 'categories: [Open editorial questions]');
});

test('no ::open threads but tag present → remove tag', () => {
  const text = fm({ categories: '[Open editorial questions]' }) + '\n## Research notes\n\nno threads here\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('categories'));
  assert.ok(cat);
  assert.equal(cat.fix?.newLine, 'categories: []');
});

test('duplicate "Open editorial questions" entries → dedupe via fix', () => {
  const text = fm({ categories: '[Open editorial questions, Open editorial questions]' }) +
    '\n## Some open question\n::open\n\nbody\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('categories'));
  assert.ok(cat);
  assert.equal(cat.fix?.newLine, 'categories: [Open editorial questions]');
});

test('extra non-editorial categories preserved when adding tag', () => {
  const text = fm({ categories: '[Templates, Translation]' }) +
    '\n## Some open question\n::open\n\nbody\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('categories'));
  assert.ok(cat);
  assert.equal(cat.fix?.newLine, 'categories: [Templates, Translation, Open editorial questions]');
});

test('extra non-editorial categories preserved when removing tag', () => {
  const text = fm({ categories: '[Templates, Open editorial questions, Translation]' }) +
    '\n## Research notes\n\nno threads\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('categories'));
  assert.ok(cat);
  assert.equal(cat.fix?.newLine, 'categories: [Templates, Translation]');
});

test('missing categories field → insertion fix after aliases', () => {
  // categories: undefined removes the line entirely
  const text = fm({ categories: undefined }) +
    '\n## Some open question\n::open\n\nbody\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const cat = findings.find(f => f.message.includes('missing `categories'));
  assert.ok(cat);
  assert.match(cat.fix!.oldLine, /^aliases: /);
  assert.equal(cat.fix?.newLine, 'aliases: []\ncategories: [Open editorial questions]');
});

test('section ordering: Research notes → Drafting plan → Agent log is fine', () => {
  const text = fm() +
    '\n## Research notes\n\nfacts\n\n## Drafting plan\n\nplan\n\n## Agent log\n\nlog\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  assert.equal(findings.filter(f => f.message.includes('sections out of order')).length, 0);
});

test('section ordering: Drafting plan before Research notes → finding (no fix)', () => {
  const text = fm() +
    '\n## Drafting plan\n\nplan\n\n## Research notes\n\nfacts\n\n## Agent log\n\nlog\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  const order = findings.find(f => f.message.includes('sections out of order'));
  assert.ok(order);
  assert.equal(order.severity, 'warn');
  assert.equal(order.fix, undefined);
  assert.match(order.message, /Drafting plan → Research notes → Agent log/);
  assert.match(order.message, /expected Research notes → Drafting plan → Agent log/);
});

test('only one canonical section present → no ordering finding', () => {
  const text = fm() + '\n## Agent log\n\nlog\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  assert.equal(findings.filter(f => f.message.includes('sections out of order')).length, 0);
});

test('bespoke thread-container ## headings ignored by ordering check', () => {
  // aidele.talk.md style: top-level ## headings are themselves threads,
  // not the canonical sections. The order rule should not fire.
  const text = fm({ categories: '[Open editorial questions]' }) +
    '\n## Birth year 1881 vs 1887\n::open\n\nbody\n\n' +
    '## Father Abram unknown\n::open\n\nbody\n';
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  assert.equal(findings.filter(f => f.message.includes('sections out of order')).length, 0);
});

test('file without frontmatter → no findings (other detectors handle that)', () => {
  const text = '## Some content\n\nbody\n';
  assert.deepEqual(detectTalkPageFormat(state([loadedPage('foo.talk', text)])), []);
});

test('translated talk page (non-EN path) is skipped entirely', () => {
  // A localized talk page can carry localized "Talk:" prefix ("Обсуждение:")
  // and translation-stamp frontmatter the EN spec doesn't describe. The
  // detector should not flag any of it.
  const text = [
    '---',
    'title: "Обсуждение: Авраам Гарольд Франкель"',
    'author: Claude Opus 4.7',
    'type: meta',
    'lang: ru',
    'translation_of: abraham-harold-frankel',
    'canonical_sha: abc123',
    'translated_at: 2026-05-18',
    '---',
    '',
    '## Some open question',
    '::open',
    '',
    'body',
  ].join('\n');
  assert.deepEqual(detectTalkPageFormat(state([loadedPage('abraham-harold-frankel.talk', text, 'ru')])), []);
});

test('legacy top-level pages/<slug>.talk.md path is still checked', () => {
  // load.ts walks both per-locale and legacy top-level paths; both are EN.
  const page: LoadedPage = {
    slug: 'foo.talk',
    path: '/fake/pages/foo.talk.md',
    meta: {} as any,
    body: '',
    text: fm({ type: 'person' }),
  };
  const findings = detectTalkPageFormat(state([page]));
  assert.ok(findings.some(f => f.message.includes('type is "person"')));
});

test('multiple findings on one file all coexist', () => {
  // missing schemaVersion + type: person + categories drift
  const text = [
    '---',
    'title: Foo',
    'author: x',
    'type: person',
    'aliases: []',
    'categories: []',
    'created: 2026-05-16',
    '---',
    '',
    '## Some open question',
    '::open',
    '',
    'body',
  ].join('\n');
  const findings = detectTalkPageFormat(state([loadedPage('foo.talk', text)]));
  // Expect: missing schemaVersion + title-missing-prefix + type-person + categories-needs-tag
  assert.equal(findings.length, 4);
});
