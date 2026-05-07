/**
 * Reconstruct the per-note event history from a chronological sequence
 * of talk-page body snapshots. Pure: takes the snapshots, returns
 * events. The boundary layer fetches the snapshots from git.
 */

import { parseResearchNotes, type Note } from './research-notes.ts';

export type NoteEventKind = 'created' | 'edited' | 'retracted' | 'restored';

export interface NoteEvent {
  kind: NoteEventKind;
  at: string | null;          // ISO-8601 UTC; null for legacy create
  by: string | null;          // null for legacy or unattributed restore
  prevText?: string;          // present only on 'edited'
}

export interface NoteVersion {
  body: string;               // talk-page body at this commit
  commitId: string;           // for telemetry / debugging
  commitTime: string;         // ISO-8601 UTC, used as restore-time fallback
}

/**
 * Walk versions oldest→newest, emit events whenever the note
 * matching `noteId` changes state. Returns events newest-first
 * (matching the rest of the notes UI's chronology).
 */
export function reconstructNoteHistory(
  versions: NoteVersion[],
  noteId: string,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let prev: Note | null = null;

  for (const v of versions) {
    const cur = parseResearchNotes(v.body).find((n) => n.id === noteId) ?? null;

    if (!prev && cur) {
      events.push({
        kind: 'created',
        at: cur.createdAt,
        by: cur.isLegacy ? null : cur.by,
      });
    } else if (prev && cur) {
      if (prev.text !== cur.text) {
        events.push({
          kind: 'edited',
          at: cur.editedAt,
          by: cur.editedBy,
          prevText: prev.text,
        });
      }
      if (!prev.deletedAt && cur.deletedAt) {
        events.push({
          kind: 'retracted',
          at: cur.deletedAt,
          by: cur.deletedBy,
        });
      } else if (prev.deletedAt && !cur.deletedAt) {
        events.push({
          kind: 'restored',
          at: cur.restoredAt ?? v.commitTime,
          by: cur.restoredBy ?? null,
        });
      }
    }

    if (cur) prev = cur;
  }

  return events.reverse();
}
