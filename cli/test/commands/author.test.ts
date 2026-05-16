import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAuthor, runAuthorCohort, type AuthorOptions } from '../../src/commands/author.js';
import type { EvidenceDrawer } from '../../src/commands/author/gather.js';
import type { OutlinePlan } from '../../src/commands/author/outline.js';
import type { ResearchResult } from '../../src/commands/author/research.js';
import type { VerifyResult } from '../../src/commands/author/verify.js';
import type { ApiClient } from '../../src/api-client.js';

// ── Shared fakes ──────────────────────────────────────────────────────────────

const emptyDrawer: EvidenceDrawer = {
  slug: 'aidele',
  derived: null,
  talkBody: null,
  researchNotes: [],
  narrativeBody: null,
  transcripts: [],
  inputs: [],
};

const emptyPlan: OutlinePlan = {
  person: { lead: 'Aidele was a woman.', sections: [] },
  episodes: [],
};

const planWithEpisodes: OutlinePlan = {
  person: { lead: 'Aidele was a woman.', sections: [] },
  episodes: [
    { slug: 'aidele-ep1', title: 'Episode One', scope: 'scope1' },
    { slug: 'aidele-ep2', title: 'Episode Two', scope: 'scope2' },
  ],
};

function fakeClient(over: Partial<ApiClient> = {}): ApiClient {
  return {
    read: async () => { throw new Error('not found'); },
    write: async () => ({ ok: true }),
    note: async () => ({ slug: 'aidele.talk', date: '2026-05-10', id: 'n1' }),
    listNotes: async () => [],
    // Provide stubs for other methods so the type is satisfied.
    healthz: async () => ({ status: 'ok', started: '' }),
    delete: async () => ({ ok: true }),
    syncGedcom: async () => ({ ok: true } as never),
    reciteDrift: async () => ({ drift: [] }),
    applyRecite: async () => ({ updated: [] }),
    search: async () => ({ results: [] }),
    redlinks: async () => ({ redlinks: [] }),
    rebuildSearch: async () => ({ ok: true, pages: 0, ms: 0 }),
    rebuildSearchCheck: async () => ({ stale: false }),
    migrate: async () => ({ ok: true } as never),
    editNote: async () => ({ slug: '', id: '', editedAt: '' }),
    deleteNote: async () => ({ slug: '', id: '', deletedAt: '' }),
    restoreNote: async () => ({ slug: '', id: '' }),
    ...over,
  } as ApiClient;
}

/** A fully-stubbed AuthorOptions that runs all phases via fake phase functions. */
function fakeOpts(over: Partial<AuthorOptions> = {}): AuthorOptions {
  return {
    rootDir: '/repo',
    slug: 'aidele',
    resume: false,
    noWeb: true,           // skip web by default to keep tests fast
    skipEpisodes: false,
    dryRun: false,
    harness: { invoke: async () => ({ ok: true, result: {} as never }) },
    client: fakeClient(),
    readFile: () => null,
    writeFile: () => {},
    exists: () => false,
    gitLog: () => '',
    gitAdd: () => {},
    gitCommit: () => {},
    gitHasUncommittedChanges: () => false,
    gitIsRepo: () => true,
    healthz: async () => true,
    now: () => '2026-05-10',
    write: () => {},
    writeErr: () => {},
    // Default phase fakes
    _gather: async () => emptyDrawer,
    _outline: async () => emptyPlan,
    _draftPerson: async () => ({ body: '# Aidele\n', redlinks: [] }),
    _draftEpisode: async () => ({ body: '# Episode\n', redlinks: [] }),
    _verify: async () => ({ fixesApplied: 0, consistencyFindings: 0, blocked: false }),
    ...over,
  };
}

// ── Pre-flight tests (unchanged from original) ────────────────────────────────

test('author: aborts with 8 when not a git repo', async () => {
  let err = '';
  const code = await runAuthor(fakeOpts({ gitIsRepo: () => false, writeErr: (s) => { err += s; } }));
  assert.equal(code, 8);
  assert.match(err, /not a git repo/);
});

test('author: aborts with 7 when uncommitted changes', async () => {
  const code = await runAuthor(fakeOpts({ gitHasUncommittedChanges: () => true }));
  assert.equal(code, 7);
});

test('author: aborts with 14 when healthz fails', async () => {
  const code = await runAuthor(fakeOpts({ healthz: async () => false }));
  assert.equal(code, 14);
});

