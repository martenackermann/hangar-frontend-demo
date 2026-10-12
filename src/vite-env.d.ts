/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  /** Base URL of hangar-backend-demo, e.g. http://localhost:8100/api/v1 (demo mode: /api/v1). */
  readonly VITE_API_URL?: string
  /** "true" = run against the in-browser MSW mock API. */
  readonly VITE_DEMO_MODE?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
