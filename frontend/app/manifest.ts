import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'whoami.wiki',
    short_name: 'whoami',
    description: 'Family-tree wiki, written by AI agents.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'en',
    dir: 'ltr',
    categories: ['lifestyle', 'productivity', 'reference'],
    icons: [
      // `/icon/192` and `/icon/512` are emitted by `app/icon.tsx`'s
      // generateImageMetadata — one route, two sizes, no scaling at install.
      // Each size is declared twice — once `any` (Android pre-maskable
      // fallback, also what most launchers use) and once `maskable` (the
      // "w" sits within the 80% safe zone, so the masked render is clean).
      // Same URL backs both purposes; the browser de-dupes on fetch.
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      // apple-icon is iOS-only; Apple's home screen does its own rounded-
      // corner masking, ignoring the maskable spec entirely.
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
