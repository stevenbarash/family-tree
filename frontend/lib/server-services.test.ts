import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MigrateReport } from '@core/pages/migrate-runner.ts';
import { createPageStore } from '@core/pages/index.ts';

import { orchestrateMigrate, readTalkBodyWithStore } from './server-services';

test('orchestrateMigrate calls rebuildSearchIndex when migrated.length > 0', async () => {
  let rebuilds = 0;
  const fakeRunner = async (): Promise<MigrateReport> => ({
    walked: 1,
    migrated: [{ slug: 'p', from: 1, to: 2 }],
    skipped: [],
    failed: [],
  });
  const fakeRebuild = async () => { rebuilds++; };
  const report = await orchestrateMigrate(
    { repoRoot: '/', pagesDir: '/p' },
    fakeRunner,
    fakeRebuild,
  );
  assert.equal(rebuilds, 1);
  assert.equal(report.migrated.length, 1);
});

test('orchestrateMigrate does not rebuild when zero pages migrated', async () => {
  let rebuilds = 0;
  const fakeRunner = async (): Promise<MigrateReport> => ({
    walked: 0, migrated: [], skipped: [], failed: [],
  });
  await orchestrateMigrate({ repoRoot: '/', pagesDir: '/p' }, fakeRunner, async () => { rebuilds++; });
  assert.equal(rebuilds, 0);
});

test('orchestrateMigrate does not rebuild on dryRun even with migrated entries', async () => {
  let rebuilds = 0;
  const fakeRunner = async (): Promise<MigrateReport> => ({
    walked: 1,
    migrated: [{ slug: 'p', from: 1, to: 2 }],
    skipped: [],
    failed: [],
  });
  await orchestrateMigrate(
    { repoRoot: '/', pagesDir: '/p', dryRun: true },
    fakeRunner,
    async () => { rebuilds++; },
  );
  assert.equal(rebuilds, 0);
});

// ─── readTalkBody locale-awareness (B.3 / P2.15) ────────────────────

const TALK_FRONTMATTER = (title: string) => `---
schemaVersion: 1
title: "${title}"
author: test
type: meta
aliases: []
categories: []
created: '2026-05-19'
---

`;

async function setupTalkFixtures(root: string): Promise<void> {
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await mkdir(join(root, 'pages', 'ru'), { recursive: true });
  // EN canonical exists for both slugs
  await writeFile(
    join(root, 'pages', 'en', 'has-ru.talk.md'),
    `${TALK_FRONTMATTER('Talk: Has Ru')}EN talk body — has-ru\n`,
  );
  await writeFile(
    join(root, 'pages', 'en', 'no-ru.talk.md'),
    `${TALK_FRONTMATTER('Talk: No Ru')}EN talk body — no-ru\n`,
  );
  // Only `has-ru` has a ru translation
  await writeFile(
    join(root, 'pages', 'ru', 'has-ru.talk.md'),
    `${TALK_FRONTMATTER('Обсуждение: Has Ru')}RU talk body — has-ru\n`,
  );
}

test('readTalkBody: locale="en" reads EN canonical', async () => {
  const root = join(tmpdir(), `whoami-readtalk-en-${Date.now()}`);
  await setupTalkFixtures(root);
  const store = createPageStore({ repoRoot: root, pagesDir: join(root, 'pages', 'en') });
  const body = await readTalkBodyWithStore(store, 'has-ru.talk', 'en');
  assert.match(body, /EN talk body — has-ru/);
  await rm(root, { recursive: true });
});

test('readTalkBody: localized exists → reads localized body', async () => {
  const root = join(tmpdir(), `whoami-readtalk-loc-${Date.now()}`);
  await setupTalkFixtures(root);
  const store = createPageStore({ repoRoot: root, pagesDir: join(root, 'pages', 'en') });
  const body = await readTalkBodyWithStore(store, 'has-ru.talk', 'ru');
  assert.match(body, /RU talk body — has-ru/);
  assert.doesNotMatch(body, /EN talk body/);
  await rm(root, { recursive: true });
});

test('readTalkBody: localized missing → falls back to EN canonical', async () => {
  const root = join(tmpdir(), `whoami-readtalk-fallback-${Date.now()}`);
  await setupTalkFixtures(root);
  const store = createPageStore({ repoRoot: root, pagesDir: join(root, 'pages', 'en') });
  const body = await readTalkBodyWithStore(store, 'no-ru.talk', 'ru');
  assert.match(body, /EN talk body — no-ru/);
  await rm(root, { recursive: true });
});

test('readTalkBody: neither localized nor EN exists → returns ""', async () => {
  const root = join(tmpdir(), `whoami-readtalk-empty-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  const store = createPageStore({ repoRoot: root, pagesDir: join(root, 'pages', 'en') });
  const body = await readTalkBodyWithStore(store, 'nonexistent.talk', 'ru');
  assert.equal(body, '');
  await rm(root, { recursive: true });
});
