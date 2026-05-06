import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { appendNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';
import { DEFAULT_AUTHOR } from '@/lib/env';

const NoteBody = z.object({
  note: z.string().min(1).max(5000),
  by: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).optional(),
  kind: z.enum(['human', 'agent']).optional(),
});

/**
 * POST /api/notes/<slug> — append a dated research note to
 * `<slug>.talk.md`. The slug is the article slug; `.talk` form is also
 * accepted. Body fields:
 *   - note (required): bullet prose
 *   - by (optional): author handle. Falls back to DEFAULT_AUTHOR.name.
 *   - kind (optional): "human" (default) or "agent"
 * Returns the resolved talk slug, the date filed under, and the new
 * note's stable id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  const json = await req.json().catch(() => null);
  const parsed = NoteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const { date, id } = await appendNoteOnDisk(slug, {
      text: parsed.data.note,
      by: parsed.data.by ?? DEFAULT_AUTHOR.name,
      kind: parsed.data.kind ?? 'human',
    });
    return NextResponse.json({ slug: toTalkSlug(slug), date, id });
  } catch (err) {
    return routeError(err, slug, 'note-failed');
  }
}
