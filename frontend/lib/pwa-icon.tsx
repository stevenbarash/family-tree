import { ImageResponse } from 'next/og';

/**
 * Shared monogram-renderer for `app/icon.tsx` (Android home-screen,
 * 192 + 512 sizes) and `app/apple-icon.tsx` (iOS home-screen, 180px).
 *
 * Design constraints captured here in one place so the two callers
 * can't drift:
 *
 *  - Brand foreground `#fafafa` on background `#0a0a0a` matches the
 *    wiki's `--foreground` / `--background` in dark mode and reads as
 *    intentional on both light and dark OS launchers.
 *  - Letter width ≈ 62.5% of canvas keeps the glyph inside the 80%
 *    safe-zone radius required by the PWA `maskable` icon spec, so
 *    the same bytes serve both `purpose: 'any'` and `purpose: 'maskable'`
 *    manifest entries cleanly.
 *  - `fontFamily: 'serif'` uses ImageResponse's built-in serif fallback;
 *    importing the Fraunces font file would require shipping it to
 *    `next/og`'s edge runtime, which is more weight than this single
 *    glyph justifies.
 */
export function renderMonogram(px: number): ImageResponse {
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
