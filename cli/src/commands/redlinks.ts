import type { ApiClient } from '../api-client.js';

export interface RedlinksOptions {
  limit: number;
  json: boolean;
  client: Pick<ApiClient, 'redlinks'>;
  write: (s: string) => void;
}

export async function runRedlinks(opts: RedlinksOptions): Promise<void> {
  const payload = await opts.client.redlinks();
  if (opts.json) {
    opts.write(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.redlinks.length === 0) {
    opts.write('no redlinks\n');
    return;
  }
  const top = payload.redlinks.slice(0, opts.limit);
  const widest = String(top[0]!.count).length;
  for (const r of top) {
    opts.write(`${String(r.count).padStart(widest)}  ${r.target}\n`);
  }
}
