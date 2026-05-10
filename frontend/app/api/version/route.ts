import { NextResponse } from 'next/server';

// Keep in sync with cli/package.json `version` and cli/src/index.ts VERSION.
// `apiVersion` is the wai HTTP API surface; bump only on breaking contract change.
const VERSION = '2.0.0-pre.0';
const API_VERSION = 'v2';
const STARTED_AT = new Date().toISOString();

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    apiVersion: API_VERSION,
    version: VERSION,
    startedAt: STARTED_AT,
  });
}
