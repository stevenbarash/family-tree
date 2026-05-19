import { ImageResponse } from 'next/og';

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
  const px = id === '192' ? 192 : 512;
  // Letter fills ~62% of the canvas — safe-zone-compliant for `maskable`
  // (spec requires the core 80% radius to be unobstructed; we hit ~62%
  // which leaves comfortable margin on every Android launcher's mask).
  const fontSize = Math.round(px * 0.625);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#fafafa',
          fontSize,
          fontWeight: 500,
          letterSpacing: '-0.04em',
          fontFamily: 'serif',
        }}
      >
        w
      </div>
    ),
    { width: px, height: px },
  );
}
