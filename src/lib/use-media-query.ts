import { useCallback, useSyncExternalStore } from 'react'

/** One `MediaQueryList` per query string, shared by every subscriber. */
const lists = new Map<string, MediaQueryList>()

function mediaList(query: string): MediaQueryList {
  let list = lists.get(query)
  if (!list) {
    list = window.matchMedia(query)
    lists.set(query, list)
  }
  return list
}

/** `true` while the media query matches (false during SSR/tests without matchMedia). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = mediaList(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => mediaList(query).matches,
    () => false,
  )
}
