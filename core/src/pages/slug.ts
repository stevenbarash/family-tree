const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\.talk)?$/;

export const TALK_SUFFIX = '.talk';

export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s);
}

export function assertValidSlug(s: string): string {
  if (!isValidSlug(s)) {
    throw new Error(`invalid slug: ${JSON.stringify(s)}`);
  }
  return s;
}

export function isTalkSlug(s: string): boolean {
  return s.endsWith(TALK_SUFFIX);
}

export function toTalkSlug(s: string): string {
  return isTalkSlug(s) ? s : `${s}${TALK_SUFFIX}`;
}

export function toBaseSlug(s: string): string {
  return isTalkSlug(s) ? s.slice(0, -TALK_SUFFIX.length) : s;
}

/**
 * Title-case a slug for display: hyphens become spaces and the first
 * letter of each word is capitalized. The `.talk` suffix is stripped
 * before the conversion.
 */
export function titleCaseFromSlug(slug: string): string {
  const base = toBaseSlug(slug);
  return base.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : '')).join(' ');
}

/**
 * Canonicalize a user-provided title into the slug shape that
 * `isValidSlug` accepts. Apostrophes are dropped (no separator);
 * everything else non-alphanumeric becomes a hyphen, then leading/
 * trailing hyphens are stripped. The optional `.talk` suffix is
 * preserved.
 */
export function toSlug(input: string): string {
  const trimmed = input.trim();
  const talk = trimmed.endsWith('.talk');
  const base = talk ? trimmed.slice(0, -5) : trimmed;
  const slug = base
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return talk ? `${slug}.talk` : slug;
}
