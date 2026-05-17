# GEDCOM 5.5.1 → 7.0.18 Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `~/whoami/genealogy/barash-tree.ged` from GEDCOM 5.5.1 to 7.0.18 (released 2026-02-17) and switch the project's parser library from `parse-gedcom@2.0.1` (5.5.1-only) to a v7-aware one. The two changes are coupled — converting the file alone breaks the parser; swapping the parser alone has nothing to parse. Both land on one branch.

**Status (shipped 2026-05-17):** the plan originally targeted `gedcom-ts@^2026.5.2` from npm, but during execution that package was rejected as a supply-chain risk (published <24h prior, no GitHub repo link in npm metadata, single maintainer, contradictory publisher attribution). Pivoted to **vendoring `gedcom7code/js-gedcom`** from GitHub — same trust profile as the c-converter (Luther Tychonievich, the v7 spec editor), public-domain license, single self-contained file (`gedcstruct.mjs`, 434 lines), no runtime dependencies. The vendor file carries one local patch (orphan pointer preservation, documented inline). Two follow-on derive-layer changes also landed in the same pass: read v7's `EXID` tag in place of Ancestry's 5.5.1-era `_APID`, and prefer `DATE.PHRASE` substructure when present (where the converter parked non-canonical date forms like year-ranges).

**Architecture:** The project's GEDCOM I/O lives entirely in `core/src/gedcom/`. `parser.ts` is the thin normalization layer over `parse-gedcom`'s unist-style tree; `derive.ts` consumes the normalized tree and writes per-individual YAMLs to `genealogy/derived/`. The upgrade rewrites `parser.ts` to consume `gedcom-ts`'s tree shape; `derive.ts` and everything downstream stays unchanged (verified by YAML-diff parity check).

**Tech Stack:** New npm dep `gedcom-ts@^2026.5.2`. New external tool `gedcom7code/c-converter` (built once from source, used to convert the .ged file). Tests stay on `node:test` + `node:assert/strict` via `tsx --test`. No changes to frontend or CLI command surface — only the wire format of the parser's internal tree.

**Pre-existing backup:** `genealogy/barash-tree.ged.5.5.1-backup-20260517-190228` (SHA `53919d78f43977ca89a916f56860ea1c4fe3e0ad03cf623200d7f8388bc28ed`).

---

## Scope (v1)

**In:**
- One-time conversion of `barash-tree.ged` from 5.5.1 → 7.0.18 using the official `gedcom7code/c-converter`.
- Parser library swap: `parse-gedcom@2.0.1` → `gedcom-ts@^2026.5.2`.
- Rewrite of `core/src/gedcom/parser.ts` normalization layer against the new library's tree shape.
- YAML-diff parity verification of `genealogy/derived/*.yml` before vs after.
- Test suite (`core` 488 + `cli` 304 + `frontend` 81) green.
- CHANGELOG entry; plan-index update; `TRANSLATION-BACKFILL.md` and any `AGENTS.md` references to the parser updated.

**Out (deferred):**
- **GEDZIP support.** v7 introduces `.gedz` (zipped GEDCOM with attached media). Out of scope; our media are referenced by path, not embedded.
- **Schema validation as a `wai check` category.** `gedcom-ts` parses but doesn't fully validate; vendoring `js-gedcom` (validator by spec author) is a separate plan.
- **Migration of `genealogy/snapshots.yml` snapshot pointers.** SHA-based; carries forward unchanged.
- **Re-derivation of `derived/` from scratch.** Done as a verification step (re-run `wai sync-gedcom`), not a content change.

---

## File structure

| File | Role |
|---|---|
| `core/src/gedcom/parser.ts` (rewrite) | Replace `parse-gedcom` import + `normalize()` with `gedcom-ts` equivalent. Public surface (`ParseResult`, `parseGedcomFile`) unchanged. |
| `core/src/gedcom/types.ts` (modify, minimal) | `GedcomNode` shape stays the same; one comment update if the new library exposes tag/data/tree differently. |
| `core/package.json` (modify) | Drop `parse-gedcom`, add `gedcom-ts`. |
| `core/test/gedcom/parser.test.ts` (modify) | Existing tests against a small in-memory 5.5.1 fixture get a v7 sibling test using the same fixture in v7 form. |
| `genealogy/barash-tree.ged` (replace) | Output of the c-converter. The 5.5.1-backup file stays in place under a `.5.5.1-backup-*` suffix. |
| `genealogy/derived/*.yml` (re-derived) | Output of `wai sync-gedcom` against the new .ged. Should diff cosmetically only. |
| `CHANGELOG.md` (modify) | Entry under `## [Unreleased]` → `### Changed`. |
| `docs/superpowers/plans/README.md` (modify) | Add a row for this plan. Update status as we progress. |
| `TRANSLATION-BACKFILL.md` (modify, light) | Note the GEDCOM version change in the "infrastructure" section if applicable. |

