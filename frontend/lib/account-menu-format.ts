/**
 * A localized relative time ("2 hours ago") for a JWT `iat` claim.
 * `iatSeconds` is Unix seconds (the JWT convention); `now` is Unix
 * milliseconds (`Date.now()` convention) and is a parameter so the
 * bucketing is testable without a real clock. Picks the largest unit
 * that keeps the magnitude readable: seconds < 60s, minutes < 60min,
 * hours < 24h, otherwise days.
 */
export function relativeSignIn(
  iatSeconds: number,
  now: number,
  locale: string,
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const elapsedSec = Math.round(now / 1000 - iatSeconds);
  // Bucket on the raw elapsed seconds so the thresholds are exact — picking
  // the unit off a pre-rounded value double-rounds and blurs the boundary.
  // RelativeTimeFormat expects a negative value for the past.
  if (elapsedSec < 60) return rtf.format(-elapsedSec, 'second');
  if (elapsedSec < 3600) return rtf.format(-Math.round(elapsedSec / 60), 'minute');
  if (elapsedSec < 86400) return rtf.format(-Math.round(elapsedSec / 3600), 'hour');
  return rtf.format(-Math.round(elapsedSec / 86400), 'day');
}
