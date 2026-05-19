import type { MetadataRoute } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { routing, LOCALE_DIR, type Locale } from '@/i18n/routing';

/**
 * Locale-aware manifest. Read at install time when the user adds the wiki to
 * their home screen — emits the right `lang`, `dir`, and localized
 * `description` for whatever locale the user is currently browsing.
 *
 * The `name` / `short_name` deliberately stay untranslated — `whoami.wiki`
 * is a brand string, not a translatable phrase. The locale-specific bits are:
 *
 *  - `description`: shown on the install confirmation sheet on Android.
 *  - `lang`: BCP-47 tag the OS uses to pick a font for the installed app's
 *    home-screen label (mostly cosmetic on iOS; helpful for Android RTL).
 *  - `dir`: `rtl` for Hebrew so the install sheet aligns correctly.
 *
 * Reading `cookies()` makes this route dynamic — Next won't cache the manifest
 * statically. That's the trade we make for per-locale install screens; the
 * manifest is fetched at most once per device per install, so dynamic cost
 * is negligible.
 *
 * `orientation` is intentionally omitted (defaults to "any"): the pedigree
 * chart, wide infoboxes, and lifespans timeline all benefit from a rotated
 * phone — locking portrait would be a usability regression on those pages.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const c = await cookies();
  const cookieLocale = c.get('NEXT_LOCALE')?.value;
  const locale: Locale = (routing.locales as readonly string[]).includes(cookieLocale ?? '')
    ? (cookieLocale as Locale)
    : routing.defaultLocale;

  const t = await getTranslations({ locale, namespace: 'Chrome.PWA' });

  return {
    name: 'whoami.wiki',
    short_name: 'whoami',
    description: t('description'),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: locale,
    dir: LOCALE_DIR[locale],
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