test('author --dry-run: prints plan; returns 0', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ dryRun: true, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /would run phases 1\.\.7/);
});

test('author --resume: cold start when no prior run', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => '', write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /starting fresh/);
});

test('author --resume: picks up at next phase', async () => {
  const log = 'pipeline-run: r1\nphase: 3\nslug: aidele\ninputs: derived,talk\nfabrication-guard: pass';
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => log, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /resuming run r1 at phase 4/);
});

// ── Phase-ordering tests ──────────────────────────────────────────────────────

test('author: calls phases in order 1→2→3→4→5→6→7', async () => {
  const order: string[] = [];
  const code = await runAuthor(fakeOpts({
    noWeb: true,
    _gather: async () => { order.push('gather'); return emptyDrawer; },
    _outline: async () => { order.push('outline'); return emptyPlan; },
    _draftPerson: async () => { order.push('draftPerson'); return { body: '', redlinks: [] }; },
    _verify: async () => { order.push('verify'); return { fixesApplied: 0, consistencyFindings: 0, blocked: false }; },
  }));
  assert.equal(code, 0);
  assert.deepEqual(order, ['gather', 'outline', 'draftPerson', 'verify']);
});

test('author: skips research phase when noWeb=true', async () => {
  let researchCalled = false;
  const code = await runAuthor(fakeOpts({
    noWeb: true,
    _research: async () => {
      researchCalled = true;
      return { candidateClaims: [], sourcesQueried: 0, refuseToFabricate: false };
    },
  }));
  assert.equal(code, 0);
  assert.equal(researchCalled, false, 'research should not be called when noWeb=true');
});

test('author: runs research phase when noWeb=false and returns 0 on success', async () => {
  let researchCalled = false;
  const fakeResearchResult: ResearchResult = {
    candidateClaims: [],
    sourcesQueried: 0,
    refuseToFabricate: false,
  };
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _gather: async () => ({ ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, inputs: ['derived'] }),
    _research: async () => { researchCalled = true; return fakeResearchResult; },
  }));
  assert.equal(code, 0);
  assert.equal(researchCalled, true, 'research should be called when noWeb=false');
});

test('author: exits 4 when research returns refuseToFabricate', async () => {
  let err = '';
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _research: async (): Promise<ResearchResult> => ({
      candidateClaims: [],
      sourcesQueried: 0,
      refuseToFabricate: true,
    }),
    writeErr: (s) => { err += s; },
  }));
  assert.equal(code, 4);
  assert.match(err, /refuse-to-fabricate/);
});

test('author: skips episodes when skipEpisodes=true', async () => {
  let draftEpisodeCalled = false;
  const out: string[] = [];
  const code = await runAuthor(fakeOpts({
    skipEpisodes: true,
    _outline: async () => planWithEpisodes,
    _draftEpisode: async () => { draftEpisodeCalled = true; return { body: '', redlinks: [] }; },
    write: (s) => { out.push(s); },
  }));
  assert.equal(code, 0);
  assert.equal(draftEpisodeCalled, false, 'draftEpisode should not be called when skipEpisodes=true');
  assert.ok(out.some(s => s.includes('skipped')), 'should print skipped message');
});

test('author: drafts one episode per plan entry', async () => {
  const episodesSlugs: string[] = [];
  const code = await runAuthor(fakeOpts({
    skipEpisodes: false,
    _outline: async () => planWithEpisodes,
    _draftEpisode: async (ep) => { episodesSlugs.push(ep.slug); return { body: '', redlinks: [] }; },
  }));
  assert.equal(code, 0);
  assert.deepEqual(episodesSlugs, ['aidele-ep1', 'aidele-ep2']);
});

test('author: exits 5 when verify is blocked', async () => {
  let err = '';
  const fakeVerify = async (): Promise<VerifyResult> => ({
    fixesApplied: 0,
    consistencyFindings: 3,
    blocked: true,
  });
  const code = await runAuthor(fakeOpts({
    _verify: fakeVerify,
    writeErr: (s) => { err += s; },
  }));
  assert.equal(code, 5);
  assert.match(err, /verify blocked/);
});

