import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any props: the descriptor types them
export type PreloadableComponent<C extends ComponentType<any>> = LazyExoticComponent<C> & {
  /** Start loading the chunk now (e.g. when a drawer opens, before its tab is shown). */
  preload: () => Promise<unknown>
}

/**
 * A slice component loaded on first render, so registry descriptors (drawer tabs, action
 * dialogs, param drawers) stay tiny and the shell does not ship every slice's UI up front.
 * Render it inside `<Suspense>`; the drawer frames and the action bar already do.
 *
 *   component: lazyNamed(() => import('@/modules/staging/components/staging-tab'), 'StagingTab')
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any props: the descriptor types them
export function lazyNamed<M extends Record<K, ComponentType<any>>, K extends keyof M>(
  load: () => Promise<M>,
  key: K,
): PreloadableComponent<M[K]> {
  let pending: Promise<M> | undefined
  const preload = () => (pending ??= load())
  const component = lazy(async () => ({ default: (await preload())[key] }))
  return Object.assign(component, { preload })
}

/** Preload every lazily registered component in `items` (ignores eager ones). */
export function preloadComponents(
  items: readonly { component: unknown; preload?: () => Promise<unknown> }[],
): void {
  for (const item of items) {
    const preload = item.preload ?? (item.component as { preload?: () => Promise<unknown> }).preload
    if (preload) void preload()
  }
}
