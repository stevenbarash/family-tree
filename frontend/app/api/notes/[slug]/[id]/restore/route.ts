import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { withLock } from '@core/pages/locks.ts';
import { restoreNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError, NOTE_ID_RE, ByField } from '@/lib/api-errors';
import { AUTH_ENABLED } from '@/lib/env';
import { requireSession, UnauthenticatedError } from '@/lib/descope';
import { noteAuthorName } from '@/lib/note-author';
import { REPO_LOCK, pushAfterWrite } from '@/lib/sync';

const RestoreBody = z.object({ by: ByField.optional() }).optional();

/**
 * Records the restore as `restoredAt`/`restoredBy` on the trailer so
 * the event is preserved in git.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  let author: AuthorIdentity;
  try {
    author = await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = RestoreBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await withLock(REPO_LOCK, async () => {
      const r = await restoreNoteOnDisk(
        slug,
        id,
        noteAuthorName(AUTH_ENABLED, author, parsed.data?.by),
      );
      await pushAfterWrite();
      return r;
    });
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, restoredAt: result.restoredAt });
  } catch (err) {
    return routeError(err, slug, 'note-restore-failed');
  }
}
