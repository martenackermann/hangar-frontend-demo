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
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
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
          // json: the demo fixture (seed.json) so demo mode works offline after the first visit.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm,json}'],
          globIgnores: ['mockServiceWorker.js', 'msw-bridge.js'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // seed.json is ~3.5 MB
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
      // The only chunk above 500 kB is the demo mock layer (MSW + faker + workflow engine),
      // loaded lazily and only in demo builds.
      chunkSizeWarningLimit: 1000,
    },
  }
})
