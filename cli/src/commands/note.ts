import type { ApiClient } from '../api-client.js';
import { toBaseSlug } from '@core/pages/slug.ts';

export interface NoteOptions {
  slug: string;
  note: string;
  client: Pick<ApiClient, 'note'>;
  write: (s: string) => void;
}

export async function runNote(opts: NoteOptions): Promise<void> {
  if (opts.note.trim() === '') {
    throw new Error('note is empty — pass text positionally, via --file, or via --stdin');
  }
  // The server accepts both `grandpa` and `grandpa.talk`; we send the base
  // form so the canonical client-side identifier is the article slug.
  const result = await opts.client.note(toBaseSlug(opts.slug), opts.note);
  opts.write(`note added to ${result.slug} (${result.date})\n`);
}
