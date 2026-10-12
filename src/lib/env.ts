const DEFAULT_API_URL = 'http://localhost:8100/api/v1'

/**
 * Runtime configuration from Vite env variables (see .env.example).
 *
 * Note: code that should be dropped from non-demo bundles (dynamic imports of `@/mocks/*`)
 * must test `import.meta.env.VITE_DEMO_MODE === 'true'` inline, not `env.demoMode`,
 * so the bundler can see the constant and remove the branch.
 */
export const env = {
  apiUrl: (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, ''),
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
} as const
