import { NextRequest, NextResponse } from 'next/server';
import { isValidSlug } from '@core/pages/index.ts';
import { loadNoteHistory } from '@/lib/note-history';
import { errorResponse, routeError, NOTE_ID_RE } from '@/lib/api-errors';

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