test('author: client.write summaries contain pipeline trailer for phases 3, 4, 7', async () => {
  // Phases 3 (outline), 4 (draft person), and 7 (log) commit via client.write.
  // The summary passed to client.write must embed the pipeline trailer so git
  // log --grep can find the commit.
  const writeArgs: Array<{ slug: string; summary: string }> = [];
  const client = fakeClient({
    write: async (slug, _body, summary) => {
      writeArgs.push({ slug, summary: summary ?? '' });
      return { ok: true };
    },
  });
  const code = await runAuthor(fakeOpts({ client }));
  assert.equal(code, 0);

  // Phase 3: outline commit to talk page
  const outlineWrite = writeArgs.find(w => w.slug === 'aidele.talk' && w.summary.startsWith('outline(aidele):'));
  assert.ok(outlineWrite !== undefined, `expected outline write, got: ${JSON.stringify(writeArgs.map(w => w.slug + '|' + w.summary.slice(0, 60)))}`);
  assert.match(outlineWrite.summary, /pipeline-run:/, 'outline summary must contain pipeline-run trailer');
  assert.match(outlineWrite.summary, /phase: 3/, 'outline summary must contain phase: 3');
  assert.match(outlineWrite.summary, /slug: aidele/, 'outline summary must contain slug: aidele');

  // Phase 4: draft-person commit
  const draftPersonWrite = writeArgs.find(w => w.slug === 'aidele' && w.summary.startsWith('draft(aidele): person page'));
  assert.ok(draftPersonWrite !== undefined, `expected draft-person write, got: ${JSON.stringify(writeArgs.map(w => w.slug + '|' + w.summary.slice(0, 60)))}`);
  assert.match(draftPersonWrite.summary, /pipeline-run:/, 'draft-person summary must contain pipeline-run trailer');
  assert.match(draftPersonWrite.summary, /phase: 4/, 'draft-person summary must contain phase: 4');

  // Phase 7: log commit to talk page
  const logWrite = writeArgs.find(w => w.slug === 'aidele.talk' && w.summary.startsWith('log(aidele): pipeline complete'));
  assert.ok(logWrite !== undefined, `expected log write, got: ${JSON.stringify(writeArgs.map(w => w.slug + '|' + w.summary.slice(0, 60)))}`);
  assert.match(logWrite.summary, /pipeline-run:/, 'log summary must contain pipeline-run trailer');
  assert.match(logWrite.summary, /phase: 7/, 'log summary must contain phase: 7');
});

test('author: draft episode summaries contain pipeline trailer (phase 5)', async () => {
  const writeArgs: Array<{ slug: string; summary: string }> = [];
  const client = fakeClient({
    write: async (slug, _body, summary) => {
      writeArgs.push({ slug, summary: summary ?? '' });
      return { ok: true };
    },
  });
  const code = await runAuthor(fakeOpts({
    client,
    _outline: async () => planWithEpisodes,
  }));
  assert.equal(code, 0);

  for (const ep of ['aidele-ep1', 'aidele-ep2']) {
    const epWrite = writeArgs.find(w => w.slug === ep);
    assert.ok(epWrite !== undefined, `expected write for episode ${ep}`);
    assert.match(epWrite.summary, /pipeline-run:/, `episode ${ep} summary must contain pipeline-run trailer`);
    assert.match(epWrite.summary, /phase: 5/, `episode ${ep} summary must contain phase: 5`);
  }
});

test('author: phase 2 fires gitCommit with trailer (marker commit)', async () => {
  const commits: Array<{ subject: string; body: string }> = [];
  const fakeResearchResult = {
    candidateClaims: [{ text: 'Born 1890', url: 'https://example.com', gap: 'birthdate' }],
    sourcesQueried: 1,
    refuseToFabricate: false,
  };
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _gather: async () => ({ ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, inputs: ['derived'] }),
    _research: async () => fakeResearchResult,
    gitCommit: (subject, body) => { commits.push({ subject, body }); },
  }));
  assert.equal(code, 0);

  const researchCommit = commits.find(c => c.subject.startsWith('research(aidele):'));
  assert.ok(researchCommit !== undefined, `expected research marker commit, got: ${JSON.stringify(commits.map(c => c.subject))}`);
  assert.match(researchCommit.body, /pipeline-run:/, 'research marker commit body must contain pipeline-run trailer');
  assert.match(researchCommit.body, /phase: 2/, 'research marker commit body must contain phase: 2');
  assert.match(researchCommit.body, /slug: aidele/, 'research marker commit body must contain slug: aidele');
});

