import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Preload the two latin font files (DESIGN.md §15) once their hashed names are known. */
function preloadFonts(): Plugin {
  const pattern =
    /(archivo-latin-wdth-normal|atkinson-hyperlegible-mono-latin-wght-normal)-[\w-]+\.woff2$/
  return {
    name: 'hangar:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((file) => pattern.test(file))
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${file}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

const SEED_FILE = fileURLToPath(new URL('./src/mocks/fixtures/seed.json', import.meta.url))
const SEED_META = 'virtual:hangar-seed-meta'

/**
 * `virtual:hangar-seed-meta`: the `meta` of seed.json as a tiny module (src/mocks/seed-meta.d.ts),
 * so demo mode can check its stored database against the fixture without fetching the ~5 MB file.
 */
function seedMeta(): Plugin {
  const resolved = `\0${SEED_META}`
  return {
    name: 'hangar:seed-meta',
    resolveId: (id) => (id === SEED_META ? resolved : undefined),
    load(id) {
      if (id !== resolved) return undefined
      this.addWatchFile(SEED_FILE)
      const { meta } = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { meta: unknown }
      return `export default ${JSON.stringify(meta)}`
    },
  }
}

/**
 * Demo builds: main.tsx imports the mock layer (src/mocks/browser.ts) before the first render.
 * Preload it with its chunks so it downloads in parallel with the entry instead of after it.
 */
function preloadDemoMocks(): Plugin {
  return {
    name: 'hangar:preload-demo-mocks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle ?? {}
        const entry = Object.values(bundle).find(
          (output) =>
            output.type === 'chunk' && output.facadeModuleId?.endsWith('/src/mocks/browser.ts'),
        )
        if (!entry) return []
        const files = new Set<string>()
        const visit = (file: string) => {
          const output = bundle[file]
          if (files.has(file) || output?.type !== 'chunk') return
          files.add(file)
          output.imports.forEach(visit)
        }
        visit(entry.fileName)
        return [...files]
          .filter((file) => !html.includes(`/${file}"`))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: '', href: `/${file}` },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const demoMode = env.VITE_DEMO_MODE === 'true'

  return {
    plugins: [
      // Must come before react(). Reads tsr.config.json (routes in src/routes,
      // generates src/routeTree.gen.ts, automatic route code splitting).
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      preloadFonts(),
      seedMeta(),
      ...(demoMode ? [preloadDemoMocks()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        // Demo builds: MSW registers /sw.js itself (src/mocks/browser.ts). A second registration
        // from registerSW.js races it on the first visit: MSW reloads a page that is not yet
        // controlled while the worker installs, in a loop until precaching is done.
        injectRegister: demoMode ? false : 'auto',
        // Never run the PWA service worker in dev: it would fight the MSW worker and cache HMR assets.
        devOptions: { enabled: false },
        // public/ assets are precached through workbox.globPatterns below.
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: 'Hangar',
          short_name: 'Hangar',
          description: 'IT-hardware rollout & logistics operations console (demo).',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // Graphite canvas (DESIGN.md §2.1, dark theme = default).
          theme_color: '#0f1215',
          background_color: '#0f1215',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Not precached (runtime-cached below instead): the demo fixture seed.json (~5 MB, only
          // needed to seed the in-browser database, which lives in IndexedDB) and the zxing WASM
          // (~1 MB, only for the camera scanner on browsers without BarcodeDetector).
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          globIgnores: ['mockServiceWorker.js', 'msw-bridge.js'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // largest: the demo mock layer chunk
          runtimeCaching: [
            {
              // Hashed name: a cached copy is always the right one. src/mocks/core/fixture.ts also
              // stores it here on the first visit (before this worker controls the page), so
              // "Reset demo data" works offline.
              urlPattern: /\/assets\/seed-[\w-]+\.json$/,
              handler: 'CacheFirst',
              options: { cacheName: 'hangar-seed', cacheableResponse: { statuses: [200] } },
            },
            {
              urlPattern: /\/assets\/zxing_reader-[\w-]+\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'hangar-wasm',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 2 },
              },
            },
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/mockServiceWorker\.js$/, /^\/msw-bridge\.js$/],
          // Demo builds: only one service worker can control the scope, so the MSW worker runs
          // inside the PWA worker via public/msw-bridge.js (which only forwards /api/ requests).
          // src/mocks/browser.ts registers /sw.js instead of /mockServiceWorker.js in builds.
          importScripts: demoMode ? ['/msw-bridge.js'] : [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    build: {
      sourcemap: true,
      // The only chunk above 500 kB is the demo mock layer (MSW + workflow engine + slice mocks,
      // ~760 kB), only in demo builds; faker (~415 kB) is a separate chunk loaded only to seed.
      chunkSizeWarningLimit: 1000,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // One chunk for the lucide icons instead of ~60 sub-kilobyte chunks shared between
            // routes (each one a request and a precache entry).
            groups: [{ name: 'icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ }],
          },
        },
      },
    },
  }
})
