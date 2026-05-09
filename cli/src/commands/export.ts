import { exportRedacted, type ExportResult } from '@core/export/run.ts';

export interface ExportOptions {
  whoamiRoot: string;
  outDir: string;
  redactLiving: boolean;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  const result = exportRedacted({
    whoamiRoot: opts.whoamiRoot,
    outDir: opts.outDir,
    redactLiving: opts.redactLiving,
    warn: (msg) => opts.writeErr(`${msg}\n`),
  });
  opts.write(
    `exported ${result.scanned} record${result.scanned === 1 ? '' : 's'} to ${opts.outDir}: ` +
      `${result.copied} verbatim, ${result.redacted} redacted, ${result.skipped} skipped\n`,
  );
  return result;
}
