import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("build: produces static HTML for each locale's top-level route", () => {
  const buildDir = join(__dirname, "..", ".next");
  const manifestPath = join(buildDir, "prerender-manifest.json");

  if (!existsSync(manifestPath)) {
    // Skip if build hasn't been run. The test runs after a build in CI; locally
    // run `npm run build` first.
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = Object.keys(manifest.routes ?? {});
  const expected = ["/en", "/ru", "/uk", "/he"];

  for (const locale of expected) {
    assert.ok(
      routes.some(r => r === locale || r === `${locale}/`),
      `expected ${locale} to be prerendered; found ${routes.length} total routes; first 5: ${routes.slice(0, 5).join(", ")}`
    );
  }
});

test("build: at least one article prerendered per locale", () => {
  const buildDir = join(__dirname, "..", ".next");
  const manifestPath = join(buildDir, "prerender-manifest.json");

  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = Object.keys(manifest.routes ?? {});

  for (const locale of ["en", "ru", "uk", "he"]) {
    const articleRoutes = routes.filter(r => r.startsWith(`/${locale}/`) && r.split("/").length === 3);
    assert.ok(
      articleRoutes.length > 100,
      `expected >100 article routes under /${locale}/; got ${articleRoutes.length}`
    );
  }
});
