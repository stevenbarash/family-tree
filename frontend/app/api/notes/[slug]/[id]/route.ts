import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { editNoteOnDisk, softDeleteNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError, NOTE_ID_RE, ByField } from '@/lib/api-errors';
import { DEFAULT_AUTHOR } from '@/lib/env';

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

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await editNoteOnDisk(
      slug,
      id,
      parsed.data.note,
      parsed.data.by ?? DEFAULT_AUTHOR.name,
    );
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

  const json = await req.json().catch(() => null);
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await softDeleteNoteOnDisk(
      slug,
      id,
      parsed.data?.by ?? DEFAULT_AUTHOR.name,
    );
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id, deletedAt: result.deletedAt });
  } catch (err) {
    return routeError(err, slug, 'note-delete-failed');
  }
}