test('author: returns 0 on full happy-path run', async () => {
  const code = await runAuthor(fakeOpts({
    noWeb: true,
    skipEpisodes: false,
    _outline: async () => planWithEpisodes,
  }));
  assert.equal(code, 0);
});

test('author: injected runCheck is called by verify phase instead of no-op', async () => {
  const checkCalls: Array<{ only: string[]; fix?: boolean }> = [];
  // Override _verify to use the real verify function so we can confirm runCheck is wired.
  // We pass a real-ish runCheck via opts.runCheck and a custom _verify that captures calls.
  const code = await runAuthor(fakeOpts({
    runCheck: async (args) => {
      checkCalls.push(args);
      return { exitCode: 0, findingCount: 0, fixedCount: 0 };
    },
    // Use real _verify to ensure opts.runCheck flows through it.
    _verify: async (deps) => {
      // Call both check invocations as verify does.
      await deps.runCheck({ only: ['format', 'schema'], fix: true });
      await deps.runCheck({ only: ['consistency'] });
      return { fixesApplied: 0, consistencyFindings: 0, blocked: false };
    },
  }));
  assert.equal(code, 0);
  assert.equal(checkCalls.length, 2, 'runCheck should be called twice by verify');
  assert.deepEqual(checkCalls[0], { only: ['format', 'schema'], fix: true });
  assert.deepEqual(checkCalls[1], { only: ['consistency'] });
});

// ── Drawer-refresh-after-research tests ──────────────────────────────────────
//
// Regression: the in-memory drawer was only populated once at phase 1, so
// phases 3 (outline) and 4 (draft-person) received a stale drawer with empty
// researchNotes — even after phase 2 had written candidate-claim notes to the
// talk page via the API. The published page therefore only ever cited
// [^gedcom], even when the research phase had pulled rich multilingual
// sources (Yizkor, Pinkas Hakehillot, Jewish Encyclopedia, etc.). On --resume
// past phase 1, the bug masked itself: drawer was null at the start, so it
// was re-gathered fresh and included the notes that the prior run's phase 2
// had committed. Fix: re-gather after phase 2 so phases 3+ see the updated
// talk-page state.

test('author: re-gathers drawer after phase 2 so outline + draft see research notes', async () => {
  let gatherCount = 0;
  const drawerBefore: EvidenceDrawer = { ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, researchNotes: [], inputs: ['derived'] };
  const drawerAfter: EvidenceDrawer = {
    ...emptyDrawer,
    derived: { record: 'I1', raw: 'name: Aidele' },
    researchNotes: [{ id: 'n1', date: '2026-05-10', text: 'Born 1890', kind: 'research' }],
    inputs: ['derived', 'talk'],
  };
  let outlineSawNotes = false;
  let draftSawNotes = false;
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _gather: async () => {
      gatherCount++;
      return gatherCount === 1 ? drawerBefore : drawerAfter;
    },
    _research: async () => ({
      candidateClaims: [{ text: 'Born 1890', url: 'https://example.com', gap: 'birthdate' }],
      sourcesQueried: 1,
      refuseToFabricate: false,
    }),
    _outline: async (drawer) => { outlineSawNotes = drawer.researchNotes.length > 0; return emptyPlan; },
    _draftPerson: async (_plan, drawer) => { draftSawNotes = drawer.researchNotes.length > 0; return { body: '', redlinks: [] }; },
  }));
  assert.equal(code, 0);
  assert.equal(gatherCount, 2, 'gather must be called twice: once at phase 1, again after phase 2 commits notes');
  assert.ok(outlineSawNotes, 'outline must receive a drawer that includes the phase-2 research notes');
  assert.ok(draftSawNotes, 'draft-person must receive a drawer that includes the phase-2 research notes');
});

test('author: does NOT re-gather when --no-web (phase 2 skipped, no new notes)', async () => {
  // When the research phase is skipped, no new notes hit the talk page, so
  // re-gathering would just be wasted work. Keeps the noWeb fast-path fast.
  let gatherCount = 0;
  const code = await runAuthor(fakeOpts({
    noWeb: true,
    _gather: async () => { gatherCount++; return emptyDrawer; },
  }));
  assert.equal(code, 0);
  assert.equal(gatherCount, 1, 'gather should be called only once when phase 2 is skipped');
});

