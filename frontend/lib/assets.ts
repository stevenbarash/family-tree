import { resolve, sep } from 'node:path';

export function resolveWikiAssetPath(root: string, parts: string[]): string | null {
  if (parts.length === 0) return null;
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0'))) {
    return null;
  }
  const assetRoot = resolve(root, 'assets');
  const filePath = resolve(assetRoot, ...parts);
  if (filePath !== assetRoot && filePath.startsWith(`${assetRoot}${sep}`)) {
    return filePath;
  }
  return null;
}

export function contentTypeForAsset(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
