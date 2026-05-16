import { NextRequest, NextResponse } from 'next/server';
import { searchAndJoin } from '@/lib/server-services';
import { PRIVACY_GATE_ENABLED } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 25)) : 25;
  // Privacy gate: living/restricted records are filtered by default when the
  // gate is on. The CLI's `wai search --include-living` flag opts into
  // surfacing them. When the gate is master-disabled (see `env.ts`), all
  // records surface regardless of `include_living`.
  const includeRestricted = !PRIVACY_GATE_ENABLED
    || req.nextUrl.searchParams.get('include_living') === '1';
  const results = await searchAndJoin(q, limit, { includeRestricted });
  return NextResponse.json({ results });
}
