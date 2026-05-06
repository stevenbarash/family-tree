import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import { appendNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';
import { DEFAULT_AUTHOR } from '@/lib/env';

const NoteBody = z.object({
  note: z.string().min(1).max(5000),
});

/**
 * POST /api/notes/<slug> — append a dated research note to the
 * `## Research notes` section of `<slug>.talk.md`. Pass `<slug>` as
 * the article slug; the `.talk` form is also accepted.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  const json = await req.json().catch(() => null);
  const parsed = NoteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const result = await appendNoteOnDisk(slug, {
      text: parsed.data.note,
      by: DEFAULT_AUTHOR.name,    // Task 11 will read from request body
      kind: 'human',
    });
    return NextResponse.json({ slug: toTalkSlug(slug), date: result.date, id: result.id });
  } catch (err) {
    return routeError(err, slug, 'note-failed');
  }
}
