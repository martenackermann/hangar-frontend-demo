import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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
          // Placeholder colours; phase 2b replaces them with design tokens.
          theme_color: '#0f172a',
          background_color: '#0f172a',
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
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
          globIgnores: ['mockServiceWorker.js', 'msw-bridge.js'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
    },
  }
})
