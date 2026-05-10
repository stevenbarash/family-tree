import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTranscribe, runTranscribeDir } from '../src/commands/transcribe.js';
import type { Transcriber } from '../src/transcriber.js';

function fakeIo() {
  const writes: Record<string, string | Uint8Array> = {};
  const reads: Record<string, Uint8Array> = {};
  const adds: string[] = [];
  const commits: string[] = [];
  const noteCalls: { slug: string; text: string; kind: string }[] = [];
  let uncommitted = false;
  const fakeTranscriber: Transcriber = {
    transcribe: async (_req) => ({ text: 'fake transcript', lang: 'en' }),
  };
  return {
    writes, reads, adds, commits, noteCalls,
    setUncommitted: (v: boolean) => { uncommitted = v; },
    deps: {
      readFileBinary: (p: string) => reads[p] ?? null,
      writeFileBinary: (p: string, b: Uint8Array) => { writes[p] = b; },
      mkdirP: (_p: string) => {},
      gitAdd: (paths: string[]) => { adds.push(...paths); },
      gitCommit: (msg: string) => { commits.push(msg); },
      gitHasUncommittedChanges: () => uncommitted,
      appendNote: async (slug: string, text: string, opts: { kind: string }) => { noteCalls.push({ slug, text, kind: opts.kind }); },
      transcriber: fakeTranscriber,
      now: () => '2026-05-10',
    },
  };
}

test('transcribe: copies audio, transcribes, appends note, commits', async () => {
  const { reads, writes, adds, commits, noteCalls, deps } = fakeIo();
  reads['/in/voice.m4a'] = new Uint8Array([1, 2, 3, 4]);
  let out = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/voice.m4a', lang: 'auto', speaker: 'Steven', date: '2026-05-08',
    ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(writes['/repo/assets/audio/aidele/voice.m4a'], new Uint8Array([1, 2, 3, 4]));
  assert.equal(noteCalls.length, 1);
  assert.equal(noteCalls[0]!.kind, 'transcript');
  assert.match(noteCalls[0]!.text, /fake transcript/);
  assert.deepEqual(adds, ['/repo/assets/audio/aidele/voice.m4a']);
  assert.match(commits[0]!, /^transcribe\(aidele\): voice\.m4a/);
});

test('transcribe: aborts with exit 3 when audio file is missing', async () => {
  const { deps } = fakeIo();
  let err = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/nope.m4a', lang: 'auto',
    ...deps, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 3);
  assert.match(err, /not found/);
});

test('transcribe: aborts with exit 7 when repo dirty', async () => {
  const { reads, deps, setUncommitted } = fakeIo();
  reads['/in/voice.m4a'] = new Uint8Array([0]);
  setUncommitted(true);
  let err = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/voice.m4a', lang: 'auto',
    ...deps, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 7);
  assert.match(err, /uncommitted/);
});

test('transcribe: aborts with exit 5 when transcriber fails', async () => {
  const { reads, deps } = fakeIo();
  reads['/in/voice.m4a'] = new Uint8Array([0]);
  const failingTranscriber: Transcriber = {
    transcribe: async () => { throw new Error('API timeout'); },
  };
  let err = '';
  const code = await runTranscribe({
    rootDir: '/repo', slug: 'aidele', audioPath: '/in/voice.m4a', lang: 'auto',
    ...deps, transcriber: failingTranscriber,
    write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 5);
  assert.match(err, /API failure/);
});

test('transcribe --dir: processes every audio file; commits each', async () => {
  const { reads, commits, deps } = fakeIo();
  reads['/in/a.m4a'] = new Uint8Array([1]);
  reads['/in/b.m4a'] = new Uint8Array([2]);
  const writes: Record<string, string | Uint8Array> = {};
  let out = '';
  const code = await runTranscribeDir({
    rootDir: '/repo', slug: 'aidele', dirPath: '/in', lang: 'auto',
    listAudio: () => ['/in/a.m4a', '/in/b.m4a'],
    runOne: async (audioPath) => {
      // delegate to runTranscribe with the same fake deps
      return runTranscribe({
        rootDir: '/repo', slug: 'aidele', audioPath, lang: 'auto',
        ...deps, write: () => {}, writeErr: () => {},
      });
    },
    writeFile: (p, c) => { writes[p] = c; },
    write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(commits.length, 2);
  assert.match(out, /2 transcribed/);
});

test('transcribe --dir: failures journaled, command exits 5', async () => {
  const { reads, deps } = fakeIo();
  reads['/in/a.m4a'] = new Uint8Array([1]);
  // /in/b.m4a missing on purpose
  const writes: Record<string, string | Uint8Array> = {};
  let out = '';
  const code = await runTranscribeDir({
    rootDir: '/repo', slug: 'aidele', dirPath: '/in', lang: 'auto',
    listAudio: () => ['/in/a.m4a', '/in/b.m4a'],
    runOne: async (audioPath) => runTranscribe({
      rootDir: '/repo', slug: 'aidele', audioPath, lang: 'auto',
      ...deps, write: () => {}, writeErr: () => {},
    }),
    writeFile: (p, c) => { writes[p] = c; },
    write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 5);
  const failedPath = Object.keys(writes).find(p => p.includes('transcribe-runs') && p.endsWith('-failed.txt'));
  assert(failedPath, 'expected -failed.txt to be written');
  assert.match(writes[failedPath!] as string, /b\.m4a/);
});
