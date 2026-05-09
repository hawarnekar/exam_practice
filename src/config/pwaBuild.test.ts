import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Sanity checks against the most recently built dist/ (run `npm run build`
// first). Skipped automatically when dist/ doesn't exist so contributors who
// haven't built locally don't see a red bar.
const REPO_ROOT = resolve(__dirname, '..', '..')
const DIST_DIR = resolve(REPO_ROOT, 'dist')

const itIfBuilt = existsSync(DIST_DIR) ? it : it.skip

describe('PWA build output', () => {
  itIfBuilt('emits sw.js and registerSW.js', () => {
    expect(existsSync(resolve(DIST_DIR, 'sw.js'))).toBe(true)
    expect(existsSync(resolve(DIST_DIR, 'registerSW.js'))).toBe(true)
  })

  itIfBuilt('emits a manifest.webmanifest with all required PWA fields', () => {
    const path = resolve(DIST_DIR, 'manifest.webmanifest')
    expect(existsSync(path)).toBe(true)
    const m = JSON.parse(readFileSync(path, 'utf8'))
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    expect(m.start_url).toBe('/exam_practice/')
    expect(m.display).toBe('standalone')
    expect(Array.isArray(m.icons)).toBe(true)
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true)
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
  })

  itIfBuilt('precaches the question manifest and at least one topic file', () => {
    const sw = readFileSync(resolve(DIST_DIR, 'sw.js'), 'utf8')
    expect(sw).toMatch(/questions\/manifest\.json/)
    expect(sw).toMatch(/questions\/science\/physics\/light\.json/)
  })

  itIfBuilt('configures NetworkFirst and CacheFirst runtime strategies', () => {
    const sw = readFileSync(resolve(DIST_DIR, 'sw.js'), 'utf8')
    expect(sw).toMatch(/NetworkFirst/)
    expect(sw).toMatch(/CacheFirst/)
    expect(sw).toMatch(/questions-manifest/)
    expect(sw).toMatch(/questions-data/)
    expect(sw).toMatch(/questions-images/)
  })

  itIfBuilt('emits all PWA icons referenced by the manifest', () => {
    for (const name of [
      'pwa-64x64.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'maskable-icon-512x512.png',
    ]) {
      expect(existsSync(resolve(DIST_DIR, name)), `missing dist/${name}`).toBe(true)
    }
  })
})
