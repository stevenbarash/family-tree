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
