import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PWA_GLOB_PATTERNS,
  QUESTIONS_FILE_PATTERN,
  QUESTIONS_IMAGE_PATTERN,
  QUESTIONS_MANIFEST_PATTERN,
  pwaManifest,
  pwaOptions,
  pwaRuntimeCaching,
} from './pwaOptions'

const REPO_ROOT = resolve(__dirname, '..', '..')
const PUBLIC_DIR = resolve(REPO_ROOT, 'public')

describe('pwaOptions', () => {
  it('uses autoUpdate registration', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate')
  })

  it('declares precache glob patterns covering JS/CSS/HTML/JSON/icons', () => {
    expect(pwaOptions.workbox?.globPatterns).toEqual(PWA_GLOB_PATTERNS)
    const pattern = PWA_GLOB_PATTERNS[0]
    for (const ext of ['js', 'css', 'html', 'svg', 'png', 'ico', 'webmanifest', 'json']) {
      expect(pattern).toContain(ext)
    }
  })

  it('cleans up outdated caches on activation', () => {
    expect(pwaOptions.workbox?.cleanupOutdatedCaches).toBe(true)
  })
})

describe('pwaManifest', () => {
  it('has the required PWA fields for installability', () => {
    expect(pwaManifest.name).toBeTruthy()
    expect(pwaManifest.short_name).toBeTruthy()
    expect(pwaManifest.start_url).toBe('/exam_practice/')
    expect(pwaManifest.scope).toBe('/exam_practice/')
    expect(pwaManifest.display).toBe('standalone')
    expect(pwaManifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(pwaManifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('declares both 192x192 and 512x512 PNG icons', () => {
    const sizes = pwaManifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const icon of pwaManifest.icons) {
      expect(icon.type).toBe('image/png')
    }
  })

  it('includes a maskable variant for adaptive launchers', () => {
    const maskable = pwaManifest.icons.find((i) => i.purpose === 'maskable')
    expect(maskable).toBeDefined()
    expect(maskable?.sizes).toBe('512x512')
  })

  it('every referenced icon file exists in public/', () => {
    for (const icon of pwaManifest.icons) {
      const abs = resolve(PUBLIC_DIR, icon.src)
      expect(existsSync(abs), `missing icon file: ${icon.src}`).toBe(true)
    }
  })

  it('icon files start with the PNG magic header', () => {
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    for (const icon of pwaManifest.icons) {
      const abs = resolve(PUBLIC_DIR, icon.src)
      const head = readFileSync(abs).subarray(0, 8)
      expect(head.equals(magic), `${icon.src} is not a PNG`).toBe(true)
    }
  })
})

describe('pwaRuntimeCaching', () => {
  it('uses NetworkFirst for the topic manifest (so updates appear quickly)', () => {
    const entry = pwaRuntimeCaching.find(
      (r) => r.options.cacheName === 'questions-manifest',
    )
    expect(entry?.handler).toBe('NetworkFirst')
    expect(QUESTIONS_MANIFEST_PATTERN.test('/exam_practice/questions/manifest.json')).toBe(true)
    // The pattern is anchored at the end, so other JSON files don't match it.
    expect(QUESTIONS_MANIFEST_PATTERN.test('/exam_practice/questions/science/light.json')).toBe(false)
  })

  it('uses CacheFirst for topic JSON files (immutable per build)', () => {
    const entry = pwaRuntimeCaching.find(
      (r) => r.options.cacheName === 'questions-data',
    )
    expect(entry?.handler).toBe('CacheFirst')
    expect(QUESTIONS_FILE_PATTERN.test('/exam_practice/questions/science/physics/light.json')).toBe(
      true,
    )
  })

  it('uses CacheFirst for question images', () => {
    const entry = pwaRuntimeCaching.find(
      (r) => r.options.cacheName === 'questions-images',
    )
    expect(entry?.handler).toBe('CacheFirst')
    for (const ext of ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp']) {
      expect(QUESTIONS_IMAGE_PATTERN.test(`/exam_practice/assets/images/foo/bar.${ext}`)).toBe(true)
    }
  })

  it('every runtime cache entry has an expiration policy', () => {
    for (const entry of pwaRuntimeCaching) {
      expect(entry.options.expiration).toBeDefined()
      expect(entry.options.expiration.maxAgeSeconds).toBeGreaterThan(0)
    }
  })
})
