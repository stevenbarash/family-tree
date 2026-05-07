export const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function canonical(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, ' ').trim();
}
