import { NextRequest, NextResponse } from 'next/server';
import { isValidSlug } from '@core/pages/index.ts';
import { loadNoteHistory } from '@/lib/note-history';
import { errorResponse, routeError } from '@/lib/api-errors';

const NOTE_ID_RE = /^n_[0-9a-z]{8}$/;

/**
 * GET /api/notes/<slug>/<id>/history — return every event that has
 * happened to this note (created, edited, retracted, restored),
 * reconstructed from the data repo's git log. Newest-first.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  if (!NOTE_ID_RE.test(id)) return errorResponse('bad-note-id', 400);

  try {
    const events = await loadNoteHistory(slug, id);
    if (events.length === 0) return errorResponse('note-not-found', 404);
    return NextResponse.json({ events });
  } catch (err) {
    return routeError(err, slug, 'history-failed');
  }
}
