import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConflicts } from '../../src/family/conflicts.ts';

function withGenealogyDir(setup: (dir: string) => void, body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'conflicts-'));
  try {
    setup(dir);
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('loadConflicts: returns [] for unknown record', () => {
  withGenealogyDir(() => {}, (dir) => {
    assert.deepEqual(loadConflicts(dir, 'I999'), []);
  });
});

test('loadConflicts: returns [] for non-record-id input', () => {
  withGenealogyDir(() => {}, (dir) => {
    assert.deepEqual(loadConflicts(dir, '../etc/passwd'), []);
  });
});

test('loadConflicts: parses a valid conflicts file', () => {
  withGenealogyDir(
    (dir) => {
      mkdirSync(join(dir, 'conflicts'));
      writeFileSync(
        join(dir, 'conflicts', 'I123.yml'),
        `record: I123
conflicts:
  - field: birth.date
    values:
      - value: "24 Apr 1938"
        source: "1950 US Census"
        weight: 0.7
      - value: "25 Apr 1938"
        source: "Newspaper birth notice"
        weight: 0.6
    note: "Census likely correct."
`,
      );
    },
    (dir) => {
      const out = loadConflicts(dir, 'I123');
      assert.equal(out.length, 1);
      assert.equal(out[0]!.field, 'birth.date');
      assert.equal(out[0]!.values.length, 2);
      assert.equal(out[0]!.values[0]!.value, '24 Apr 1938');
      assert.equal(out[0]!.values[0]!.source, '1950 US Census');
      assert.equal(out[0]!.note, 'Census likely correct.');
    },
  );
});

test('loadConflicts: rejects entries with fewer than 2 values', () => {
  withGenealogyDir(
    (dir) => {
      mkdirSync(join(dir, 'conflicts'));
      writeFileSync(
        join(dir, 'conflicts', 'I123.yml'),
        `record: I123
conflicts:
  - field: birth.date
    values:
      - value: "1938"
`,
      );
    },
    (dir) => {
      assert.deepEqual(loadConflicts(dir, 'I123', () => {}), []);
    },
  );
});

test('loadConflicts: keeps valid entries when file mixes valid + invalid', () => {
  withGenealogyDir(
    (dir) => {
      mkdirSync(join(dir, 'conflicts'));
      writeFileSync(
        join(dir, 'conflicts', 'I123.yml'),
        `record: I123
conflicts:
  - field: birth.date
    values:
      - value: "24 Apr 1938"
      - value: "25 Apr 1938"
  - field: brth.date
    values:
      - value: a
      - value: b
  - field: death.place
    values:
      - value: Kiev
      - value: Petah Tiqwa
`,
      );
    },
    (dir) => {
      const logs: string[] = [];
      const out = loadConflicts(dir, 'I123', m => logs.push(m));
      assert.equal(out.length, 2);
      assert.equal(out[0]!.field, 'birth.date');
      assert.equal(out[1]!.field, 'death.place');
      assert.equal(logs.length, 1);
      assert.match(logs[0]!, /entry 1 ignored/);
    },
  );
});

test('loadConflicts: rejects entries with malformed field path', () => {
  withGenealogyDir(
    (dir) => {
      mkdirSync(join(dir, 'conflicts'));
      writeFileSync(
        join(dir, 'conflicts', 'I123.yml'),
        `record: I123
conflicts:
  - field: brth.date
    values:
      - value: a
      - value: b
`,
      );
    },
    (dir) => {
      assert.deepEqual(loadConflicts(dir, 'I123', () => {}), []);
    },
  );
});

test('loadConflicts: rejects entries missing field', () => {
  withGenealogyDir(
    (dir) => {
      mkdirSync(join(dir, 'conflicts'));
      writeFileSync(
        join(dir, 'conflicts', 'I123.yml'),
        `record: I123
conflicts:
  - values:
      - value: "a"
      - value: "b"
`,
      );
    },
    (dir) => {
      assert.deepEqual(loadConflicts(dir, 'I123', () => {}), []);
    },
  );
});
