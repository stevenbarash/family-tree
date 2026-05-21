import { NextRequest, NextResponse } from 'next/server';
import { searchAndJoin } from '@/lib/server-services';
import { PRIVACY_GATE_ENABLED } from '@/lib/env';
import { requireSession, UnauthenticatedError } from '@/lib/descope';
import { errorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 25)) : 25;

  // Privacy gate: living/restricted records are filtered by default when
  // the gate is on. `include_living=1` (the CLI's `--include-living`)
  // opts back in — but it must be backed by a session, otherwise any
  // unauthenticated client surfaces restricted records just by appending
  // the parameter. `requireSession()` returns a default identity (never
  // throws) when auth is off, so `--include-living` still works on the
  // trusted local host. When the gate is master-disabled, everything
  // surfaces regardless.
  let includeRestricted = !PRIVACY_GATE_ENABLED;
  if (!includeRestricted && req.nextUrl.searchParams.get('include_living') === '1') {
    try {
      await requireSession();
      includeRestricted = true;
    } catch (err) {
      if (err instanceof UnauthenticatedError) return errorResponse('unauthorized', 401);
      throw err;
    }
  }

  const results = await searchAndJoin(q, limit, { includeRestricted });
  return NextResponse.json({ results });
}
