import type { ApiClient, NoteSummary } from '../api-client.js';
import { toBaseSlug } from '@core/pages/slug.ts';

type Mode = 'append' | 'edit' | 'delete' | 'restore' | 'list';

export interface NoteOptions {
  slug: string;
  mode: Mode;
  note?: string;
  id?: string;
  by?: string;
  kind?: 'human' | 'agent';
  json?: boolean;
  client: Pick<ApiClient, 'note' | 'editNote' | 'deleteNote' | 'restoreNote' | 'listNotes'>;
  write: (s: string) => void;
}

export async function runNote(opts: NoteOptions): Promise<void> {
  const slug = toBaseSlug(opts.slug);
  switch (opts.mode) {
    case 'append': {
      const text = (opts.note ?? '').trim();
      if (text === '') {
        throw new Error('note is empty — pass text positionally, via --file, or via --stdin');
      }
      const appendOpts: { by?: string; kind?: 'human' | 'agent' } = {};
      if (opts.by !== undefined) appendOpts.by = opts.by;
      if (opts.kind !== undefined) appendOpts.kind = opts.kind;
      const result = await opts.client.note(slug, text, appendOpts);
      opts.write(`note added to ${result.slug} (${result.date}, ${result.id})\n`);
      return;
    }
    case 'edit': {
      const id = requireId(opts.id);
      const text = (opts.note ?? '').trim();
      if (text === '') {
        throw new Error('note is empty — pass text positionally, via --file, or via --stdin');
      }
      const editOpts: { by?: string } = opts.by !== undefined ? { by: opts.by } : {};
      const result = await opts.client.editNote(slug, id, text, editOpts);
      opts.write(`note ${result.id} edited (${result.editedAt})\n`);
      return;
    }
    case 'delete': {
      const id = requireId(opts.id);
      const delOpts: { by?: string } = opts.by !== undefined ? { by: opts.by } : {};
      const result = await opts.client.deleteNote(slug, id, delOpts);
      opts.write(`note ${result.id} retracted (${result.deletedAt})\n`);
      return;
    }
    case 'restore': {
      const id = requireId(opts.id);
      const result = await opts.client.restoreNote(slug, id);
      opts.write(`note ${result.id} restored\n`);
      return;
    }
    case 'list': {
      const notes = await opts.client.listNotes(slug);
      if (opts.json) {
        opts.write(`${JSON.stringify(notes, null, 2)}\n`);
        return;
      }
      for (const n of notes as NoteSummary[]) {
        const flag = n.deletedAt ? '[deleted] ' : '';
        const preview = n.text.replace(/\s+/g, ' ').slice(0, 80);
        opts.write(`${flag}${n.id}  ${n.date}  ${preview}\n`);
      }
      return;
    }
  }
}

function requireId(id: string | undefined): string {
  if (!id) throw new Error('note id required (e.g. --edit <id>, --delete <id>)');
  if (!/^n_[0-9a-z]{8}$/.test(id) && !id.startsWith('n_legacy_')) {
    throw new Error(`invalid note id: ${id}`);
  }
  return id;
}
