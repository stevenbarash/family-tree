import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { withLock } from '@core/pages/locks.ts';
import { editNoteOnDisk, softDeleteNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError, NOTE_ID_RE, ByField } from '@/lib/api-errors';
import { AUTH_ENABLED } from '@/lib/env';
import { requireSession, UnauthenticatedError } from '@/lib/descope';
import { noteAuthorName } from '@/lib/note-author';
import { REPO_LOCK, pushAfterWrite } from '@/lib/sync';
import { routing } from '@/i18n/routing';
import { localePathsForSlug } from '@/lib/revalidation-paths';

const PatchBody = z.object({
  note: z.string().min(1).max(5000),
  by: ByField.optional(),
});

const DeleteBody = z.object({ by: ByField.optional() }).optional();

/**
 * PATCH /api/notes/<slug>/<id> — edit the prose of an existing note.
 * Updates `editedAt`/`editedBy` to the latest edit.
 */
export async function PATCH(
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
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await withLock(REPO_LOCK, async () => {
      const r = await editNoteOnDisk(
        slug,
        id,
        parsed.data.note,
        noteAuthorName(AUTH_ENABLED, author, parsed.data.by),
      );
      await pushAfterWrite();
      return r;
    });
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, editedAt: result.editedAt });
  } catch (err) {
    return routeError(err, slug, 'note-edit-failed');
  }
}

/**
 * DELETE /api/notes/<slug>/<id> — soft-delete (retract). Bullet prose
 * stays in place; the trailer gains `deletedAt`/`deletedBy`. Reversible
 * via POST /restore.
 */
export async function DELETE(
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
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await withLock(REPO_LOCK, async () => {
      const r = await softDeleteNoteOnDisk(
        slug,
        id,
        noteAuthorName(AUTH_ENABLED, author, parsed.data?.by),
      );
      await pushAfterWrite();
      return r;
    });
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, deletedAt: result.deletedAt });
  } catch (err) {
    return routeError(err, slug, 'note-delete-failed');
  }
}
