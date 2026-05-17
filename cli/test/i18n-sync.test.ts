import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runI18nSync, type Translator } from '../src/commands/i18n-sync.js';

const stubTranslator: Translator = async (req) => ({
  body: req.canonicalBody,
  talk: '## Unresolved\n\n- [ ] **[stub]** Stub translator used.\n\n## Resolved\n',
  titleTranslation: `[${req.locale}] ${(req.canonicalMeta as { title: string }).title}`,
});

test('wai i18n sync: writes translation + talk file with correct frontmatter (stub)', async () => {
  const root = join(tmpdir(), `whoami-i18n-sync-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    "---\nschemaVersion: 1\ntitle: Abby\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nEnglish body",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'abby',
    locale: 'ru',
    translator: stubTranslator,
    write: (s) => { stdout += s; },
  });

  const translationPath = join(root, 'pages', 'ru', 'abby.md');
  const content = await readFile(translationPath, 'utf8');
  assert.match(content, /translation_of:\s*abby/);
  assert.match(content, /canonical_sha:\s*[a-f0-9]+/);
  assert.match(content, /translated_at:\s*'?\d{4}-\d{2}-\d{2}/);
  assert.match(content, /English body/);  // stub echoes

  const talkPath = join(root, 'pages', 'ru', 'abby.translation.talk.md');
  const talkContent = await readFile(talkPath, 'utf8');
  assert.match(talkContent, /## Unresolved/);
  assert.match(talkContent, /## Resolved/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: refuses canonical locale (en)', async () => {
  const root = join(tmpdir(), `whoami-i18n-sync-en-${Date.now()}`);
  await mkdir(root, { recursive: true });

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'abby',
    locale: 'en',
    translator: stubTranslator,
    write: (s) => { stdout += s; },
  });
  assert.match(stdout, /cannot sync canonical locale/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: errors on unknown locale', async () => {
  const root = join(tmpdir(), `whoami-i18n-sync-zz-${Date.now()}`);
  await mkdir(root, { recursive: true });

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'abby',
    locale: 'zz',
    translator: stubTranslator,
    write: (s) => { stdout += s; },
  });
  assert.match(stdout, /unknown locale/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: passes related-translation context to translator', async () => {
  const root = join(tmpdir(), `whoami-i18n-related-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await mkdir(join(root, 'pages', 'ru'), { recursive: true });
  // Canonical references three wikilinks; two have existing ru translations.
  await writeFile(
    join(root, 'pages', 'en', 'faina-krasnova.md'),
    "---\nschemaVersion: 1\ntitle: Faina Krasnova\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nFaina was sister of [[Boris Krasnov]] and [[Eduard Krasnov]] and a member of the [[Krasnov family]] line.",
  );
  await writeFile(
    join(root, 'pages', 'en', 'boris-krasnov.md'),
    "---\nschemaVersion: 1\ntitle: Boris Krasnov\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\n",
  );
  await writeFile(
    join(root, 'pages', 'ru', 'boris-krasnov.md'),
    "---\nschemaVersion: 1\ntitle: Борис Краснов\nlang: ru\ntranslation_of: boris-krasnov\ncanonical_sha: abc\ntranslated_at: '2026-05-17'\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\n",
  );
  await writeFile(
    join(root, 'pages', 'en', 'eduard-krasnov.md'),
    "---\nschemaVersion: 1\ntitle: Eduard Krasnov\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\n",
  );
  await writeFile(
    join(root, 'pages', 'ru', 'eduard-krasnov.md'),
    "---\nschemaVersion: 1\ntitle: Эдуард Краснов\nlang: ru\ntranslation_of: eduard-krasnov\ncanonical_sha: abc\ntranslated_at: '2026-05-17'\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\n",
  );
  // [[Krasnov family]] has no ru translation — should be silently skipped.
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  let captured: { relatedTranslations?: unknown } | null = null;
  const captureTranslator: Translator = async (req) => {
    captured = { relatedTranslations: req.relatedTranslations };
    return {
      body: req.canonicalBody,
      talk: '## Unresolved\n\n## Resolved\n',
      titleTranslation: `[${req.locale}] captured`,
    };
  };

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'faina-krasnova',
    locale: 'ru',
    translator: captureTranslator,
    write: (s) => { stdout += s; },
  });

  assert.ok(captured, 'translator should have been called');
  const related = (captured as { relatedTranslations?: { slug: string; enTitle: string; localeTitle: string }[] }).relatedTranslations;
  assert.ok(Array.isArray(related), 'relatedTranslations should be an array');
  assert.equal(related!.length, 2, 'two of three wikilinked slugs have ru translations');
  const slugs = related!.map((r) => r.slug).sort();
  assert.deepEqual(slugs, ['boris-krasnov', 'eduard-krasnov']);
  const boris = related!.find((r) => r.slug === 'boris-krasnov');
  assert.equal(boris?.enTitle, 'Boris Krasnov');
  assert.equal(boris?.localeTitle, 'Борис Краснов');
  assert.match(stdout, /2 related translation/);

  await rm(root, { recursive: true });
});
