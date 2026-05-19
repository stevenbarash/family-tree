/**
 * Format an ISO-8601 timestamp as a short relative string in the active
 * locale ("5 minutes ago" / "5 минут назад" / "yesterday" / "вчера" /
 * etc.). Uses `Intl.RelativeTimeFormat` with `numeric: 'auto'` so "1 day
 * ago" renders as "yesterday" in supporting locales.
 *
 * For anything older than ~a week, falls back to the locale's date
 * format via `toLocaleDateString` — relative durations get noisy past
 * that threshold.
 */
export function formatRelative(
  iso: string | null | undefined,
  locale: string,
  now = new Date(),
): string {
  if (!iso) return '';
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diffMs < 0) return rtf.format(0, 'second');
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return rtf.format(0, 'second');
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.floor(hr / 24);
  if (day < 7) return rtf.format(-day, 'day');
  return then.toLocaleDateString(locale);
}
