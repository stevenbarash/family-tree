import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { reciteDrift, applyRecite } from '@core/gedcom/index.ts';
import { invalidateListCache } from '@/lib/server-services';
import { WHOAMI_ROOT, PAGES_DIR, DEFAULT_AUTHOR } from '@/lib/env';
import { errorResponse } from '@/lib/api-errors';
import { requireSession, UnauthenticatedError } from '@/lib/descope';

export async function GET() {
  const drift = await reciteDrift({
    repoRoot: WHOAMI_ROOT,
    genealogyDir: join(WHOAMI_ROOT, 'genealogy'),
    pagesDir: PAGES_DIR,
  });
  return NextResponse.json({ drift });
}

const ApplyBody = z.object({ apply: z.literal(true) });

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = ApplyBody.safeParse(body);
  if (!parsed.success) return errorResponse('bad-request', 400);

  const updated = await applyRecite({
    repoRoot: WHOAMI_ROOT,
    genealogyDir: join(WHOAMI_ROOT, 'genealogy'),
    pagesDir: PAGES_DIR,
    author: DEFAULT_AUTHOR,
  });
  invalidateListCache();
  // GEDCOM-derived data changed: drop the family-tree cache. Article pages
  // are force-dynamic (they read derived records per request), so no page
  // revalidation is needed.
  revalidateTag('gedcom', 'max');
  // No search rebuild — recite only changes gedcom.snapshot in frontmatter,
  // which isn't an indexed field; the existing index stays correct.
  return NextResponse.json({ updated });
}
