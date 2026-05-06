import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendResearchNote,
  extractResearchNotesSection,
  parseResearchNotes,
  type Note,
  type NewNoteInput,
  NoteNotFoundError,
  NoteDeletedError,
  NoteAlreadyDeletedError,
} from '../../src/pages/research-notes.ts';

const fixed = (over: Partial<NewNoteInput> = {}): NewNoteInput => ({
  id: over.id ?? 'n_test0001',
  text: over.text ?? 'first note',
  by: over.by ?? 'steven',
  kind: over.kind ?? 'human',
  createdAt: over.createdAt ?? '2026-05-05T12:00:00Z',
});

test('appendResearchNote: empty body grows the section from scratch', () => {
  const out = appendResearchNote('', fixed(), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first note\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: appends section to existing body, preserves prior content', () => {
  const body = '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n';
  const out = appendResearchNote(body, fixed({ text: 'Aunt Sally said Bell Labs' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n\n## Research notes\n\n### 2026-05-05\n- Aunt Sally said Bell Labs\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: new day inserts heading above existing entries', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- earlier note\n';
  const out = appendResearchNote(body, fixed({ id: 'n_n', text: 'newer note' }), { date: '2026-05-05' });
  assert.match(out, /### 2026-05-05\n- newer note\n  <!-- note id=n_n by=steven kind=human at=2026-05-05T12:00:00Z -->\n\n### 2026-05-04\n- earlier note\n/);
});

test('appendResearchNote: same day appends bullet under existing heading', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- first note of the day\n';
  const out = appendResearchNote(body, fixed({ id: 'n_2', text: 'second note of the day' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first note of the day\n- second note of the day\n  <!-- note id=n_2 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: agent kind round-trips into the trailer', () => {
  const out = appendResearchNote('', fixed({ kind: 'agent', by: 'editor-bot' }), { date: '2026-05-05' });
  assert.match(out, /<!-- note id=n_test0001 by=editor-bot kind=agent at=/);
});

test('appendResearchNote: derives date from createdAt UTC when no override', () => {
  const out = appendResearchNote('', fixed({ createdAt: '2026-05-06T03:14:00Z' }));
  assert.match(out, /### 2026-05-06\n/);
});

test('appendResearchNote: multi-line note keeps continuation indent and trailer last', () => {
  const out = appendResearchNote('', fixed({ text: 'first line\nsecond line' }), { date: '2026-05-05' });
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first line\n  second line\n  <!-- note id=n_test0001 by=steven kind=human at=2026-05-05T12:00:00Z -->\n',
  );
});

test('appendResearchNote: empty text is captured (not silently dropped)', () => {
  const out = appendResearchNote('', fixed({ text: '' }), { date: '2026-05-05' });
  assert.match(out, /- \(empty\)\n  <!-- note /);
});

test('appendResearchNote: section detection is case-sensitive (## research notes does NOT match)', () => {
  const body = '## research notes\n\n### 2026-05-04\n- something\n';
  const out = appendResearchNote(body, fixed({ id: 'n_n', text: 'newer' }), { date: '2026-05-05' });
  assert.match(out, /## research notes\s+### 2026-05-04/);
  assert.match(out, /## Research notes\s+### 2026-05-05\s+- newer\n  <!-- note /);
});

test('extractResearchNotesSection: returns empty when section is missing', () => {
  assert.equal(extractResearchNotesSection(''), '');
  assert.equal(extractResearchNotesSection('# Talk\n\n## Open\n\n- q\n'), '');
});

test('extractResearchNotesSection: returns section body without heading', () => {
  const body = '# Talk\n\n## Research notes\n\n### 2026-05-05\n- note\n';
  assert.equal(extractResearchNotesSection(body), '### 2026-05-05\n- note');
});

test('extractResearchNotesSection: stops at next ## heading', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- a\n\n## Sources\n\n- foo\n';
  assert.equal(extractResearchNotesSection(body), '### 2026-05-05\n- a');
});

test('extractResearchNotesSection: preserves multiple day headings', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- a\n\n### 2026-05-04\n- b\n';
  assert.equal(
    extractResearchNotesSection(body),
    '### 2026-05-05\n- a\n\n### 2026-05-04\n- b',
  );
});

test('parseResearchNotes: empty body → empty array', () => {
  assert.deepEqual(parseResearchNotes(''), []);
  assert.deepEqual(parseResearchNotes('# Talk\n\n## Open\n\n- q\n'), []);
});

test('parseResearchNotes: legacy bullet (no trailer) is read-only', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- aunt sally said x\n';
  const notes = parseResearchNotes(body);
  assert.equal(notes.length, 1);
  const n = notes[0]!;
  assert.equal(n.text, 'aunt sally said x');
  assert.equal(n.date, '2026-05-04');
  assert.equal(n.by, '(unknown)');
  assert.equal(n.kind, 'human');
  assert.equal(n.createdAt, null);
  assert.equal(n.editedAt, null);
  assert.equal(n.deletedAt, null);
  assert.equal(n.isLegacy, true);
  assert.match(n.id, /^n_legacy_2026-05-04_0$/);
});

test('parseResearchNotes: trailered bullet exposes all fields', () => {
  const body =
    '## Research notes\n\n' +
    '### 2026-05-06\n' +
    '- aunt sally said x\n' +
    '  <!-- note id=n_5w3kp9aq by=steven kind=human at=2026-05-06T14:23:00Z -->\n';
  const [n] = parseResearchNotes(body);
  assert.equal(n!.id, 'n_5w3kp9aq');
  assert.equal(n!.by, 'steven');
  assert.equal(n!.kind, 'human');
  assert.equal(n!.createdAt, '2026-05-06T14:23:00Z');
  assert.equal(n!.editedAt, null);
  assert.equal(n!.deletedAt, null);
  assert.equal(n!.isLegacy, false);
  assert.equal(n!.text, 'aunt sally said x');
});

test('parseResearchNotes: edited and deleted fields surface', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T14:00:00Z editedAt=2026-05-06T16:00:00Z editedBy=alice -->\n' +
    '- b\n' +
    '  <!-- note id=n_b by=agent kind=agent at=2026-05-06T15:00:00Z deletedAt=2026-05-06T17:00:00Z deletedBy=steven -->\n';
  const notes = parseResearchNotes(body);
  assert.equal(notes[0]!.editedAt, '2026-05-06T16:00:00Z');
  assert.equal(notes[0]!.editedBy, 'alice');
  assert.equal(notes[1]!.kind, 'agent');
  assert.equal(notes[1]!.deletedAt, '2026-05-06T17:00:00Z');
  assert.equal(notes[1]!.deletedBy, 'steven');
});

test('parseResearchNotes: multi-line bullet keeps continuation lines, trailer detached', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- first line\n' +
    '  second line\n' +
    '  third line\n' +
    '  <!-- note id=n_x by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const [n] = parseResearchNotes(body);
  assert.equal(n!.text, 'first line\nsecond line\nthird line');
  assert.equal(n!.id, 'n_x');
});

test('parseResearchNotes: newest day first, in-document order within day', () => {
  const body =
    '## Research notes\n\n' +
    '### 2026-05-06\n- a\n- b\n\n' +
    '### 2026-05-04\n- earlier\n';
  const notes = parseResearchNotes(body);
  assert.deepEqual(notes.map(n => n.text), ['a', 'b', 'earlier']);
  assert.deepEqual(notes.map(n => n.date), ['2026-05-06', '2026-05-06', '2026-05-04']);
});

test('parseResearchNotes: legacy synthetic ids are unique per (date, position)', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- a\n- b\n- c\n';
  const ids = parseResearchNotes(body).map(n => n.id);
  assert.deepEqual(ids, [
    'n_legacy_2026-05-04_0',
    'n_legacy_2026-05-04_1',
    'n_legacy_2026-05-04_2',
  ]);
});

test('parseResearchNotes: malformed trailer without id is treated as legacy', () => {
  const body =
    '## Research notes\n\n### 2026-05-06\n' +
    '- a\n' +
    '  <!-- note by=steven kind=human at=2026-05-06T14:00:00Z -->\n';
  const [n] = parseResearchNotes(body);
  assert.equal(n!.isLegacy, true);
  assert.equal(n!.by, '(unknown)');
  assert.match(n!.id, /^n_legacy_2026-05-06_0$/);
});

test('NoteNotFoundError carries noteId and standard name', () => {
  const e = new NoteNotFoundError('n_abc');
  assert.equal(e.name, 'NoteNotFoundError');
  assert.equal(e.noteId, 'n_abc');
  assert.match(e.message, /n_abc/);
});

test('NoteDeletedError carries noteId and standard name', () => {
  const e = new NoteDeletedError('n_abc');
  assert.equal(e.name, 'NoteDeletedError');
  assert.equal(e.noteId, 'n_abc');
});

test('NoteAlreadyDeletedError carries noteId and standard name', () => {
  const e = new NoteAlreadyDeletedError('n_abc');
  assert.equal(e.name, 'NoteAlreadyDeletedError');
  assert.equal(e.noteId, 'n_abc');
});
