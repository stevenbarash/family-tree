import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from '../../../src/commands/author/verify.js';

test('verify: not blocked when consistency and citation findings empty', async () => {
  const calls: Array<{ only: string[]; fix?: boolean; slugFilter?: string }> = [];
  const out = await verify({
    slug: 'aidele',
    runCheck: async (args) => {
      calls.push(args);
      if (args.fix) return { exitCode: 0, findingCount: 0, fixedCount: 2 };
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(out.fixesApplied, 2);
  assert.equal(out.consistencyFindings, 0);
  assert.equal(out.citationFindings, 0);
  assert.equal(out.blocked, false);
  assert.deepEqual(calls[0], { only: ['format', 'schema'], fix: true });
  assert.deepEqual(calls[1], { only: ['consistency'], slugFilter: 'aidele' });
  assert.deepEqual(calls[2], { only: ['citation'], slugFilter: 'aidele' });
});

test('verify: blocked=true when consistency findings present', async () => {
  const out = await verify({
    slug: 'aidele',
    runCheck: async (args) => {
      if (args.fix) return { exitCode: 0, findingCount: 0, fixedCount: 0 };
      if (args.only.includes('consistency')) return { exitCode: 1, findingCount: 3, fixedCount: 0 };
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(out.blocked, true);
  assert.equal(out.consistencyFindings, 3);
  assert.equal(out.citationFindings, 0);
});

test('verify: blocked=true when citation findings present (even if consistency is clean)', async () => {
  // Regression: the fabrication failure mode is "page draft has unsourced
  // factual sentences" — citation must block phase 7 the same way consistency
  // does, otherwise the model can claim "pipeline complete" on a draft that
  // contains hallucinated facts.
  const out = await verify({
    slug: 'aidele',
    runCheck: async (args) => {
      if (args.fix) return { exitCode: 0, findingCount: 0, fixedCount: 0 };
      if (args.only.includes('citation')) return { exitCode: 1, findingCount: 2, fixedCount: 0 };
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(out.blocked, true);
  assert.equal(out.citationFindings, 2);
});

test('verify: never passes fix=true for consistency or citation', async () => {
  let consistencyFix = false;
  let citationFix = false;
  await verify({
    slug: 'aidele',
    runCheck: async (args) => {
      if (args.only.includes('consistency') && args.fix) consistencyFix = true;
      if (args.only.includes('citation') && args.fix) citationFix = true;
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(consistencyFix, false);
  assert.equal(citationFix, false);
});

test('verify: passes slugFilter through to consistency AND citation checks', async () => {
  // Pre-existing findings on unrelated pages must not block this run, for
  // either category. Format/schema fixes still apply globally.
  let consistencyArgs: { only: string[]; fix?: boolean; slugFilter?: string } | null = null;
  let citationArgs: { only: string[]; fix?: boolean; slugFilter?: string } | null = null;
  await verify({
    slug: 'boris-smertenko',
    runCheck: async (args) => {
      if (args.only.includes('consistency')) consistencyArgs = args;
      if (args.only.includes('citation')) citationArgs = args;
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(consistencyArgs!.slugFilter, 'boris-smertenko');
  assert.equal(citationArgs!.slugFilter, 'boris-smertenko');
});

test('verify: format+schema --fix call is NOT slug-filtered (fixes apply globally; they are safe idempotent normalizations)', async () => {
  let fixArgs: { only: string[]; fix?: boolean; slugFilter?: string } | null = null;
  await verify({
    slug: 'boris-smertenko',
    runCheck: async (args) => {
      if (args.fix) fixArgs = args;
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(fixArgs!.slugFilter, undefined);
});
