import { NextResponse } from 'next/server';
import { rebuildSearchIndexFromDisk } from '@/lib/server-services';
import { isSearchIndexStale } from '@/lib/search-staleness';
import { PAGES_DIR, SEARCH_INDEX_FILE } from '@/lib/env';
import { errorResponse } from '@/lib/api-errors';
import { requireSession, UnauthenticatedError } from '@/lib/descope';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stale = isSearchIndexStale(PAGES_DIR, SEARCH_INDEX_FILE);
  return NextResponse.json({ stale });
}

export async function POST() {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
    throw err;
  }

  try {
    const { pages, ms } = await rebuildSearchIndexFromDisk();
    return NextResponse.json({ ok: true, pages, ms });
  } catch (err) {
    return errorResponse('rebuild-failed', 500, { detail: (err as Error).message });
  }
}