test('author: does NOT re-gather when research returned zero candidate claims', async () => {
  // If research returned 0 claims, no notes were added to talk, so re-gather
  // is unnecessary. (refuseToFabricate is checked first; this is the
  // non-refuse "empty result" path.)
  let gatherCount = 0;
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _gather: async () => { gatherCount++; return { ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, inputs: ['derived'] }; },
    _research: async () => ({ candidateClaims: [], sourcesQueried: 3, refuseToFabricate: false }),
  }));
  assert.equal(code, 0);
  assert.equal(gatherCount, 1, 'gather should be called only once when phase 2 added zero notes');
});

test('author: phase 5 (draft-episode) also receives the post-research drawer', async () => {
  // Episodes inherit the same drawer as the person hub. The fix is a single
  // re-assignment to the `let drawer` variable, so all phases that read
  // `drawer` after phase 2 (phases 3, 4, AND 5) see the refresh.
  let gatherCount = 0;
  const drawerBefore: EvidenceDrawer = { ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, researchNotes: [], inputs: ['derived'] };
  const drawerAfter: EvidenceDrawer = {
    ...emptyDrawer,
    derived: { record: 'I1', raw: 'name: Aidele' },
    researchNotes: [{ id: 'n1', date: '2026-05-10', text: 'evidence', kind: 'research' }],
    inputs: ['derived', 'talk'],
  };
  const episodeNotesSeen: number[] = [];
  const code = await runAuthor(fakeOpts({
    noWeb: false,
    _gather: async () => { gatherCount++; return gatherCount === 1 ? drawerBefore : drawerAfter; },
    _research: async () => ({
      candidateClaims: [{ text: 'x', url: 'https://example.com', gap: 'g' }],
      sourcesQueried: 1,
      refuseToFabricate: false,
    }),
    _outline: async () => planWithEpisodes,
    _draftEpisode: async (_ep, drawer) => { episodeNotesSeen.push(drawer.researchNotes.length); return { body: '', redlinks: [] }; },
  }));
  assert.equal(code, 0);
  assert.equal(episodeNotesSeen.length, 2, 'both episodes should have run');
  assert.ok(episodeNotesSeen.every(n => n > 0), `every draft-episode call must see research notes, got: ${JSON.stringify(episodeNotesSeen)}`);
});

test('author: --resume past phase 2 still gathers fresh drawer (existing pattern preserved)', async () => {
  // Existing behavior: when resuming, drawer is null at start, so it's
  // re-gathered. This is what made the bug invisible on --resume — and the
  // fix above doesn't break it.
  let gatherCount = 0;
  const log = 'pipeline-run: r1\nphase: 3\nslug: aidele\ninputs: derived,talk,web\nfabrication-guard: pass';
  let outlineSawNotes = false;
  const code = await runAuthor(fakeOpts({
    resume: true,
    gitLog: () => log,
    _gather: async () => {
      gatherCount++;
      return { ...emptyDrawer, derived: { record: 'I1', raw: 'name: Aidele' }, researchNotes: [{ id: 'n1', date: '2026-05-10', text: 'x', kind: 'research' }], inputs: ['derived', 'talk'] };
    },
    _outline: async (drawer) => { outlineSawNotes = drawer.researchNotes.length > 0; return emptyPlan; },
  }));
  assert.equal(code, 0);
  // --resume at phase 4 means startPhase=4; phase 1 is skipped; the "ensure
  // drawer is populated" fallback runs gather once. The post-phase-2 refresh
  // does not fire because startPhase > 2.
  assert.equal(gatherCount, 1, 'on --resume past phase 2, gather runs once (the fallback for missing drawer)');
  assert.ok(outlineSawNotes, 'resume-fresh drawer must include the research notes from the prior run');
});

test('author: writes log to talk page during phase 7', async () => {
  const writtenPages: Array<{ slug: string; body: string }> = [];
  const client = fakeClient({
    write: async (slug, body) => { writtenPages.push({ slug, body }); return { ok: true }; },
  });
  const code = await runAuthor(fakeOpts({ client }));
  assert.equal(code, 0);
  const talkWrite = writtenPages.find(p => p.slug === 'aidele.talk' && p.body.includes('Agent log'));
  assert.ok(talkWrite !== undefined, 'expected agent log written to talk page');
});

// ── runAuthorCohort tests ─────────────────────────────────────────────────────

