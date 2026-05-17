import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranslationTalk } from "../../src/i18n/translation-talk.ts";

test("parseTranslationTalk: empty body returns zero counts", () => {
  const result = parseTranslationTalk("");
  assert.equal(result.unresolved, 0);
  assert.equal(result.resolved, 0);
  assert.deepEqual(result.entries, []);
});

test("parseTranslationTalk: counts unresolved [ ] entries in ## Unresolved", () => {
  const body = `
# Translation notes

## Unresolved

- [ ] **[name-transliteration]** Translated "Abby" as "Эбби".
- [ ] **[idiom]** "knack for languages" — chose colloquial form.

## Resolved

- [x] **[place-name]** "Brooklyn" as "Бруклин". *Resolved 2026-05-17.*
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 2);
  assert.equal(result.resolved, 1);
});

test("parseTranslationTalk: parses entry kind tags", () => {
  const body = `
## Unresolved

- [ ] **[name-transliteration]** A note.
- [ ] **[idiom]** Another.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.entries.length, 2);
  const e0 = result.entries[0];
  const e1 = result.entries[1];
  assert.ok(e0, "entry 0 exists");
  assert.ok(e1, "entry 1 exists");
  assert.equal(e0.kind, "name-transliteration");
  assert.equal(e0.resolved, false);
  assert.equal(e1.kind, "idiom");
});

test("parseTranslationTalk: entries outside sections are ignored", () => {
  const body = `
- [ ] **[other]** Should be ignored (outside sections).

## Unresolved

- [ ] **[name]** Counted.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 1);
});

test("parseTranslationTalk: malformed entries (no kind tag) are skipped", () => {
  const body = `
## Unresolved

- [ ] No kind tag here.
- [ ] **[valid]** Kind tagged.
`;
  const result = parseTranslationTalk(body);
  assert.equal(result.unresolved, 1);
  const e0 = result.entries[0];
  assert.ok(e0, "entry 0 exists");
  assert.equal(e0.kind, "valid");
});
