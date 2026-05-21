import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runI18nSync, type Translator, type TalkTranslator } from '../src/commands/i18n-sync.js';

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

test('wai i18n sync: injects author from WAI_AUTHOR_MODEL into both files', async () => {
  const root = join(tmpdir(), `whoami-i18n-author-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    "---\nschemaVersion: 1\ntitle: Abby\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nEnglish body",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  const prev = process.env.WAI_AUTHOR_MODEL;
  process.env.WAI_AUTHOR_MODEL = 'Claude Sonnet 99.9';
  try {
    let stdout = '';
    await runI18nSync({
      rootDir: root,
      slug: 'abby',
      locale: 'ru',
      translator: stubTranslator,
      write: (s) => { stdout += s; },
    });

    const translation = await readFile(join(root, 'pages', 'ru', 'abby.md'), 'utf8');
    assert.match(translation, /^author: Claude Sonnet 99\.9$/m);
    assert.doesNotMatch(translation, /^owner:/m);
    assert.doesNotMatch(translation, /^editors:/m);

    const talk = await readFile(join(root, 'pages', 'ru', 'abby.translation.talk.md'), 'utf8');
    assert.match(talk, /^author: Claude Sonnet 99\.9$/m);
  } finally {
    if (prev === undefined) delete process.env.WAI_AUTHOR_MODEL;
    else process.env.WAI_AUTHOR_MODEL = prev;
    await rm(root, { recursive: true });
  }
});

test('wai i18n sync: defaults author to Claude Opus 4.7 when env var unset', async () => {
  const root = join(tmpdir(), `whoami-i18n-author-default-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    "---\nschemaVersion: 1\ntitle: Abby\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nEnglish body",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  const prev = process.env.WAI_AUTHOR_MODEL;
  delete process.env.WAI_AUTHOR_MODEL;
  try {
    let stdout = '';
    await runI18nSync({
      rootDir: root,
      slug: 'abby',
      locale: 'uk',
      translator: stubTranslator,
      write: (s) => { stdout += s; },
    });
    const translation = await readFile(join(root, 'pages', 'uk', 'abby.md'), 'utf8');
    assert.match(translation, /^author: Claude Opus 4\.7$/m);
  } finally {
    if (prev !== undefined) process.env.WAI_AUTHOR_MODEL = prev;
    await rm(root, { recursive: true });
  }
});

test('wai i18n sync: passes NAME.TRAN from derived YAML to translator as nameTranslation', async () => {
  const root = join(tmpdir(), `whoami-i18n-tran-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await mkdir(join(root, 'genealogy', 'derived'), { recursive: true });
  // Canonical EN page linked to a GEDCOM record
  await writeFile(
    join(root, 'pages', 'en', 'sasha.md'),
    "---\nschemaVersion: 1\ntitle: Sasha\ntype: person\naliases: []\ncategories: []\ngedcom:\n  file: x.ged\n  record: I999\n  snapshot: abc\ncreated: '2026-05-01'\ncorrections: []\n---\nBody.",
  );
  // Derived YAML with nameTranslations block
  await writeFile(
    join(root, 'genealogy', 'derived', 'I999.yml'),
    "record: I999\nname: Sasha\nsex: M\nnameTranslations:\n  ru: Саша\n  uk: Сашко\n  he: סשה\n",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  // Capture what the translator gets called with
  let receivedNameTranslation: string | undefined;
  const captureTranslator = async (req: { nameTranslation?: string; locale: string }) => {
    receivedNameTranslation = req.nameTranslation;
    return { body: 'translated body', talk: '## Unresolved\n\n## Resolved\n', titleTranslation: req.nameTranslation ?? 'fallback' };
  };

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'sasha',
    locale: 'ru',
    translator: captureTranslator as Parameters<typeof runI18nSync>[0]['translator'],
    write: (s) => { stdout += s; },
  });

  assert.equal(receivedNameTranslation, 'Саша');
  // The translation file's title should be the NAME.TRAN value
  const translation = await readFile(join(root, 'pages', 'ru', 'sasha.md'), 'utf8');
  assert.match(translation, /^title: Саша$/m);

  await rm(root, { recursive: true });
});

test('wai i18n sync: omits nameTranslation when derived YAML has no nameTranslations block', async () => {
  const root = join(tmpdir(), `whoami-i18n-notran-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await mkdir(join(root, 'genealogy', 'derived'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'sasha.md'),
    "---\nschemaVersion: 1\ntitle: Sasha\ntype: person\naliases: []\ncategories: []\ngedcom:\n  file: x.ged\n  record: I999\n  snapshot: abc\ncreated: '2026-05-01'\ncorrections: []\n---\nBody.",
  );
  // Derived YAML without nameTranslations
  await writeFile(
    join(root, 'genealogy', 'derived', 'I999.yml'),
    "record: I999\nname: Sasha\nsex: M\n",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  let receivedNameTranslation: string | undefined = 'should-be-overwritten';
  const captureTranslator = async (req: { nameTranslation?: string; locale: string }) => {
    receivedNameTranslation = req.nameTranslation;
    return { body: 'b', talk: '## Unresolved\n\n## Resolved\n', titleTranslation: 'T' };
  };

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: 'sasha',
    locale: 'ru',
    translator: captureTranslator as Parameters<typeof runI18nSync>[0]['translator'],
    write: (s) => { stdout += s; },
  });

  assert.equal(receivedNameTranslation, undefined);
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

test('wai i18n sync: refuses an invalid / path-traversal slug', async () => {
  // runI18nSync interpolates the slug into a filesystem path and a git
  // command. A slug with a slash, `..`, or shell metacharacters must be
  // rejected at the function boundary — it is the documented agent
  // contract and an exported library function with no other guard.
  const root = join(tmpdir(), `whoami-i18n-badslug-${Date.now()}`);
  await mkdir(root, { recursive: true });

  let stdout = '';
  await runI18nSync({
    rootDir: root,
    slug: '../../etc/passwd',
    locale: 'ru',
    translator: stubTranslator,
    write: (s) => { stdout += s; },
  });
  assert.match(stdout, /invalid slug/);

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

// ─── Talk-page translation (Phase B.1) ──────────────────────────────

const stubTalkTranslator: TalkTranslator = async (req) => ({
  body: req.canonicalTalkBody,
  titlePrefix: 'Talk',
  auditEntries: `- [ ] **[stub]** Stub talk translator used for ${req.locale}.`,
});

async function setupArticleAndTalk(root: string, slug: string, talkBody: string): Promise<void> {
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', `${slug}.md`),
    `---\nschemaVersion: 1\ntitle: ${slug}\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nEN article body`,
  );
  await writeFile(
    join(root, 'pages', 'en', `${slug}.talk.md`),
    `---\nschemaVersion: 1\ntitle: "Talk: ${slug}"\nauthor: Claude Opus 4.7\ntype: meta\naliases: []\ncategories: []\ncreated: '2026-05-01'\n---\n\n${talkBody}`,
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );
}

test('wai i18n sync: writes translated talk page when EN talk exists + talkTranslator provided', async () => {
  const root = join(tmpdir(), `whoami-i18n-talk-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby', '## Research notes\n\nA captured fact.\n');

  let stdout = '';
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    write: (s) => { stdout += s; },
  });

  const talkPath = join(root, 'pages', 'ru', 'abby.talk.md');
  const content = await readFile(talkPath, 'utf8');
  // Format-spec-compliant frontmatter
  assert.match(content, /^schemaVersion: 1$/m);
  assert.match(content, /^type: meta$/m);
  assert.match(content, /^aliases: \[\]$/m);
  assert.match(content, /^categories: \[\]$/m); // no ::open threads in the fixture
  // Localized "Talk:" + article-translated subject
  assert.match(content, /^title: "Talk: \[ru\] abby"$/m);
  // Translation-stamp fields
  assert.match(content, /^lang: ru$/m);
  assert.match(content, /^translation_of: abby$/m);
  assert.match(content, /^canonical_sha: [a-f0-9]+$/m);
  assert.match(content, /^translated_at: '\d{4}-\d{2}-\d{2}'$/m);
  // Body echoed from EN talk
  assert.match(content, /A captured fact/);
  // Status message
  assert.match(stdout, /wrote pages\/ru\/abby\.talk\.md/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: categories: [Open editorial questions] when translated talk has ::open threads', async () => {
  const root = join(tmpdir(), `whoami-i18n-talk-open-${Date.now()}`);
  await setupArticleAndTalk(
    root,
    'abby',
    '## Some open question\n::open\n\nthe body of the open thread\n',
  );

  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    write: () => {},
  });

  const content = await readFile(join(root, 'pages', 'ru', 'abby.talk.md'), 'utf8');
  assert.match(content, /^categories: \[Open editorial questions\]$/m);

  await rm(root, { recursive: true });
});

test('wai i18n sync: skips talk-page translation when includeTalk: false (mirrors --no-talk)', async () => {
  const root = join(tmpdir(), `whoami-i18n-no-talk-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby', '## Research notes\n\nA fact.\n');

  let stdout = '';
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    includeTalk: false,
    write: (s) => { stdout += s; },
  });

  // The article + translation.talk.md still get written
  await readFile(join(root, 'pages', 'ru', 'abby.md'), 'utf8');
  await readFile(join(root, 'pages', 'ru', 'abby.translation.talk.md'), 'utf8');
  // But the localized talk page does NOT
  await assert.rejects(
    () => readFile(join(root, 'pages', 'ru', 'abby.talk.md'), 'utf8'),
    /ENOENT/,
  );
  assert.doesNotMatch(stdout, /wrote pages\/ru\/abby\.talk\.md/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: skips talk-page translation when EN talk does not exist (silent)', async () => {
  const root = join(tmpdir(), `whoami-i18n-no-en-talk-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    `---\nschemaVersion: 1\ntitle: abby\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nbody`,
  );
  execSync(`git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`);

  let stdout = '';
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    write: (s) => { stdout += s; },
  });

  await assert.rejects(() => readFile(join(root, 'pages', 'ru', 'abby.talk.md'), 'utf8'), /ENOENT/);
  // Article still translated
  await readFile(join(root, 'pages', 'ru', 'abby.md'), 'utf8');

  await rm(root, { recursive: true });
});

test('wai i18n sync: skips talk-page translation when talkTranslator not provided', async () => {
  // Mirror the agent-translator path in Phase B.1 where the real talk
  // translator doesn't exist yet — the orchestrator must NOT write a
  // half-translated talk file silently.
  const root = join(tmpdir(), `whoami-i18n-no-talk-translator-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby', '## Research notes\n\nA fact.\n');

  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    // talkTranslator: undefined
    write: () => {},
  });

  await assert.rejects(() => readFile(join(root, 'pages', 'ru', 'abby.talk.md'), 'utf8'), /ENOENT/);

  await rm(root, { recursive: true });
});

test('wai i18n sync: passes slug + article-title translation to talkTranslator', async () => {
  const root = join(tmpdir(), `whoami-i18n-talk-context-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby-rickelman', '## Research notes\n\nA fact.\n');

  let captured: { slug?: string; articleTitleTranslation?: string; canonicalTalkBody?: string } = {};
  const captureTalkTranslator: TalkTranslator = async (req) => {
    captured = {
      slug: req.slug,
      articleTitleTranslation: req.articleTitleTranslation,
      canonicalTalkBody: req.canonicalTalkBody,
    };
    return { body: req.canonicalTalkBody, titlePrefix: 'Talk', auditEntries: '' };
  };

  await runI18nSync({
    rootDir: root, slug: 'abby-rickelman', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: captureTalkTranslator,
    write: () => {},
  });

  assert.equal(captured.slug, 'abby-rickelman');
  // Stub translator titleTranslation: `[ru] ${title}`; orchestrator strips surrounding quotes
  assert.equal(captured.articleTitleTranslation, '[ru] abby-rickelman');
  assert.match(captured.canonicalTalkBody!, /A fact\./);

  await rm(root, { recursive: true });
});

async function setupForTalkOnly(root: string, slug: string, talkBody: string): Promise<void> {
  // EN canonical (article + talk) + already-translated ru article + audit.
  await setupArticleAndTalk(root, slug, talkBody);
  await mkdir(join(root, 'pages', 'ru'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'ru', `${slug}.md`),
    `---\nschemaVersion: 1\ntitle: "[ru] ${slug}"\nauthor: Claude Opus 4.7\nlang: ru\ntranslation_of: ${slug}\ncanonical_sha: abc\ntranslated_at: '2026-05-18'\n---\nPrior translated article body\n`,
  );
  await writeFile(
    join(root, 'pages', 'ru', `${slug}.translation.talk.md`),
    `---\ntype: translation-talk\nauthor: Claude Opus 4.7\ntranslation_of: ${slug}\nlang: ru\ncanonical_sha_when_logged: abc\nsynced_at: '2026-05-18'\n---\n\n# Translation notes — ru (Prior)\n\n## Unresolved\n\n- [ ] **[idiom]** Canonical: ...prior article-translation entry...\n\n## Resolved\n`,
  );
}

test('wai i18n sync --talk-only: writes only the talk page, leaves article translation untouched', async () => {
  const root = join(tmpdir(), `whoami-talk-only-basic-${Date.now()}`);
  await setupForTalkOnly(root, 'abby', '## Research notes\n\nA fact.\n');

  // Snapshot article translation before the run to assert non-mutation.
  const articleBefore = await readFile(join(root, 'pages', 'ru', 'abby.md'), 'utf8');

  let stdout = '';
  let articleTranslatorCalled = false;
  const articleTranslator: Translator = async (req) => {
    articleTranslatorCalled = true;
    return { body: req.canonicalBody, talk: '## Unresolved\n\n## Resolved\n', titleTranslation: 'should-not-be-used' };
  };
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: articleTranslator,
    talkTranslator: stubTalkTranslator,
    talkOnly: true,
    write: (s) => { stdout += s; },
  });

  // Article translator was NOT called
  assert.equal(articleTranslatorCalled, false);
  // Article translation file unchanged
  const articleAfter = await readFile(join(root, 'pages', 'ru', 'abby.md'), 'utf8');
  assert.equal(articleAfter, articleBefore);
  // Talk page WAS written
  const talkPath = join(root, 'pages', 'ru', 'abby.talk.md');
  const talk = await readFile(talkPath, 'utf8');
  assert.match(talk, /^title: "Talk: \[ru\] abby"$/m);
  assert.match(stdout, /wrote pages\/ru\/abby\.talk\.md/);
  assert.match(stdout, /talk-only/);

  await rm(root, { recursive: true });
});

test('wai i18n sync --talk-only: refuses when article translation missing', async () => {
  const root = join(tmpdir(), `whoami-talk-only-noart-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby', '## Research notes\n\nA fact.\n');
  // Note: did NOT create pages/ru/abby.md

  let stdout = '';
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    talkOnly: true,
    write: (s) => { stdout += s; },
  });

  assert.match(stdout, /--talk-only refuses/);
  await assert.rejects(() => readFile(join(root, 'pages', 'ru', 'abby.talk.md'), 'utf8'), /ENOENT/);

  await rm(root, { recursive: true });
});

test('wai i18n sync --talk-only: replaces prior ### Talk-page translation subsection (no duplicates)', async () => {
  const root = join(tmpdir(), `whoami-talk-only-replace-${Date.now()}`);
  await setupForTalkOnly(root, 'abby', '## Some open question\n::open\n\nbody\n');

  // Manually seed the audit file with a prior talk-page subsection (simulating
  // a second --talk-only run after an earlier one).
  await writeFile(
    join(root, 'pages', 'ru', 'abby.translation.talk.md'),
    [
      `---`,
      `type: translation-talk`,
      `author: Claude Opus 4.7`,
      `translation_of: abby`,
      `lang: ru`,
      `canonical_sha_when_logged: abc`,
      `synced_at: '2026-05-18'`,
      `---`,
      ``,
      `# Translation notes — ru (Prior)`,
      ``,
      `## Unresolved`,
      ``,
      `- [ ] **[idiom]** Prior article entry`,
      ``,
      `### Talk-page translation`,
      ``,
      `- [ ] **[stale]** This was from the previous --talk-only run and should be replaced`,
      ``,
      `## Resolved`,
      ``,
    ].join('\n'),
  );

  const richTalkTranslator: TalkTranslator = async () => ({
    body: '## Open thread\n::open\n\nbody\n',
    titlePrefix: 'Talk',
    auditEntries: '- [ ] **[fresh]** Newly produced entry',
  });
  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator, talkTranslator: richTalkTranslator,
    talkOnly: true, write: () => {},
  });

  const audit = await readFile(join(root, 'pages', 'ru', 'abby.translation.talk.md'), 'utf8');
  // Prior article-translation entry preserved
  assert.match(audit, /Prior article entry/);
  // Fresh entry present
  assert.match(audit, /Newly produced entry/);
  // Stale prior talk-page entry REMOVED (no duplicates)
  assert.doesNotMatch(audit, /from the previous --talk-only run/);
  // Only ONE "### Talk-page translation" heading
  const headings = audit.match(/^### Talk-page translation/gm) ?? [];
  assert.equal(headings.length, 1);

  await rm(root, { recursive: true });
});

