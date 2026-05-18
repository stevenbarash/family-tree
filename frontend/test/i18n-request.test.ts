import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("i18n/request.ts exists and is the configured path", () => {
  assert.ok(existsSync(join(__dirname, "..", "i18n", "request.ts")));
});
