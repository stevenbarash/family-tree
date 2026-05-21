import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmbeddedFrontmatter } from './embedded-frontmatter.ts';

// Shaped like a `wai author` draft-phase body: the draft-person prompt
// template instructs the agent to emit the page body *with* its own
// frontmatter block. The PUT route otherwise treats the whole string as
// body-only and synthesises a `type: meta` default, stacking two
// frontmatter blocks on the file.
const draftBody = `---
title: Test Person
owner: whoami
editors: []
type: person
aliases: []
categories:
  - People
  - Klaff family
gedcom:
  file: barash-tree.ged
  record: I372304066658
  snapshot: barash-tree
created: 2026-05-21
---

**Test Person** (1910-1984) was born in Baltimore.[^gedcom]
`;

test('extractEmbeddedFrontmatter: lifts an embedded frontmatter block into validated meta', () => {
  const result = extractEmbeddedFrontmatter('test-person', draftBody);
  assert.ok(result, 'expected a non-null result for a body that carries frontmatter');
  assert.equal(result.meta.type, 'person');
  assert.deepEqual(result.meta.categories, ['People', 'Klaff family']);
  assert.equal(result.meta.gedcom?.record, 'I372304066658');
});

test('extractEmbeddedFrontmatter: strips the frontmatter fence from the returned body', () => {
  const result = extractEmbeddedFrontmatter('test-person', draftBody);
  assert.ok(result);
  assert.ok(!result.body.startsWith('---'), 'body must not retain a leading frontmatter fence');
  assert.match(result.body, /^\*\*Test Person\*\*/);
});

test('extractEmbeddedFrontmatter: returns null when the body carries no frontmatter', () => {
  const plain = '**Milton Klaff** (1910-1984) was born in Baltimore.[^gedcom]\n';
  assert.equal(extractEmbeddedFrontmatter('milton-klaff', plain), null);
});
