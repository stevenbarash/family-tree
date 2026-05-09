import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import { normalizeDerivedRecord } from '../gedcom/normalize.ts';
import { redactRecord } from './redact.ts';

/**
 * Boundary module — file I/O orchestration for `wai export`. Walks
 * `<whoamiRoot>/genealogy/derived/*.yml`, applies the privacy gate to
 * each record, and writes the result under `<outDir>/genealogy/derived/`.
 *
 * Restricted records are reduced via `redactRecord` when `redactLiving`
 * is true (the default the CLI command exposes); otherwise the caller
 * gets a stderr warning and a verbatim copy. Pure-data records pass
 * through unchanged.
 *
 * Pages export is intentionally out of scope — narrative content can't
 * be safely auto-redacted; a future module can drop pages whose joined
 * record is restricted.
 */
export interface ExportConfig {
  whoamiRoot: string;
  outDir: string;
  redactLiving: boolean;
  /** Optional logger for per-record warnings. Defaults to no-op. */
  warn?: (msg: string) => void;
}

export interface ExportResult {
  scanned: number;
  copied: number;
  redacted: number;
  skipped: number;
}

export function exportRedacted(cfg: ExportConfig): ExportResult {
  const derivedDir = join(cfg.whoamiRoot, 'genealogy', 'derived');
  if (!existsSync(derivedDir)) {
    cfg.warn?.(`no derived directory at ${derivedDir}`);
    return { scanned: 0, copied: 0, redacted: 0, skipped: 0 };
  }
  const outDerived = join(cfg.outDir, 'genealogy', 'derived');
  mkdirSync(outDerived, { recursive: true });

  let scanned = 0;
  let copied = 0;
  let redacted = 0;
  let skipped = 0;

  for (const entry of readdirSync(derivedDir)) {
    if (!entry.endsWith('.yml')) continue;
    scanned++;
    const srcPath = join(derivedDir, entry);
    const raw = readFileSync(srcPath, 'utf-8');
    const record = normalizeDerivedRecord(yaml.load(raw));
    if (!record) {
      cfg.warn?.(`skipped malformed: ${basename(entry)}`);
      skipped++;
      continue;
    }
    const dstPath = join(outDerived, entry);
    if (record.privacy.restricted) {
      if (cfg.redactLiving) {
        const reduced = redactRecord(record);
        writeFileSync(dstPath, yaml.dump(reduced, { lineWidth: 100 }), 'utf-8');
        redacted++;
      } else {
        // Without --redact-living the export is the raw data — caller is on
        // the hook for any privacy fallout. Warn but copy verbatim.
        writeFileSync(dstPath, raw, 'utf-8');
        copied++;
        cfg.warn?.(`${record.record} is restricted but --redact-living was not set; copied verbatim`);
      }
    } else {
      writeFileSync(dstPath, raw, 'utf-8');
      copied++;
    }
  }

  return { scanned, copied, redacted, skipped };
}
