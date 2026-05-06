import { NextRequest, NextResponse } from 'next/server';
import { runMigrateOnDisk } from '@/lib/server-services';
import { DirtyRepoError } from '@core/pages/migrate-runner.ts';
import { FutureSchemaVersionError } from '@core/pages/migrations/index.ts';
import { errorResponse } from '@/lib/api-errors';

interface MigrateRequest {
  page?: string;
  dryRun?: boolean;
  force?: boolean;
}

/**
 * POST /api/migrate — invokes the migration runner on the configured
 * data repo. Body shape: { page?, dryRun?, force? }. Returns the
 * MigrateReport on success; HTTP 409 with `error: "dirty-repo"` when
 * the repo has uncommitted changes and `force` is false; HTTP 409
 * with `error: "future-schema-version"` when the data is ahead of
 * this build.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let body: MigrateRequest = {};
  try {
    body = (await req.json()) as MigrateRequest;
  } catch {
    /* allow empty body */
  }
  try {
    const report = await runMigrateOnDisk({
      page: body.page,
      dryRun: !!body.dryRun,
      force: !!body.force,
    });
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof DirtyRepoError) {
      return errorResponse('dirty-repo', 409, { detail: err.message });
    }
    if (err instanceof FutureSchemaVersionError) {
      return errorResponse('future-schema-version', 409, { detail: err.message });
    }
    return errorResponse('migrate-failed', 500, { detail: (err as Error).message });
  }
}