The `5.5.1-backup-*` file should be added to `.gitignore` after this plan ships, OR moved out of the repo entirely (since it duplicates the v7 source). Keep it for one cycle as a safety net, then remove in a follow-up.

---

## Task 1: Build the c-converter

**Files:** none in this repo; tool lives in a sibling workspace.

- [ ] **Step 1: Clone gedcom7code/c-converter**

```bash
mkdir -p ~/dev/_tools && cd ~/dev/_tools
git clone https://github.com/gedcom7code/c-converter.git
cd c-converter
```

- [ ] **Step 2: Build the converter**

Inspect the repo's README for build instructions; typically `make` or `cc -o gedcom7-convert *.c`. If a Makefile exists, run `make`. Confirm the binary works:

```bash
./gedcom7-convert --version  # or --help, depending on what the tool prints
```

If build fails on macOS (likely cause: missing `getline` or POSIX flag): use `cc -D_POSIX_C_SOURCE=200809L -std=c99 -o gedcom7-convert *.c`.

**Verification:** binary exists and prints something coherent for `--help`. Stop and report if the converter has been renamed or relicensed since this plan was written.

---

## Task 2: Convert the .ged file + sanity-check output

**Files:** `genealogy/barash-tree.ged` (replaced); a temp file for the v7 output before swap.

- [ ] **Step 1: Run the conversion to a temp file**

```bash
cd ~/whoami
~/dev/_tools/c-converter/gedcom7-convert \
  --input genealogy/barash-tree.ged \
  --output /tmp/barash-tree.v7.ged \
  2>&1 | tee /tmp/conversion.log
```

The exact flag names depend on the converter binary — check `--help`. Some versions auto-detect input format and just take `infile outfile` positionals.

- [ ] **Step 2: Sanity-check the output structure**

Expected after conversion:

```bash
head -25 /tmp/barash-tree.v7.ged | grep -E "^1 GEDC|^2 VERS|^1 CHAR|^1 SCHMA"
```

Should show `2 VERS 7.0` (not 5.5.1), `1 CHAR UTF-8` retained, and a new `1 SCHMA` block declaring the `_APID`, `_WDTH`, `_HGHT` etc. extensions. **Do NOT** see `2 FORM LINEAGE-LINKED` (removed in v7).

```bash
# Should be 0:
grep -c "^[0-9] CONC " /tmp/barash-tree.v7.ged
# Should be 0:
grep -c "^2 FORM LINEAGE-LINKED" /tmp/barash-tree.v7.ged
# Should match 5.5.1 count exactly (193 individuals):
grep -c "^0 @I.* INDI$" /tmp/barash-tree.v7.ged
# Should match 5.5.1 count exactly:
grep -c "^0 @F.* FAM$" /tmp/barash-tree.v7.ged
```

Stop here and inspect the conversion log if any count mismatches. The converter should never lose records.

- [ ] **Step 3: Verify our Leybka fix survived the conversion**

The 2026-05-17 GEDCOM correction (Leybka SEX F→M for `@I372572740902@`) MUST be preserved by the converter. The `2 NOTE` substructure on the SEX line is valid in both versions but rare — verify the converter didn't strip it.

```bash
grep -A2 "^0 @I372572740902@ INDI" /tmp/barash-tree.v7.ged | head -10
```

Expected: shows `1 SEX M` and the `2 NOTE Corrected from F to M...` line directly under it. If the NOTE is gone, restore it manually.

- [ ] **Step 4: Replace the live file**

```bash
cp /tmp/barash-tree.v7.ged genealogy/barash-tree.ged
```

**Verification:** `head -25 genealogy/barash-tree.ged` shows the v7 header. The 5.5.1-backup file is still in place. Don't commit yet — parser swap (Task 4) must land in the same commit to keep the system functional.

