import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendResearchNote, extractResearchNotesSection } from '../../src/pages/research-notes.ts';

test('appendResearchNote: empty body grows the section from scratch', () => {
  const out = appendResearchNote('', '2026-05-05', 'first note');
  assert.equal(out, '## Research notes\n\n### 2026-05-05\n- first note\n');
});

test('appendResearchNote: appends section to existing body, preserves prior content', () => {
  const body = '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n';
  const out = appendResearchNote(body, '2026-05-05', 'Aunt Sally said Bell Labs');
  assert.equal(
    out,
    '# Talk\n\n## Open questions\n\n- when did he move to Brooklyn?\n\n## Research notes\n\n### 2026-05-05\n- Aunt Sally said Bell Labs\n',
  );
});

test('appendResearchNote: new day inserts heading above existing entries', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- earlier note\n';
  const out = appendResearchNote(body, '2026-05-05', 'newer note');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- newer note\n\n### 2026-05-04\n- earlier note\n',
  );
});

test('appendResearchNote: same day appends bullet under existing heading', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- first note of the day\n';
  const out = appendResearchNote(body, '2026-05-05', 'second note of the day');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first note of the day\n- second note of the day\n',
  );
});

test('appendResearchNote: same day, existing heading has multiple entries', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- a\n- b\n\n### 2026-05-04\n- earlier\n';
  const out = appendResearchNote(body, '2026-05-05', 'c');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- a\n- b\n- c\n\n### 2026-05-04\n- earlier\n',
  );
});

test('appendResearchNote: new day with section that has trailing content under another heading', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- earlier\n\n## Sources\n\n- foo\n';
  const out = appendResearchNote(body, '2026-05-05', 'newer');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- newer\n\n### 2026-05-04\n- earlier\n\n## Sources\n\n- foo\n',
  );
});

test('appendResearchNote: multi-line note indents continuation lines', () => {
  const out = appendResearchNote('', '2026-05-05', 'first line\nsecond line\nthird line');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- first line\n  second line\n  third line\n',
  );
});

test('appendResearchNote: multi-line note with blank line between paragraphs', () => {
  const out = appendResearchNote('', '2026-05-05', 'para one\n\npara two');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- para one\n\n  para two\n',
  );
});

test('appendResearchNote: trims trailing whitespace from input note', () => {
  const out = appendResearchNote('', '2026-05-05', 'note text   \n\n  ');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- note text\n',
  );
});

test('appendResearchNote: empty note input is captured (not silently dropped)', () => {
  const out = appendResearchNote('', '2026-05-05', '');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- (empty)\n',
  );
});

test('appendResearchNote: section detection is case-sensitive (## research notes does NOT match)', () => {
  const body = '## research notes\n\n### 2026-05-04\n- something\n';
  const out = appendResearchNote(body, '2026-05-05', 'newer');
  // The pre-existing `## research notes` (lowercase) is treated as unrelated;
  // a new `## Research notes` section is appended.
  assert.match(out, /## research notes\s+### 2026-05-04/);
  assert.match(out, /## Research notes\s+### 2026-05-05\s+- newer/);
});

test('appendResearchNote: section at end of body without trailing newline', () => {
  const body = '## Research notes\n\n### 2026-05-04\n- earlier';
  const out = appendResearchNote(body, '2026-05-05', 'newer');
  assert.match(out, /### 2026-05-05\n- newer/);
  assert.match(out, /### 2026-05-04\n- earlier/);
});

test('appendResearchNote: same day with another section following', () => {
  const body = '## Research notes\n\n### 2026-05-05\n- a\n\n## Sources\n\n- foo\n';
  const out = appendResearchNote(body, '2026-05-05', 'b');
  assert.equal(
    out,
    '## Research notes\n\n### 2026-05-05\n- a\n- b\n\n## Sources\n\n- foo\n',
  );
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