test('cohort: runs each slug; reports success', async () => {
  const written: Record<string, string> = {};
  const journalContent: string[] = [];
  let out = '';
  const code = await runAuthorCohort({
    slugs: ['aidele', 'kelman-ayzman'],
    parallel: 1,
    order: 'file',
    runOne: async () => 0,
    journal: {
      rootDir: '/repo',
      appendFile: (p, c) => { journalContent.push(c); written[p] = (written[p] ?? '') + c; },
      mkdirP: () => {},
    },
    readFile: () => null,
    writeFailedFile: (p, c) => { written[p] = c; },
    rootDir: '/repo',
    write: (s) => { out += s; },
    writeErr: () => {},
    now: () => '2026-05-11T00:00:00Z',
  });
  assert.equal(code, 0);
  assert.match(out, /2 succeeded/);
  // Each slug: 1 started + 1 completed = 4 journal entries
  assert.equal(journalContent.length, 4);
});

test('cohort: writes failed.txt on failure; returns 1', async () => {
  const written: Record<string, string> = {};
  let err = '';
  const code = await runAuthorCohort({
    slugs: ['ok-slug', 'bad-slug'],
    parallel: 1,
    order: 'file',
    runOne: async (slug) => slug === 'bad-slug' ? 5 : 0,
    journal: {
      rootDir: '/repo',
      appendFile: () => {},
      mkdirP: () => {},
    },
    readFile: () => null,
    writeFailedFile: (p, c) => { written[p] = c; },
    rootDir: '/repo',
    write: () => {},
    writeErr: (s) => { err += s; },
    now: () => '2026-05-11T00:00:00Z',
  });
  assert.equal(code, 1);
  const failedPath = Object.keys(written).find(p => p.endsWith('-failed.txt'));
  assert(failedPath, 'expected failed.txt');
  assert.match(written[failedPath!] ?? '', /bad-slug.*exit=5/);
  assert.match(err, /1 succeeded, 1 failed/);
});

test('cohort --resume: skips slugs already completed in the journal', async () => {
  const runSlugs: string[] = [];
  const code = await runAuthorCohort({
    slugs: ['done-slug', 'todo-slug'],
    parallel: 1,
    order: 'file',
    resumeRunId: 'r1',
    runOne: async (slug) => { runSlugs.push(slug); return 0; },
    journal: {
      rootDir: '/repo',
      appendFile: () => {},
      mkdirP: () => {},
    },
    readFile: (p) => p.endsWith('r1.jsonl')
      ? '{"ts":"t","runId":"r1","slug":"done-slug","status":"completed"}\n'
      : null,
    writeFailedFile: () => {},
    rootDir: '/repo',
    write: () => {},
    writeErr: () => {},
    now: () => '2026-05-11T00:00:00Z',
  });
  assert.equal(code, 0);
  assert.deepEqual(runSlugs, ['todo-slug']);
});

test('cohort --resume: passes resume=true to runOne for partial slugs', async () => {
  const calls: Array<{ slug: string; resume: boolean }> = [];
  await runAuthorCohort({
    slugs: ['partial-slug'],
    parallel: 1,
    order: 'file',
    resumeRunId: 'r1',
    runOne: async (slug, o) => { calls.push({ slug, resume: o.resume }); return 0; },
    journal: { rootDir: '/repo', appendFile: () => {}, mkdirP: () => {} },
    readFile: (p) => p.endsWith('r1.jsonl')
      ? '{"ts":"t","runId":"r1","slug":"partial-slug","status":"started"}\n'
      : null,
    writeFailedFile: () => {},
    rootDir: '/repo',
    write: () => {},
    writeErr: () => {},
    now: () => '2026-05-11T00:00:00Z',
  });
  assert.deepEqual(calls, [{ slug: 'partial-slug', resume: true }]);
});

test('cohort: --parallel >1 emits warning to writeErr', async () => {
  let err = '';
  await runAuthorCohort({
    slugs: ['a'],
    parallel: 3,
    order: 'file',
    runOne: async () => 0,
    journal: { rootDir: '/repo', appendFile: () => {}, mkdirP: () => {} },
    readFile: () => null,
    writeFailedFile: () => {},
    rootDir: '/repo',
    write: () => {},
    writeErr: (s) => { err += s; },
    now: () => '2026-05-11T00:00:00Z',
  });
  assert.match(err, /--parallel 3 ignored/);
});
