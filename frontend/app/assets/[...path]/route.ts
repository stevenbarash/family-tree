import { stat, readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { WHOAMI_ROOT } from '@/lib/env';
import { contentTypeForAsset, resolveWikiAssetPath } from '@/lib/assets';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const filePath = resolveWikiAssetPath(WHOAMI_ROOT, path);
  if (!filePath) {
    return NextResponse.json({ error: 'bad-asset-path' }, { status: 400 });
  }

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }

  const body = await readFile(filePath);
  return new NextResponse(body, {
    headers: {
      'content-type': contentTypeForAsset(filePath),
      'cache-control': 'public, max-age=60',
    },
  });
}
