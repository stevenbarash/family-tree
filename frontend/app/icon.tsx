import { renderMonogram } from '@/lib/pwa-icon';

export const contentType = 'image/png';

/**
 * Emit two icon sizes from one file: 192 (Android minimum) + 512 (Android
 * recommended + maskable target). Next builds `/icon/[id]` routes from these;
 * the manifest references them at the exact sizes the browser asks for, so
 * the home-screen install doesn't waste bytes rescaling a 512 down to 192.
 */
export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default function Icon({ id }: { id: string }) {
  return renderMonogram(id === '192' ? 192 : 512);
}
