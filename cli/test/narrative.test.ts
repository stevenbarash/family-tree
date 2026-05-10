import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNarrative } from '../src/commands/narrative.js';

interface Files {
  reads: Record<string, string>;
  writes: Record<string, string>;
}

interface GitCalls {
  add: string[];
  commits: string[];
}

function fakeIo() {
  const files: Files = { reads: {}, writes: {} };
  const git: GitCalls = { add: [], commits: [] };
  let editorBuffer = '';
  return {
    files,
    git,
    setEditorBuffer: (b: string) => { editorBuffer = b; },
    deps: {
      readFile: (p: string) => { return files.reads[p] ?? null; },
      writeFile: (p: string, content: string) => { files.writes[p] = content; },
      exists: (p: string) => p in files.reads || p in files.writes,
      editInEditor: async (initial: string) => editorBuffer || initial,
      gitAdd: (paths: string[]) => { git.add.push(...paths); },
      gitCommit: (message: string) => { git.commits.push(message); },
      gitHasUncommittedChanges: () => false,
      now: () => '2026-05-10',
    },
  };
}

test('narrative: creates new file with frontmatter when slug has no narrative.md', async () => {
  const { files, git, setEditorBuffer, deps } = fakeIo();
  setEditorBuffer('---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-10\nupdated: 2026-05-10\n---\n\nFamily memory of Aidele in Teofipol.\n');
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /title: Aidele/);
  assert.deepEqual(git.add, ['/repo/pages/aidele.narrative.md']);
  assert.equal(git.commits.length, 1);
  assert.match(git.commits[0]!, /^narrative\(aidele\): create/);
});

test('narrative: updates existing file', async () => {
  const { files, git, setEditorBuffer, deps } = fakeIo();
  files.reads['/repo/pages/aidele.narrative.md'] = '---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-09\nupdated: 2026-05-09\n---\n\nold body\n';
  setEditorBuffer('---\ntitle: Aidele\nsubject: aidele\ncreated: 2026-05-09\nupdated: 2026-05-10\n---\n\nnew body\n');
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /new body/);
  assert.match(git.commits[0]!, /^narrative\(aidele\): update/);
});

test('narrative: --print emits to stdout, no commit', async () => {
  const { files, git, deps } = fakeIo();
  files.reads['/repo/pages/aidele.narrative.md'] = '---\ntitle: Aidele\n---\n\nbody text\n';
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'print', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(out, /body text/);
  assert.equal(git.commits.length, 0);
  assert.equal(Object.keys(files.writes).length, 0);
});

test('narrative: --file ingests an existing file and commits', async () => {
  const { files, git, deps } = fakeIo();
  files.reads['/incoming/aidele-memoir.md'] = '---\ntitle: Aidele\n---\n\nimported body\n';
  let out = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'ingest', ingestPath: '/incoming/aidele-memoir.md', ...deps, write: (s) => { out += s; }, writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.match(files.writes['/repo/pages/aidele.narrative.md']!, /imported body/);
  assert.match(git.commits[0]!, /^narrative\(aidele\): create/);
});

test('narrative: aborts with exit 7 when repo has uncommitted changes', async () => {
  const { deps } = fakeIo();
  let err = '';
  const code = await runNarrative({
    rootDir: '/repo', slug: 'aidele', mode: 'edit', ...deps, gitHasUncommittedChanges: () => true, write: () => {}, writeErr: (s) => { err += s; },
  });
  assert.equal(code, 7);
  assert.match(err, /uncommitted/);
});
