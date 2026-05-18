import { test } from "node:test";
import assert from "node:assert/strict";
import { routing, LOCALE_DIR } from "../i18n/routing.ts";

test("routing: locales contain en, ru, uk, he", () => {
  assert.deepEqual([...routing.locales].sort(), ["en", "he", "ru", "uk"]);
});

test("routing: defaultLocale is en", () => {
  assert.equal(routing.defaultLocale, "en");
});

test("routing: localePrefix is always", () => {
  assert.equal(routing.localePrefix, "always");
});

test("LOCALE_DIR: he is rtl, others are ltr", () => {
  assert.equal(LOCALE_DIR.he, "rtl");
  assert.equal(LOCALE_DIR.en, "ltr");
  assert.equal(LOCALE_DIR.ru, "ltr");
  assert.equal(LOCALE_DIR.uk, "ltr");
});