---

## Task 3: Add gedcom-ts dependency

**Files:** `core/package.json`, `core/package-lock.json` (regenerated).

- [ ] **Step 1: Swap the dependency**

```bash
cd ~/dev/whoami/core
npm uninstall parse-gedcom
npm install gedcom-ts@^2026.5.2
```

- [ ] **Step 2: Inspect the new library's API surface**

Before rewriting `parser.ts`, read enough of `gedcom-ts` to know what to call:

```bash
cat node_modules/gedcom-ts/README.md | head -100
ls node_modules/gedcom-ts/dist/
# Type defs likely at node_modules/gedcom-ts/dist/index.d.ts
head -60 node_modules/gedcom-ts/dist/index.d.ts
```

Note: the package name "gedcom-ts" may have shifted import shape since this plan was written. Adapt accordingly.

**Verification:** `npm test` (currently passing 488/488 in core) will fail at the `parse-gedcom` import in `parser.ts` — that's expected; rewrite in Task 4.

---

## Task 4: Rewrite the parser normalization layer

**Files:** `core/src/gedcom/parser.ts` (rewrite); `core/src/gedcom/types.ts` (verify GedcomNode shape still works); `core/test/gedcom/parser.test.ts` (extend).

- [ ] **Step 1: Write a v7-fixture test first**

Append to `core/test/gedcom/parser.test.ts`:

```typescript
test('parseGedcomFile: parses a v7.0 minimal fixture', async () => {
  const fixture = `0 HEAD
1 GEDC
2 VERS 7.0
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Alice /Smith/
1 SEX F
1 BIRT
2 DATE 1 JAN 1900
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
0 TRLR
`;
  const tmp = await writeTmpFile(fixture);
  const result = await parseGedcomFile(tmp);
  assert.equal(result.individuals.size, 1);
  assert.equal(result.individuals.get('I1')?.tag, 'INDI');
  const name = result.individuals.get('I1')?.tree.find(n => n.tag === 'NAME');
  assert.equal(name?.data, 'Alice /Smith/');
});
```

This test will fail until Task 4 step 2 lands. The existing 5.5.1 fixture test should also keep passing (the new parser library accepts both 5.5.1 and 7.0 in most implementations).

- [ ] **Step 2: Rewrite parser.ts**

The public surface (`ParseResult`, `parseGedcomFile`, `GedcomNode` shape with `tag` / `pointer` / `data` / `tree`) stays identical. The internal `normalize()` function rewrites against the new library's tree shape. Pseudocode:

```typescript
import { parse } from 'gedcom-ts';

export async function parseGedcomFile(path: string): Promise<ParseResult> {
  const text = readFileSync(path, 'utf-8');
  const tree = parse(text);  // exact API call shape TBD by Task 3 step 2

  // Walk top-level records, group by tag
  const individuals = new Map<string, GedcomNode>();
  const families = new Map<string, GedcomNode>();
  // ... mirror the existing grouping logic from parse-gedcom

  return { individuals, families, sources, media, raw };
}

function normalize(node: GedcomTsNode): GedcomNode {
  // Map gedcom-ts node shape → our GedcomNode shape (tag/pointer/data/tree)
  // Concrete mapping driven by what Task 3 step 2 showed.
}
```

- [ ] **Step 3: Run the parser tests**

```bash
cd ~/dev/whoami/core
npx tsx --test test/gedcom/parser.test.ts
```

Both the 5.5.1 fixture test (preserved) and the new 7.0 fixture test should pass. If the new library doesn't accept 5.5.1 syntax, drop the 5.5.1 test — the file we ship is v7.

**Verification:** parser tests green; the broader `core` test suite (which uses these parsers via `derive.ts`) may now fail in derive-related tests if the v7 tree exposes slightly different node shapes. Task 5 handles that.

---

## Task 5: Verify derive layer parity

**Files:** `core/src/gedcom/derive.ts` (potential minor changes); `genealogy/derived/*.yml` (re-derived for diff check).

- [ ] **Step 1: Snapshot the current derived YAMLs for diff**

```bash
cd ~/whoami
mkdir -p /tmp/derived-pre-v7
cp -r genealogy/derived/* /tmp/derived-pre-v7/
```

- [ ] **Step 2: Re-derive against the v7 file**

