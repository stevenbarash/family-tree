/**
 * Boundary layer that turns the data repo's git log for a talk file
 * into the chronological body snapshots the pure reconstructor needs.
 * The git plumbing lives in `core/src/pages/git.ts`; this module just
 * wires paths and feeds the result through the reconstructor.
 */

import { relative, join } from 'node:path';
import { toTalkSlug } from '@core/pages/index.ts';
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
    body: stripFrontmatter(v.body),
    commitId: v.commitId,
    commitTime: v.commitTime,
  }));

  return reconstructNoteHistory(versions, noteId);
}

/**
 * `parseResearchNotes` operates on a page's body, not its frontmatter.
 * `git show` returns the whole file, so strip the YAML frontmatter
 * before handing the snapshot to the reconstructor.
 */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw;
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return raw;
  return raw.slice(end + 5);
}
