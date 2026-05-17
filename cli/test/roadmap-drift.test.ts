// ROADMAP ↔ CHANGELOG drift guard.
//
// The platform-review IDs (P0.1, P0.3, P1.5, etc.) are how the roadmap
// table at docs/ROADMAP.md tracks what's shipped, in-flight, and ready.
// CHANGELOG.md is the source-of-truth record of what actually shipped
// (kept honest by the changelog-nudge hook on every feat/fix commit).
// When those two disagree — work that landed without a roadmap status
// bump — we pick stale items, write redundant work, and the user has to
// triage by reading both files manually.
//
// Two crisp cross-checks:
//
//   (A) Every roadmap row marked `✅ shipped` MUST have its P-ID
//       mentioned somewhere in CHANGELOG.md. Catches the case where
//       someone flipped the status without writing the entry.
//
//   (B) Every CHANGELOG passage that explicitly says it "closes" /
//       "closes platform-review" / "completes" / "ships" a P-ID
//       MUST find a `✅ shipped` row in the roadmap. Catches the case
//       where work landed (with proper CHANGELOG attribution) but the
//       roadmap row was never advanced.
//
// Mentions of a P-ID without an explicit shipping verb are exempt from
// check (B) — "in progress" / "partial close" / "addresses" entries
// legitimately don't claim completion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const ROADMAP = join(REPO_ROOT, 'docs/ROADMAP.md');
const CHANGELOG = join(REPO_ROOT, 'CHANGELOG.md');

// Anything matching this regex is a "ships" claim. Word boundaries on
// both sides; tolerates "closes platform-review P0.3" / "closes P0.3" /
// "Closes P0.3" / "completes P0.3" / "ships P0.3".
//
// Negative lookbehind on "partial " / "partially " so that explicitly
// partial entries ("Partial close on platform-review P2.5") aren't
// treated as full-ship claims. Convention: use "addresses" / "lands" /
// "starts" for incremental progress, and "closes" / "completes" / "ships"
// only when the roadmap row can also flip to ✅.
const SHIP_VERB_RE = /(?<!\bpartial(?:ly)?\s)\b(?:closes?|closed|completes?|completed|ships?|shipped|finished|finishes)\b[^\n.]*?\bP(\d+\.\d+)\b/gi;

// Any mention of a P-ID, ship-verb or not.
const PID_RE = /\bP(\d+\.\d+)\b/g;

// Roadmap row format: `| <status-icon> ... | **P0.3** ... |`. We extract
// (status, pid) pairs. The status column also has free text like "shipped"
// after the icon ("✅ shipped"), so we just grab the first token.
const ROW_RE = /^\|\s*(✅|⏳|🚧|🔧|📦)\s*[^|]*\|\s*\*\*P(\d+\.\d+)\*\*/gm;

interface RoadmapRow {
  status: string;
  pid: string;
  line: number;
}

function readRoadmapRows(): RoadmapRow[] {
  const text = readFileSync(ROADMAP, 'utf8');
  const rows: RoadmapRow[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    ROW_RE.lastIndex = 0;
    const m = ROW_RE.exec(line);
    if (m) rows.push({ status: m[1]!, pid: m[2]!, line: i + 1 });
  });
  return rows;
}

function changelogText(): string {
  return readFileSync(CHANGELOG, 'utf8');
}

function pidsMentionedInChangelog(): Set<string> {
  const found = new Set<string>();
  const text = changelogText();
  let m: RegExpExecArray | null;
  PID_RE.lastIndex = 0;
  while ((m = PID_RE.exec(text)) !== null) found.add(m[1]!);
  return found;
}

// Returns one entry per ship-verb hit so the test message can point at the
// exact CHANGELOG line where the claim was made.
function shipClaimsInChangelog(): Array<{ pid: string; line: number; snippet: string }> {
  const claims: Array<{ pid: string; line: number; snippet: string }> = [];
  const text = changelogText();
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    SHIP_VERB_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SHIP_VERB_RE.exec(line)) !== null) {
      claims.push({
        pid: m[1]!,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return claims;
}

test('roadmap-drift (A): every ✅ shipped row has its P-ID mentioned in CHANGELOG', () => {
  const rows = readRoadmapRows();
  const mentioned = pidsMentionedInChangelog();
  const orphans = rows
    .filter(r => r.status === '✅' && !mentioned.has(r.pid))
    .map(r => `ROADMAP.md:${r.line} marks P${r.pid} as ✅ shipped, but P${r.pid} is not mentioned anywhere in CHANGELOG.md. Add an entry under ## [Unreleased] or in a released section.`);
  assert.deepEqual(orphans, [], `roadmap drift (✅ without CHANGELOG):\n  - ${orphans.join('\n  - ')}`);
});

test('roadmap-drift (B): every CHANGELOG "closes P#.#" claim has a ✅ shipped roadmap row', () => {
  const claims = shipClaimsInChangelog();
  const rows = readRoadmapRows();
  // A pid is "shipped" on the roadmap if ANY row for that pid is ✅. (Some
  // pids appear in multiple bands as carry-overs — e.g. P1.5 in Now + Next.)
  const shippedPids = new Set(rows.filter(r => r.status === '✅').map(r => r.pid));
  // Some P-IDs are referenced in CHANGELOG but don't yet have a roadmap row
  // at all — that's a separate problem (roadmap is incomplete), and we
  // don't want to false-fail on it here. Restrict to pids the roadmap
  // actually tracks.
  const roadmapPids = new Set(rows.map(r => r.pid));
  const drift: string[] = [];
  for (const c of claims) {
    if (!roadmapPids.has(c.pid)) continue;
    if (shippedPids.has(c.pid)) continue;
    drift.push(
      `CHANGELOG.md:${c.line} claims to ship P${c.pid} ("${c.snippet}"), but no roadmap row for P${c.pid} is marked ✅. Promote the row in docs/ROADMAP.md.`,
    );
  }
  assert.deepEqual(drift, [], `roadmap drift (CHANGELOG ships → ROADMAP stale):\n  - ${drift.join('\n  - ')}`);
});
