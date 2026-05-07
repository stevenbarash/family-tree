import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconstructNoteHistory,
  type NoteVersion,
} from '../../src/pages/research-notes-history.ts';

function v(body: string, commitId: string, commitTime: string): NoteVersion {
  return { body, commitId, commitTime };
}

const HEADING = '## Research notes\n\n### 2026-05-06\n';

test('reconstructNoteHistory: empty when noteId never appears', () => {
  const events = reconstructNoteHistory(
    [v(HEADING + '- other\n  <!-- note id=n_other by=s kind=human at=2026-05-06T10:00:00Z -->\n', 'c1', '2026-05-06T10:00:00Z')],
    'n_missing',
  );
  assert.deepEqual(events, []);
});

test('reconstructNoteHistory: created-only history yields one event', () => {
  const body =
    HEADING +
    '- first observation\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const events = reconstructNoteHistory(
    [v(body, 'c1', '2026-05-06T10:00:00Z')],
    'n_a',
  );
  assert.deepEqual(events, [
    { kind: 'created', at: '2026-05-06T10:00:00Z', by: 'steven' },
  ]);
});

test('reconstructNoteHistory: single edit emits create + edit with prevText', () => {
  const v1 =
    HEADING +
    '- v1 text\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const v2 =
    HEADING +
    '- v2 text\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T11:00:00Z editedBy=steven -->\n';
  const events = reconstructNoteHistory(
    [v(v1, 'c1', '2026-05-06T10:00:00Z'), v(v2, 'c2', '2026-05-06T11:00:00Z')],
    'n_a',
  );
  // newest-first
  assert.deepEqual(events, [
    { kind: 'edited', at: '2026-05-06T11:00:00Z', by: 'steven', prevText: 'v1 text' },
    { kind: 'created', at: '2026-05-06T10:00:00Z', by: 'steven' },
  ]);
});

test('reconstructNoteHistory: two edits — second prevText is v2 text, not v1', () => {
  const v1 =
    HEADING +
    '- v1\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const v2 =
    HEADING +
    '- v2\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T11:00:00Z editedBy=alice -->\n';
  const v3 =
    HEADING +
    '- v3\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T12:00:00Z editedBy=bob -->\n';
  const events = reconstructNoteHistory(
    [
      v(v1, 'c1', '2026-05-06T10:00:00Z'),
      v(v2, 'c2', '2026-05-06T11:00:00Z'),
      v(v3, 'c3', '2026-05-06T12:00:00Z'),
    ],
    'n_a',
  );
  assert.deepEqual(events, [
    { kind: 'edited', at: '2026-05-06T12:00:00Z', by: 'bob', prevText: 'v2' },
    { kind: 'edited', at: '2026-05-06T11:00:00Z', by: 'alice', prevText: 'v1' },
    { kind: 'created', at: '2026-05-06T10:00:00Z', by: 'steven' },
  ]);
});

test('reconstructNoteHistory: retract then restore', () => {
  const v1 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const v2 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z deletedAt=2026-05-06T11:00:00Z deletedBy=steven -->\n';
  const v3 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z restoredAt=2026-05-06T12:00:00Z restoredBy=alice -->\n';
  const events = reconstructNoteHistory(
    [
      v(v1, 'c1', '2026-05-06T10:00:00Z'),
      v(v2, 'c2', '2026-05-06T11:00:00Z'),
      v(v3, 'c3', '2026-05-06T12:00:00Z'),
    ],
    'n_a',
  );
  assert.deepEqual(events, [
    { kind: 'restored', at: '2026-05-06T12:00:00Z', by: 'alice' },
    { kind: 'retracted', at: '2026-05-06T11:00:00Z', by: 'steven' },
    { kind: 'created', at: '2026-05-06T10:00:00Z', by: 'steven' },
  ]);
});

test('reconstructNoteHistory: pre-spec restore (no restoredAt/restoredBy) falls back to commit time + null by', () => {
  const v1 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const v2 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z deletedAt=2026-05-06T11:00:00Z deletedBy=steven -->\n';
  // v3 simulates a restore that happened before the trailer schema gained restoredAt/restoredBy
  const v3 =
    HEADING +
    '- a\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const events = reconstructNoteHistory(
    [
      v(v1, 'c1', '2026-05-06T10:00:00Z'),
      v(v2, 'c2', '2026-05-06T11:00:00Z'),
      v(v3, 'c3', '2026-05-06T12:30:00Z'),
    ],
    'n_a',
  );
  assert.deepEqual(events[0], { kind: 'restored', at: '2026-05-06T12:30:00Z', by: null });
});

test('reconstructNoteHistory: created event for legacy bullet has null at/by', () => {
  const body = HEADING + '- legacy line with no trailer\n';
  const events = reconstructNoteHistory(
    [v(body, 'c1', '2026-05-06T10:00:00Z')],
    'n_legacy_2026-05-06_0',
  );
  assert.deepEqual(events, [{ kind: 'created', at: null, by: null }]);
});

test('reconstructNoteHistory: full lifecycle — created, edited, retracted, restored, edited', () => {
  const a =
    HEADING +
    '- v1\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z -->\n';
  const b =
    HEADING +
    '- v2\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T11:00:00Z editedBy=steven -->\n';
  const c =
    HEADING +
    '- v2\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T11:00:00Z editedBy=steven deletedAt=2026-05-06T12:00:00Z deletedBy=alice -->\n';
  const d =
    HEADING +
    '- v2\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T11:00:00Z editedBy=steven restoredAt=2026-05-06T13:00:00Z restoredBy=bob -->\n';
  const e =
    HEADING +
    '- v3\n' +
    '  <!-- note id=n_a by=steven kind=human at=2026-05-06T10:00:00Z editedAt=2026-05-06T14:00:00Z editedBy=carol restoredAt=2026-05-06T13:00:00Z restoredBy=bob -->\n';
  const events = reconstructNoteHistory(
    [
      v(a, 'c1', '2026-05-06T10:00:00Z'),
      v(b, 'c2', '2026-05-06T11:00:00Z'),
      v(c, 'c3', '2026-05-06T12:00:00Z'),
      v(d, 'c4', '2026-05-06T13:00:00Z'),
      v(e, 'c5', '2026-05-06T14:00:00Z'),
    ],
    'n_a',
  );
  assert.deepEqual(events, [
    { kind: 'edited', at: '2026-05-06T14:00:00Z', by: 'carol', prevText: 'v2' },
    { kind: 'restored', at: '2026-05-06T13:00:00Z', by: 'bob' },
    { kind: 'retracted', at: '2026-05-06T12:00:00Z', by: 'alice' },
    { kind: 'edited', at: '2026-05-06T11:00:00Z', by: 'steven', prevText: 'v1' },
    { kind: 'created', at: '2026-05-06T10:00:00Z', by: 'steven' },
  ]);
});
