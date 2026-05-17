import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTranslationStatus } from "../../src/i18n/status.ts";

test("computeTranslationStatus: missing when no translation file", () => {
  const status = computeTranslationStatus({ translationCanonicalSha: undefined, canonicalHeadSha: "abc123", unresolvedTalkEntries: 0 });
  assert.equal(status, "missing");
});

test("computeTranslationStatus: stale when canonical_sha differs from HEAD", () => {
  const status = computeTranslationStatus({ translationCanonicalSha: "old456", canonicalHeadSha: "new789", unresolvedTalkEntries: 0 });
  assert.equal(status, "stale");
});

test("computeTranslationStatus: review when sha matches but talk has unresolved", () => {
  const status = computeTranslationStatus({ translationCanonicalSha: "abc123", canonicalHeadSha: "abc123", unresolvedTalkEntries: 3 });
  assert.equal(status, "review");
});

test("computeTranslationStatus: current when sha matches and talk is clean", () => {
  const status = computeTranslationStatus({ translationCanonicalSha: "abc123", canonicalHeadSha: "abc123", unresolvedTalkEntries: 0 });
  assert.equal(status, "current");
});

test("computeTranslationStatus: stale beats review when both apply", () => {
  const status = computeTranslationStatus({ translationCanonicalSha: "old456", canonicalHeadSha: "new789", unresolvedTalkEntries: 5 });
  assert.equal(status, "stale");
});
