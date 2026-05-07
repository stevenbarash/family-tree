import { NextResponse } from 'next/server';
import { getRedlinks } from '@/lib/server-services';

export const dynamic = 'force-dynamic';

export async function GET() {
  const redlinks = await getRedlinks();
  return NextResponse.json({ redlinks });
}
