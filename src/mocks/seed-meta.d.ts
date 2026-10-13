/**
 * `meta` of `src/mocks/fixtures/seed.json`, inlined at build time by the `hangar:seed-meta`
 * plugin (vite.config.ts) so a restored demo database can be checked against the fixture
 * without fetching it.
 */
declare module 'virtual:hangar-seed-meta' {
  const meta: {
    version: number
    generatedAt: string
    anchorDate: string
    source: 'hand-made' | 'backend'
  }
  export default meta
}
