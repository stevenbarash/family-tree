import { NextRequest, NextResponse } from 'next/server';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { restoreNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';

const NOTE_ID_RE = /^n_[0-9a-z]{8}$/;

/**
 * POST /api/notes/<slug>/<id>/restore — clear the soft-delete flag on a
 * retracted note.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  try {
    const result = await restoreNoteOnDisk(slug, id);
    return NextResponse.json({ slug: toTalkSlug(slug), id: result.id });
  } catch (err) {
    return routeError(err, slug, 'note-restore-failed');
  }
}
