import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { syncGedcom } from '@core/gedcom/index.ts';
import { invalidateListCache, rebuildSearchIndexFromDisk } from '@/lib/server-services';
import { WHOAMI_ROOT, DEFAULT_AUTHOR } from '@/lib/env';
import { errorResponse } from '@/lib/api-errors';
import { requireSession, UnauthenticatedError } from '@/lib/descope';

const Body = z.object({
  gedFile: z.string().regex(/^[a-z0-9._-]+\.ged$/i),
  notes: z.string().min(1).max(200),
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  const genealogyDir = join(WHOAMI_ROOT, 'genealogy');
  const gedPath = join(genealogyDir, parsed.data.gedFile);
  if (!existsSync(gedPath)) return errorResponse('ged-not-found', 404);

  try {
    const result = await syncGedcom({
      repoRoot: WHOAMI_ROOT,
      genealogyDir,
      gedFile: parsed.data.gedFile,
      author: DEFAULT_AUTHOR,
      notes: parsed.data.notes,
      force: parsed.data.force,
    });
    invalidateListCache();
    await rebuildSearchIndexFromDisk();
    revalidateTag('gedcom', 'max');
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse('sync-failed', 500, { detail: (err as Error).message });
  }
}
