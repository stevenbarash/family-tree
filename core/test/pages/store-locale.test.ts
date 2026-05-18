import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPageStore } from "../../src/pages/store.ts";

const FRONTMATTER_EN = "---\ntitle: Abby\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\n---\nbody";
const FRONTMATTER_RU = "---\ntitle: Эбби\nowner: x\neditors: []\ntype: person\naliases: []\ncategories: []\ncreated: '2026-05-01'\n---\nрусский body";

test("PageStore: reads from pagesDir by default (no locale)", async () => {
  const root = join(tmpdir(), `whoami-store-default-${Date.now()}`);
  const pagesDir = join(root, "pages", "en");
  await mkdir(pagesDir, { recursive: true });
  await writeFile(join(pagesDir, "abby.md"), FRONTMATTER_EN);

  const store = createPageStore({ repoRoot: root, pagesDir });
  const page = await store.read("abby");
  assert.equal(page.meta.title, "Abby");

  await rm(root, { recursive: true });
});

test("PageStore: read(slug, { locale }) reads from pages/{locale}/<slug>.md", async () => {
  const root = join(tmpdir(), `whoami-store-locale-${Date.now()}`);
  const pagesDir = join(root, "pages");
  await mkdir(join(pagesDir, "ru"), { recursive: true });
  await writeFile(join(pagesDir, "ru", "abby.md"), FRONTMATTER_RU);

  const store = createPageStore({ repoRoot: root, pagesDir });
  const page = await store.read("abby", { locale: "ru" });
  assert.equal(page.meta.title, "Эбби");

  await rm(root, { recursive: true });
});
