import { lazy, Suspense } from 'react'

/** Router + Query devtools, development only (tree-shaken from builds). */
const LazyDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackRouterDevtools }, { ReactQueryDevtools }] = await Promise.all([
        import('@tanstack/react-router-devtools'),
        import('@tanstack/react-query-devtools'),
      ])
      return {
        default: function Devtools() {
          return (
            <>
              <TanStackRouterDevtools position="bottom-left" />
              <ReactQueryDevtools buttonPosition="bottom-right" />
            </>
          )
        },
      }
    })
  : null

export function Devtools() {
  // Hidden under browser automation (Playwright e2e/screenshots) so the toggles never overlap the UI.
  if (!LazyDevtools || navigator.webdriver) return null
  return (
    <Suspense fallback={null}>
      <LazyDevtools />
    </Suspense>
  )
}
