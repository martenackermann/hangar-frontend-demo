import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createStore, del, get, set } from 'idb-keyval'
import type { ComponentProps } from 'react'

/**
 * Offline copy of selected queries (SCREENS.md §6.2: My tour stays readable without a
 * connection). A query opts in with `meta: { persist: true }` plus `gcTime: PERSIST_MAX_AGE`
 * (a query that is garbage-collected also leaves the saved copy). Everything else stays
 * memory-only.
 *
 * The copy lives in IndexedDB (`hangar-query` / `cache`), separate from the demo database.
 * Identity changes call `queryClient.clear()`, which empties the saved copy as well, so no
 * data of a previous persona survives a switch.
 */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000

const store = typeof indexedDB === 'undefined' ? undefined : createStore('hangar-query', 'cache')

const storage = store
  ? {
      getItem: async (key: string) => (await get<string>(key, store)) ?? null,
      setItem: (key: string, value: string) => set(key, value, store),
      removeItem: (key: string) => del(key, store),
    }
  : undefined

type PersistOptions = ComponentProps<typeof PersistQueryClientProvider>['persistOptions']

export const persistOptions: PersistOptions = {
  persister: createAsyncStoragePersister({
    storage,
    key: 'hangar.query-cache.v1',
    throttleTime: 1000,
  }),
  maxAge: PERSIST_MAX_AGE,
  // bump when persisted response shapes change
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.meta?.persist === true && query.state.status === 'success',
  },
}
