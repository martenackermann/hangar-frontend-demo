import { createStore, useSelector } from '@tanstack/react-store'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo } from 'react'

/**
 * Drawer state lives in the URL (SCREENS.md §1.5): `?sr=<id>&tab=<tabId>`, `?lr=`, `?asset=`,
 * `?mail=`. The `_app` layout declares these params, so every route can open every drawer.
 */
export type DrawerParam = 'sr' | 'lr' | 'asset' | 'mail'

export interface DrawerSearch {
  sr?: number | undefined
  lr?: number | undefined
  asset?: number | undefined
  mail?: number | undefined
  tab?: string | undefined
}

function pickDrawerSearch(search: DrawerSearch): DrawerSearch {
  return { sr: search.sr, lr: search.lr, asset: search.asset, mail: search.mail, tab: search.tab }
}

/**
 * The drawer params only: components re-render when a drawer param changes, not on every
 * filter keystroke of the page underneath.
 */
export function useDrawerSearch(): DrawerSearch {
  return useSearch({ strict: false, select: pickDrawerSearch, structuralSharing: true })
}

/** Open/close drawers and switch tabs without dropping the page's own search params. */
export function useDrawerNavigation() {
  const navigate = useNavigate()
  const patch = useCallback(
    (values: Partial<DrawerSearch>, replace = false) =>
      void navigate({
        to: '.',
        replace,
        search: ((prev: Record<string, unknown>) => ({ ...prev, ...values })) as never,
      }),
    [navigate],
  )
  // Stable for the component's lifetime, so `drawer.open` can be passed to memoized rows/cards.
  return useMemo(
    () => ({
      open: (param: DrawerParam, id: number, tab?: string) =>
        patch({
          sr: undefined,
          lr: undefined,
          asset: undefined,
          mail: undefined,
          [param]: id,
          tab,
        }),
      /** Move to another record of the same kind, keeping the tab. */
      move: (param: DrawerParam, id: number) => patch({ [param]: id }, true),
      setTab: (tab: string) => patch({ tab }, true),
      close: () =>
        patch({ sr: undefined, lr: undefined, asset: undefined, mail: undefined, tab: undefined }),
    }),
    [patch],
  )
}

// ---- siblings: "6 of 318" + prev/next -------------------------------------------------------

const siblingsStore = createStore<Partial<Record<DrawerParam, readonly number[]>>>({})

/**
 * Lists register the ids they show so the drawer bar can step through them (`K`/`J`, arrows):
 *   useDrawerSiblings('sr', rows.map((r) => r.id))
 */
export function useDrawerSiblings(param: DrawerParam, ids: readonly number[]): void {
  const signature = ids.join(',')
  useEffect(() => {
    siblingsStore.setState((prev) => ({
      ...prev,
      [param]: signature ? signature.split(',').map(Number) : [],
    }))
    return () => siblingsStore.setState((prev) => ({ ...prev, [param]: undefined }))
  }, [param, signature])
}

export function useSiblings(param: DrawerParam): readonly number[] {
  return useSelector(siblingsStore, (state) => state[param] ?? EMPTY)
}

const EMPTY: readonly number[] = []
