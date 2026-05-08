import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { normalizeDerivedRecord } from '@core/gedcom/normalize.ts';
import { whoamiPaths } from '@core/paths.ts';

export async function loadDerivedRecord(
  whoamiRoot: string,
  record: string,
): Promise<DerivedRecord | null> {
  if (!/^I\d+$/.test(record)) return null;
  const path = join(whoamiPaths(whoamiRoot).derivedDir, `${record}.yml`);
  if (!existsSync(path)) return null;
  return normalizeDerivedRecord(yaml.load(readFileSync(path, 'utf-8')));
}
