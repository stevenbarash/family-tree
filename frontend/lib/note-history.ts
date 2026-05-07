/**
 * Boundary layer that turns the data repo's git log for a talk file
 * into the chronological body snapshots the pure reconstructor needs.
 */

import { relative, join } from 'node:path';
import { toTalkSlug, extractBody } from '@core/pages/index.ts';
import { fileVersions } from '@core/pages/git.ts';
import {
  reconstructNoteHistory,
  type NoteEvent,
  type NoteVersion,
} from '@core/pages/research-notes-history.ts';
import { WHOAMI_ROOT, PAGES_DIR } from './env.ts';

export type { NoteEvent };

export async function loadNoteHistory(
  slug: string,
  noteId: string,
): Promise<NoteEvent[]> {
  const talkSlug = toTalkSlug(slug);
  const absPath = join(PAGES_DIR, `${talkSlug}.md`);
  const relPath = relative(WHOAMI_ROOT, absPath);

  const fileLog = await fileVersions(WHOAMI_ROOT, relPath);
  const versions: NoteVersion[] = fileLog.map((v) => ({
    body: extractBody(v.body),
    commitId: v.commitId,
    commitTime: v.commitTime,
  }));

  return reconstructNoteHistory(versions, noteId);
}
