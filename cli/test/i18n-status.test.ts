import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runI18nStatus } from '../src/commands/i18n-status.js';

test('wai i18n status: lists 3 missing entries for one untranslated slug', async () => {
  const root = join(tmpdir(), `whoami-i18n-status-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    "---\nschemaVersion: 1\ntitle: Abby\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nbody",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );

  let stdout = '';
  await runI18nStatus({ rootDir: root, write: (s) => { stdout += s; } });

  assert.match(stdout, /abby\tru\tmissing/);
  assert.match(stdout, /abby\tuk\tmissing/);
  assert.match(stdout, /abby\the\tmissing/);

  await rm(root, { recursive: true });
});

test('wai i18n status: missing pages/en directory prints a friendly message', async () => {
  const root = join(tmpdir(), `whoami-i18n-status-empty-${Date.now()}`);
  await mkdir(root, { recursive: true });

  let stdout = '';
  await runI18nStatus({ rootDir: root, write: (s) => { stdout += s; } });

  assert.match(stdout, /pages\/en\/ not found/);

  await rm(root, { recursive: true });
});

test('wai i18n status: translation file with matching canonical SHA reports current', async () => {
  const root = join(tmpdir(), `whoami-i18n-status-current-${Date.now()}`);
  await mkdir(join(root, 'pages', 'en'), { recursive: true });
  await mkdir(join(root, 'pages', 'ru'), { recursive: true });
  await writeFile(
    join(root, 'pages', 'en', 'abby.md'),
    "---\nschemaVersion: 1\ntitle: Abby\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\n---\nbody",
  );
  execSync(
    `git -C "${root}" init -q && git -C "${root}" add . && git -C "${root}" -c user.email=a@b -c user.name=a commit -q -m init`,
  );
  const canonicalSha = execSync(
    `git -C "${root}" log -1 --format=%H -- pages/en/abby.md`,
    { encoding: 'utf8' },
  ).trim();
  await writeFile(
    join(root, 'pages', 'ru', 'abby.md'),
    `---\nschemaVersion: 1\ntitle: Abby\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\ncorrections: []\nlang: ru\ntranslation_of: abby\ncanonical_sha: ${canonicalSha}\ntranslated_at: '2026-05-02'\n---\nкорпус`,
  );

  let stdout = '';
  await runI18nStatus({ rootDir: root, write: (s) => { stdout += s; } });

  assert.match(stdout, /abby\tru\tcurrent\t0/);
  assert.match(stdout, /abby\tuk\tmissing/);
  assert.match(stdout, /abby\the\tmissing/);

  await rm(root, { recursive: true });
});
