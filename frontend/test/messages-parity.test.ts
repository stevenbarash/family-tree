import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else {
      out.push(key);
    }
  }
  return out.sort();
}

function loadLocale(locale: string): string[] {
  const raw = readFileSync(join(messagesDir, `${locale}.json`), "utf8");
  return flatten(JSON.parse(raw));
}

test("messages: ru.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const ruKeys = loadLocale("ru");
  assert.deepEqual(ruKeys, enKeys, "ru is missing or has extra keys vs en");
});

test("messages: uk.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const ukKeys = loadLocale("uk");
  assert.deepEqual(ukKeys, enKeys, "uk is missing or has extra keys vs en");
});

test("messages: he.json has the same key shape as en.json", () => {
  const enKeys = loadLocale("en");
  const heKeys = loadLocale("he");
  assert.deepEqual(heKeys, enKeys, "he is missing or has extra keys vs en");
});
