import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { isValidSlug, toTalkSlug } from '@core/pages/index.ts';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { withLock } from '@core/pages/locks.ts';
import { appendNoteOnDisk } from '@/lib/server-services';
import { errorResponse, routeError } from '@/lib/api-errors';
import { AUTH_ENABLED } from '@/lib/env';
import { requireSession, UnauthenticatedError } from '@/lib/descope';
import { noteAuthorName } from '@/lib/note-author';
import { REPO_LOCK, pushAfterWrite } from '@/lib/sync';
import { routing } from '@/i18n/routing';
import { localePathsForSlug } from '@/lib/revalidation-paths';

const NoteBody = z.object({
  note: z.string().min(1).max(5000),
  by: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).optional(),
  // Must mirror NoteKind in cli/src/api-client.ts. Previously this accepted
  // only human|agent, but the CLI's `wai note --kind` flag and the author
  // pipeline's Phase 2 research path both emit other kinds; rejecting them
  // here breaks the cohort pipeline with an opaque HTTP 400.
  kind: z.enum(['human', 'agent', 'interview', 'research', 'transcript']).optional(),
});

/**
 * POST /api/notes/<slug> — append a dated research note to
 * `<slug>.talk.md`. The slug is the article slug; `.talk` form is also
 * accepted. Body fields:
 *   - note (required): bullet prose
 *   - by (optional): author handle. Honoured only when auth is off (the
 *       trusted local CLI); with auth on the signed-in identity is used.
 *   - kind (optional): "human" (default) or "agent"
 * Returns the resolved talk slug, the date filed under, and the new
 * note's stable id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  let author: AuthorIdentity;
  try {
    author = await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = NoteBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  try {
    const { date, id } = await withLock(REPO_LOCK, async () => {
      const result = await appendNoteOnDisk(slug, {
        text: parsed.data.note,
        by: noteAuthorName(AUTH_ENABLED, author, parsed.data.by),
        kind: parsed.data.kind ?? 'human',
      });
      await pushAfterWrite();
      return result;
    });
    // A note renders both inline on the article page and on the talk
    // page — revalidate both, every locale.
    for (const path of localePathsForSlug(slug, routing.locales)) revalidatePath(path);
    for (const path of localePathsForSlug(toTalkSlug(slug), routing.locales)) revalidatePath(path);
    return NextResponse.json({ slug: toTalkSlug(slug), date, id });
  } catch (err) {
    return routeError(err, slug, 'note-failed');
  }
}
