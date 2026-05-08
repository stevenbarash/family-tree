import { planPromote, type PromoteInput } from '@core/corrections/promote.ts';
import type { SourcedCorrection } from '@core/corrections/load.ts';

export interface PromoteCorrectionsOptions {
  record: string;
  apply: boolean;
  gedcomPath: string;
  pagesDir: string;
  loadCorrections: (pagesDir: string) => SourcedCorrection[];
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runPromoteCorrections(opts: PromoteCorrectionsOptions): Promise<number> {
  const all = opts.loadCorrections(opts.pagesDir);
  const matching = all.filter(c => c.record === opts.record);
  if (matching.length === 0) {
    opts.writeErr(`no corrections found for record ${opts.record}\n`);
    return 1;
  }

  const gedcomText = opts.readFile(opts.gedcomPath);
  let promoted = 0;
  for (const c of matching) {
    const pageText = opts.readFile(c.sourcePagePath);
    const input: PromoteInput = {
      record: c.record!,
      field: c.field,
      value: c.value,
      source: c.source,
    };
    let result;
    try {
      result = planPromote(gedcomText, pageText, input);
    } catch (e) {
      opts.writeErr(`failed to plan ${c.record} ${c.field}: ${(e as Error).message}\n`);
      continue;
    }

    if (opts.apply) {
      opts.writeFile(opts.gedcomPath, result.gedcomText);
      opts.writeFile(c.sourcePagePath, result.pageText);
      opts.write(`promoted ${c.record} ${c.field} = "${c.value}" → ${c.sourcePagePath}\n`);
      promoted += 1;
    } else {
      opts.write(`would write ${c.record} ${c.field} = "${c.value}" (dry-run)\n`);
      opts.write(`  source: ${c.source}\n`);
      opts.write(`  page:   ${c.sourcePagePath}\n`);
    }
  }

  if (!opts.apply) {
    opts.write(`\n${matching.length} correction${matching.length === 1 ? '' : 's'} ready to promote. Re-run with --apply.\n`);
  } else if (promoted > 0) {
    opts.write(`\nRun \`wai sync-gedcom\` to regenerate derived/*.yml from the updated GEDCOM.\n`);
  }

  return 0;
}