test('wai i18n sync: folds talk-page audit entries inside ## Unresolved (before ## Resolved)', async () => {
  const root = join(tmpdir(), `whoami-i18n-audit-fold-${Date.now()}`);
  await setupArticleAndTalk(root, 'abby', '## Research notes\n\nA fact.\n');

  await runI18nSync({
    rootDir: root, slug: 'abby', locale: 'ru',
    translator: stubTranslator,
    talkTranslator: stubTalkTranslator,
    write: () => {},
  });

  const auditContent = await readFile(join(root, 'pages', 'ru', 'abby.translation.talk.md'), 'utf8');
  assert.match(auditContent, /## Unresolved/);
  assert.match(auditContent, /### Talk-page translation/);
  assert.match(auditContent, /Stub talk translator used for ru/);
  // Placement check: the ### Talk-page translation heading lives
  // inside the ## Unresolved section, NOT under ## Resolved.
  // Talk-page entries are unresolved decisions awaiting human review;
  // landing them under Resolved would mark them as already-confirmed.
  const unresolvedIdx = auditContent.indexOf('## Unresolved');
  const resolvedIdx = auditContent.indexOf('## Resolved');
  const talkSecIdx = auditContent.indexOf('### Talk-page translation');
  assert.ok(unresolvedIdx >= 0 && resolvedIdx > unresolvedIdx && talkSecIdx > unresolvedIdx);
  assert.ok(talkSecIdx < resolvedIdx, '### Talk-page translation must appear before ## Resolved (inside Unresolved)');

  await rm(root, { recursive: true });
});
