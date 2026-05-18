import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "..");

// Precise patterns: each one only matches actual directional Tailwind classes,
// not false positives like rounded-lg, border-red-500, text-lg, etc.
//
// Run as separate greps so each is precise. ERE syntax (grep -E).
const FORBIDDEN = [
  // Margin / padding with required digit: ml-4, mr-2, pl-8, pr-1, -ml-2, etc.
  String.raw`\b-?(ml|mr|pl|pr)-[0-9]`,
  // text-left / text-right (word boundary on both sides)
  String.raw`\btext-(left|right)\b`,
  // left-N / right-N (digit or fractional like left-1/2): positional classes
  String.raw`\b-?(left|right)-[0-9]`,
  // border-l / border-r at word boundary, or border-l-N / border-r-2
  String.raw`\bborder-(l|r)(\b|-[0-9])`,
  // rounded-l-* / rounded-r-*
  String.raw`\brounded-(l|r)-`,
];

// Files where matches are INTENTIONAL.
// sheet.tsx uses data-[side=left|right] variants that match a component prop
// (not layout direction) — intentionally left alone in the Task 6 RTL sweep.
const EXEMPT_FILES = ["components/ui/sheet.tsx"];

test("rtl: no directional Tailwind classes in app/ or components/", () => {
  for (const pattern of FORBIDDEN) {
    let stdout = "";
    try {
      stdout = execSync(
        `grep -rn -E '${pattern}' app components --include='*.tsx' --include='*.ts' || true`,
        { cwd: frontendRoot, encoding: "utf8" }
      );
    } catch {
      stdout = "";
    }

    // Filter out exempt files
    const offending = stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .filter((line) => !EXEMPT_FILES.some((exempt) => line.includes(exempt)));

    assert.equal(
      offending.length,
      0,
      `Found directional Tailwind classes matching /${pattern}/:\n${offending.join("\n")}\n\nUse logical equivalents: ms-/me-/ps-/pe-/text-start/text-end/start-/end-/border-s/border-e/rounded-s/rounded-e`
    );
  }
});
