import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPageStore, invalidateListCache, getSearchIndex, persistSearchIndex, defaultPageMeta } from '@/lib/server-services';
import { DEFAULT_AUTHOR, WHOAMI_ROOT } from '@/lib/env';
import { isValidSlug, titleCaseFromSlug } from '@core/pages/index.ts';
import type { Page } from '@core/pages/index.ts';
import { PageNotFoundError } from '@core/pages/store.ts';
import { buildSearchDoc } from '@core/search/module.ts';
import { loadDerivedRecord } from '@/lib/derived';
import { errorResponse, routeError } from '@/lib/api-errors';

const PutBody = z.object({
  body: z.string(),
  // `summary` carries both the conventional commit subject AND, for `wai
  // author` pipeline writes, the multi-line pipeline trailer that ends up in
  // the commit body. The trailer alone is ~150 chars (UUID + phase + slug +
  // inputs + sources + guard); subjects with long compound slugs like
  // `mordechai-kalwaryiski-margolis` pushed the combined summary past the
  // prior 200-char limit, causing HTTP 400 on every outline-phase write for
  // those subjects. 1000 covers all current trailer shapes with plenty of
  // headroom for additional trailer fields.
  summary: z.string().min(1).max(1000),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);
  try {
    const page = await getPageStore().read(slug);
    return NextResponse.json(page);
  } catch (err) {
    return routeError(err, slug, 'read-failed');
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  const json = await req.json().catch(() => null);
  const parsed = PutBody.safeParse(json);
  if (!parsed.success) return errorResponse('bad-request', 400);

  const pages = getPageStore();
  // PUT is upsert: read existing meta if available, otherwise synthesize defaults.
  let page: Page;
  try {
    const existing = await pages.read(slug);
    page = { ...existing, body: parsed.data.body };
  } catch (err) {
    if (!(err instanceof PageNotFoundError)) throw err;
    page = { slug, meta: defaultPageMeta({ title: titleCaseFromSlug(slug) }), body: parsed.data.body };
  }

  try {
    await pages.write(slug, page, DEFAULT_AUTHOR, parsed.data.summary);
  } catch (err) {
    return routeError(err, slug, 'write-failed');
  }
  const idx = await getSearchIndex();
  const derived = page.meta.gedcom?.record
    ? await loadDerivedRecord(WHOAMI_ROOT, page.meta.gedcom.record)
    : null;
  idx.upsert(buildSearchDoc(page, derived), { restricted: derived?.privacy?.restricted === true });
  await persistSearchIndex();
  invalidateListCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return errorResponse('bad-slug', 400);

  try {
    await getPageStore().softDelete(slug, DEFAULT_AUTHOR);
  } catch (err) {
    return routeError(err, slug, 'delete-failed');
  }
  const idx = await getSearchIndex();
  idx.remove(slug);
  await persistSearchIndex();
  invalidateListCache();
  return NextResponse.json({ ok: true });
}
