/**
 * Format an ISO-8601 timestamp as a short relative string ("just now",
 * "5m ago", "2h ago", "yesterday", "3d ago", or the literal date for
 * anything older than a week).
 */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return then.toISOString().slice(0, 10);
}
