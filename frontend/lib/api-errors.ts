import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PageNotFoundError, StaleSchemaVersionError } from '@core/pages/store.ts';
import { FutureSchemaVersionError } from '@core/pages/migrations/index.ts';
import {
  NoteNotFoundError,
  NoteDeletedError,
  NoteAlreadyDeletedError,
} from '@core/pages/research-notes.ts';

export const NOTE_ID_RE = /^n_[0-9a-z]{8}$/;

/** Author handle validator; shared by every notes endpoint. */
export const ByField = z.string().regex(/^[A-Za-z0-9._-]+$/).max(64);

type ErrorBody = { error: string; [k: string]: unknown };

/** Construct a JSON error response with a stable `error` code field. */
export function errorResponse(
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse<ErrorBody> {
  return NextResponse.json(extra ? { error: code, ...extra } : { error: code }, { status });
}

/**
 * Translate page-store errors into the canonical wire response.
 * Handles `PageNotFoundError` (404), schema-version conflicts (409),
 * and falls through to `errorResponse(fallbackCode, 500, …)` for
 * anything else.
 */
export function routeError(
  err: unknown,
  slug: string,
  fallbackCode: string,
): NextResponse<ErrorBody> {
  if (err instanceof PageNotFoundError) {
    return errorResponse('not-found', 404);
  }
  if (err instanceof StaleSchemaVersionError) {
    return errorResponse('stale-schema-version', 409, {
      slug: err.slug,
      onDisk: err.onDisk,
      current: err.current,
    });
  }
  if (err instanceof FutureSchemaVersionError) {
    return errorResponse('future-schema-version', 409, {
      slug,
      onDisk: err.fromVersion,
      current: err.current,
    });
  }
  if (err instanceof NoteNotFoundError) {
    return errorResponse('note-not-found', 404, { noteId: err.noteId });
  }
  if (err instanceof NoteDeletedError) {
    return errorResponse('note-deleted', 409, { noteId: err.noteId });
  }
  if (err instanceof NoteAlreadyDeletedError) {
    return errorResponse('note-already-deleted', 409, { noteId: err.noteId });
  }
  return errorResponse(fallbackCode, 500, { detail: (err as Error).message });
}
