/**
 * Next.js startup hook — runs once when the server process boots. Bootstraps
 * the data repo onto the persistent disk and starts the sync scheduler.
 * Guarded to the Node.js runtime so it never loads into the edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootstrapAndStartSync } = await import('./lib/sync.ts');
  await bootstrapAndStartSync();
}
