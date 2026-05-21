import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCrossRef } from '../src/graders/cross-ref.js';
import type { TestCase } from '../src/types.js';

const caseWithSourceTypes = (sourceTypes: string[]): TestCase => ({
  id: 'tc',
  suite: 'incremental',
  description: 'test',
  pageType: 'Person',
  sources: sourceTypes.map((type, i) => ({
    path: `s${i}`,
    type,
    snapshotId: `snap${i}`,
  })),
});

describe('gradeCrossRef', () => {
  it('skips (does not score 0) when fewer than 2 source types are available', async () => {
    // A fixture with a single source type gives the agent nothing to
    // cross-reference — that is not a failure the agent can fix. Returning
    // a hard score:0 instead of skipped:true makes computeComposite count
    // it, dragging the whole 20%-weighted mechanics tier toward 0. It must
    // be skipped, the way tool-usage skips when no log is available.
    const result = await gradeCrossRef('some wikitext', caseWithSourceTypes(['whatsapp']));
    assert.equal(result.skipped, true);
  });

  it('skips when no sources are available at all', async () => {
    const result = await gradeCrossRef('some wikitext', caseWithSourceTypes([]));
    assert.equal(result.skipped, true);
  });
});
