import type { VitePWAOptions } from 'vite-plugin-pwa'

// Web App Manifest fields that vite-plugin-pwa will write to
// dist/manifest.webmanifest at build time.
export const pwaManifest = {
  name: 'Exam Practice',
  short_name: 'Exam Practice',
  description: 'Adaptive MCQ exam practice with per-topic mastery tracking',
  theme_color: '#1d4ed8',
  background_color: '#ffffff',
  display: 'standalone' as const,
  start_url: '/exam_practice/',
  scope: '/exam_practice/',
  icons: [
    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    {
      src: 'maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable' as const,
    },
  ],
}

// Patterns precached at install time. Includes the question JSON files and
// images so the app loads fully offline on first visit.
export const PWA_GLOB_PATTERNS = [
  '**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,json}',
]

export const QUESTIONS_MANIFEST_PATTERN = /\/questions\/manifest\.json$/
export const QUESTIONS_FILE_PATTERN = /\/questions\/.+\.json$/
export const QUESTIONS_IMAGE_PATTERN = /\/assets\/images\/.+\.(svg|png|jpg|jpeg|gif|webp)$/i

// Runtime caching strategies — applied to fetches that miss the precache
// (e.g. when content has been updated server-side since SW install).
//   - Topic manifest: NetworkFirst (so newly added topics show up promptly).
//   - Topic question files: CacheFirst (immutable per build).
//   - Question images: CacheFirst (immutable per build).
export const pwaRuntimeCaching = [
  {
    urlPattern: QUESTIONS_MANIFEST_PATTERN,
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'questions-manifest',
      networkTimeoutSeconds: 5,
      expiration: {
        maxEntries: 1,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      },
    },
  },
  {
    urlPattern: QUESTIONS_FILE_PATTERN,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'questions-data',
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      },
    },
  },
  {
    urlPattern: QUESTIONS_IMAGE_PATTERN,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'questions-images',
      expiration: {
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
      },
    },
  },
]

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: pwaManifest,
  workbox: {
    globPatterns: PWA_GLOB_PATTERNS,
    runtimeCaching: pwaRuntimeCaching,
    cleanupOutdatedCaches: true,
  },
}