The frontend server must be down for this (sync-gedcom is HTTP-bound). Run via the CLI directly against `WHOAMI_ROOT`:

```bash
cd ~/whoami
WHOAMI_ROOT=~/whoami ~/dev/whoami/cli/dist/wai.cjs sync-gedcom \
  --ged-file barash-tree.ged \
  --notes "Re-derive after GEDCOM 5.5.1 → 7.0.18 conversion"
```

This will fail if the parser rewrite (Task 4) hasn't been built into the dist bundle yet — rebuild first:

```bash
cd ~/dev/whoami/cli && npm run build
```

- [ ] **Step 3: Diff the YAMLs**

```bash
diff -r /tmp/derived-pre-v7/ ~/whoami/genealogy/derived/ | head -40
```

Expected: **no semantic changes**. Acceptable diffs: pointer/snapshot SHA changes (always change when GEDCOM is re-imported), comment changes if the derive logic writes timestamps. **Not acceptable:** missing records, changed sex codes, changed dates, changed places, changed source citations. Stop and investigate any semantic diff.

- [ ] **Step 4: Spot-check a few representative records**

```bash
diff /tmp/derived-pre-v7/I372572740902.yml ~/whoami/genealogy/derived/I372572740902.yml  # Leybka (fixed earlier)
diff /tmp/derived-pre-v7/I372199154795.yml ~/whoami/genealogy/derived/I372199154795.yml  # Zus Krasnov
diff /tmp/derived-pre-v7/I28906360944.yml  ~/whoami/genealogy/derived/I28906360944.yml   # Steven Barash
```

**Verification:** all three diffs are cosmetic or empty.

---

## Task 6: Full test suite + frontend smoke

**Files:** none modified; runs only.

- [ ] **Step 1: Core tests**

```bash
cd ~/dev/whoami/core && npm run typecheck && npm test
```

Expect 488/488 green.

- [ ] **Step 2: CLI tests**

```bash
cd ~/dev/whoami/cli && npm run typecheck && npm test
```

Expect 301+/304 green (3 skipped — known pre-existing).

- [ ] **Step 3: Frontend tests**

```bash
cd ~/dev/whoami/frontend && npx tsc --noEmit && npm test
```

Expect 75+/81 green (6 skipped — known pre-existing).

- [ ] **Step 4: Manual smoke: read a page that uses GEDCOM-derived fields**

```bash
WHOAMI_ROOT=~/whoami ~/dev/whoami/cli/dist/wai.cjs read steven-barash 2>&1 | head -20
```

Should print the infobox-person block with `born:`, `birthplace:`, etc. populated.

- [ ] **Step 5: Run `wai check` for drift**

```bash
WHOAMI_ROOT=~/whoami ~/dev/whoami/cli/dist/wai.cjs check 2>&1 | tail -10
```

Expect approximately the same finding count as before (~260 advisory). Any NEW schema/data findings need investigation.

**Verification:** all four green.

---

## Task 7: Docs + CHANGELOG + plan-index update

**Files:** `CHANGELOG.md`, `docs/superpowers/plans/README.md`, `TRANSLATION-BACKFILL.md` (light note), `core/src/gedcom/parser.ts` doc-comment.

- [ ] **Step 1: CHANGELOG entry**

Under `## [Unreleased]` → `### Changed`, add:

```markdown
- **GEDCOM 5.5.1 → 7.0.18:** Source `genealogy/barash-tree.ged` converted using `gedcom7code/c-converter` (official, public-domain, by the v7 spec editor). Parser library swapped from `parse-gedcom@2.0.1` (5.5.1-only) to `gedcom-ts@^2026.5.2` (v7-aware, TypeScript). Parser normalization layer in `core/src/gedcom/parser.ts` rewritten against the new tree shape; public surface (`ParseResult`, `GedcomNode`) preserved. Derived YAMLs re-synced; diff against pre-v7 derivation was cosmetic-only. Old 5.5.1 file preserved at `genealogy/barash-tree.ged.5.5.1-backup-20260517-190228` for one cycle then archived.
```

- [ ] **Step 2: Plan-index row**

Append to `docs/superpowers/plans/README.md`:

```markdown
| ✅ | [`2026-05-17-gedcom-7-upgrade.md`](./2026-05-17-gedcom-7-upgrade.md) | GEDCOM 5.5.1 → 7.0.18 upgrade | File converted via `gedcom7code/c-converter`; parser swapped from `parse-gedcom` to `gedcom-ts`; derived YAML parity verified. |
```

