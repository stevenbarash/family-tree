import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from '../../../src/commands/author/verify.js';

test('verify: not blocked when consistency findings empty', async () => {
  const calls: Array<{ only: string[]; fix?: boolean }> = [];
  const out = await verify({
    runCheck: async (args) => {
      calls.push(args);
      if (args.fix) return { exitCode: 0, findingCount: 0, fixedCount: 2 };
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(out.fixesApplied, 2);
  assert.equal(out.consistencyFindings, 0);
  assert.equal(out.blocked, false);
  assert.deepEqual(calls[0], { only: ['format', 'schema'], fix: true });
  assert.deepEqual(calls[1], { only: ['consistency'] });
});

test('verify: blocked=true when consistency findings present', async () => {
  const out = await verify({
    runCheck: async (args) => {
      if (args.fix) return { exitCode: 0, findingCount: 0, fixedCount: 0 };
      return { exitCode: 1, findingCount: 3, fixedCount: 0 };
    },
  });
  assert.equal(out.blocked, true);
  assert.equal(out.consistencyFindings, 3);
});

test('verify: never passes fix=true for consistency', async () => {
  let consistencyFix = false;
  await verify({
    runCheck: async (args) => {
      if (args.only.includes('consistency') && args.fix) consistencyFix = true;
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
  });
  assert.equal(consistencyFix, false);
});
