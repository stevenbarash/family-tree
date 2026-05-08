import type { Page, PageMeta } from '@core/pages/types.ts';
import type { MigrateReport } from '@core/pages/migrate-runner.ts';
import type { SyncResult } from '@core/gedcom/sync.ts';
import type { ReciteEntry } from '@core/gedcom/types.ts';
import type { SearchResult } from '@core/search/types.ts';
import type { RedlinkEntry } from '@core/pages/redlinks.ts';
import { parseResearchNotes, type Note } from '@core/pages/research-notes.ts';

export type { Page, PageMeta, MigrateReport, SyncResult, ReciteEntry, SearchResult, RedlinkEntry };

export type NoteSummary = Note;

function parseNotesFromBody(body: string): Note[] {
  return parseResearchNotes(body);
}

export class ApiError extends Error {
  constructor(public status: number, public detail?: string) {
    super(`HTTP ${status}${detail ? `: ${detail}` : ''}`);
  }
}
export class NotFound extends ApiError {}
export class BadRequest extends ApiError {}
export class ServerError extends ApiError {}

export interface MigrateOptions {
  page?: string;
  dryRun?: boolean;
  force?: boolean;
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async healthz(): Promise<{ status: string; started: string }> {
    return this.json('GET', '/api/healthz');
  }

  async read(slug: string): Promise<Page> {
    return this.json<Page>('GET', `/api/pages/${slug}`);
  }

  async write(slug: string, body: string, summary: string): Promise<{ ok: true }> {
    return this.json('PUT', `/api/pages/${slug}`, { body, summary });
  }

  async delete(slug: string): Promise<{ ok: true }> {
    return this.json('DELETE', `/api/pages/${slug}`);
  }

  async syncGedcom(gedFile: string, notes: string, force?: boolean): Promise<SyncResult> {
    return this.json('POST', '/api/gedcom/sync', { gedFile, notes, force });
  }

  async reciteDrift(): Promise<{ drift: ReciteEntry[] }> {
    return this.json('GET', '/api/gedcom/recite');
  }

  async applyRecite(): Promise<{ updated: string[] }> {
    return this.json('POST', '/api/gedcom/recite', { apply: true });
  }

  async search(q: string, limit = 25): Promise<{ results: SearchResult[] }> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return this.json('GET', `/api/search?${params.toString()}`);
  }

  async redlinks(): Promise<{ redlinks: RedlinkEntry[] }> {
    return this.json('GET', '/api/redlinks');
  }

  async rebuildSearch(): Promise<{ ok: true; pages: number; ms: number }> {
    return this.json('POST', '/api/search/rebuild');
  }

  async rebuildSearchCheck(): Promise<{ stale: boolean }> {
    return this.json('GET', '/api/search/rebuild');
  }

  /**
   * Trigger a migration walk on the server.
   *
   * The server returns 409 with `error: "dirty-repo"` if the data
   * repo is dirty (rerun with `force: true` after committing or
   * stashing); 409 with `error: "future-schema-version"` if the data
   * is ahead of the running build.
   */
  async migrate(opts: MigrateOptions = {}): Promise<MigrateReport> {
    return this.json<MigrateReport>('POST', '/api/migrate', opts);
  }

  /**
   * Append a dated research note to `<slug>.talk.md`. The slug is the
   * article slug (server appends `.talk` itself). Returns the resolved
   * talk slug, the date filed under, and the new note's id.
   */
  async note(
    slug: string,
    note: string,
    opts: { by?: string; kind?: 'human' | 'agent' } = {},
  ): Promise<{ slug: string; date: string; id: string }> {
    return this.json('POST', `/api/notes/${slug}`, { note, ...opts });
  }

  async editNote(
    slug: string,
    id: string,
    note: string,
    opts: { by?: string } = {},
  ): Promise<{ slug: string; id: string; editedAt: string }> {
    return this.json('PATCH', `/api/notes/${slug}/${id}`, { note, ...opts });
  }

  async deleteNote(
    slug: string,
    id: string,
    opts: { by?: string } = {},
  ): Promise<{ slug: string; id: string; deletedAt: string }> {
    return this.json('DELETE', `/api/notes/${slug}/${id}`, opts);
  }

  async restoreNote(
    slug: string,
    id: string,
  ): Promise<{ slug: string; id: string }> {
    return this.json('POST', `/api/notes/${slug}/${id}/restore`);
  }

  /**
   * List all notes on a talk page (via the existing GET /api/pages and
   * a client-side parse). Returns the structured Note[].
   */
  async listNotes(slug: string): Promise<NoteSummary[]> {
    const talkSlug = slug.endsWith('.talk') ? slug : `${slug}.talk`;
    const page = await this.read(talkSlug);
    return parseNotesFromBody(page.body);
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* keep as text */ }
    if (!res.ok) {
      const detail = parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : text || undefined;
      if (res.status === 404) throw new NotFound(404, detail);
      if (res.status === 400) throw new BadRequest(400, detail);
      throw new ServerError(res.status, detail);
    }
    return parsed as T;
  }
}