Increment the `**Total: N plans**` footer.

- [ ] **Step 3: Parser doc-comment**

Update the doc-comment at the top of `core/src/gedcom/parser.ts` to mention v7 and `gedcom-ts` instead of 5.5.1 and `parse-gedcom`. Drop the `parse-gedcom` 0.1.x compatibility shim — the new library has its own tree shape and there's no need to handle two parsers.

- [ ] **Step 4: TRANSLATION-BACKFILL.md note** (optional)

The translation pipeline reads GEDCOM-derived sex through the same parser path. Add a one-line note in the "infrastructure" section noting the GEDCOM version bump.

---

## Task 8: Commit + push

**Files:** all of the above.

- [ ] **Step 1: Stage and commit on a feature branch**

```bash
cd ~/dev/whoami
git checkout -b feat/gedcom-7-upgrade
git add core/src/gedcom/parser.ts core/test/gedcom/parser.test.ts \
        core/package.json core/package-lock.json \
        CHANGELOG.md docs/superpowers/plans/README.md \
        docs/superpowers/plans/2026-05-17-gedcom-7-upgrade.md
git commit -m "feat: GEDCOM 5.5.1 → 7.0.18 (parser + source file)

Source genealogy/barash-tree.ged converted via gedcom7code/c-converter.
Parser swapped from parse-gedcom@2.0.1 (5.5.1-only) to gedcom-ts@^2026.5.2.
core/src/gedcom/parser.ts rewritten against new tree shape; public
surface preserved. Derived YAMLs re-synced; diff was cosmetic-only.
Old .ged preserved as .5.5.1-backup-20260517-190228 for one cycle."
git push -u origin feat/gedcom-7-upgrade
```

- [ ] **Step 2: Data-repo commit** (separate; the .ged file lives there)

```bash
cd ~/whoami
git add genealogy/barash-tree.ged genealogy/derived/
git commit -m "gedcom: convert barash-tree.ged 5.5.1 → 7.0.18

Converted via gedcom7code/c-converter. SCHMA block registers 10
vendor extensions (_APID/_OID/_WDTH/etc.); CONC tags folded; 52
year-range date phrases moved to PHRASE substructures; CHAR UTF-8
preserved; 1 GEDC/2 VERS bumped to 7.0; FORM LINEAGE-LINKED removed.
Leybka SEX correction (2026-05-17, commit 59f37b3) preserved
through the conversion. Derived YAML re-sync was cosmetic-only.
Old file kept as .5.5.1-backup-20260517-190228 for one cycle."
git push origin main
```

**Verification:** PR opens cleanly; CI green (if configured); branch on origin.

---

## Rollback

If Task 4 (parser rewrite) or Task 5 (YAML parity) reveals a problem that can't be fixed in-session:

```bash
# Data repo
cd ~/whoami
cp genealogy/barash-tree.ged.5.5.1-backup-20260517-190228 genealogy/barash-tree.ged
WHOAMI_ROOT=~/whoami ~/dev/whoami/cli/dist/wai.cjs sync-gedcom --ged-file barash-tree.ged --notes "Rollback to 5.5.1"
git add genealogy/ && git commit -m "rollback: GEDCOM 7 upgrade — revert to 5.5.1"

# Code repo
cd ~/dev/whoami
git checkout main
git branch -D feat/gedcom-7-upgrade  # or keep for retry
```

The rollback is clean because the 5.5.1 file is byte-identical to the pre-upgrade state and the parser library swap hasn't been merged yet.

---

## Open questions / decisions worth raising before execution

- **Tag the .ged file in the snapshots manifest?** `wai recite` advances snapshot pointers automatically; no manual action needed, but worth documenting in the snapshot history that this is a version-bumped re-sync, not a content change.
- **Should the converter run before every `wai sync-gedcom`?** No — the canonical .ged is now v7. If someone re-exports from Ancestry (still 5.5.1), they re-run the converter once before importing. Document this in `genealogy/README.md` (does that exist?) or `wai sync-gedcom`'s `--help`.
- **Vendor `js-gedcom` for validation?** Out of scope here, but worth a follow-up plan if we want `wai check --schema gedcom7` lint over the .ged.
