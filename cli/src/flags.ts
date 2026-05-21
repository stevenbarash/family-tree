/**
 * Parse a CLI flag value as a positive integer, falling back to
 * `fallback` for anything that isn't one — a bare flag (boolean `true`),
 * a missing flag (`undefined`), a non-numeric string, or a zero/negative
 * value.
 *
 * Replaces the `parseInt(String(x), 10) || fallback` idiom, which
 * silently lets negatives through: `-5` is truthy, so `--limit -5`
 * reached the API query string and `--recent -3` became `git log -n -3`.
 */
export function parsePositiveInt(
  value: string | boolean | undefined,
  fallback: number,
): number {
  if (typeof value !== 'string') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
