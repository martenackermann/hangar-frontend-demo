import { createStore, type UseStore } from 'idb-keyval'
import {
  DB_PREFIX,
  LEGACY_DB_KEYS,
  metaKey,
  planSave,
  readPersisted,
  type DemoStorage,
  type PersistedDatabase,
} from './persistence'

/**
 * IndexedDB persistence for the demo database (`hangar-demo` → `database`, records under
 * `hangar.demo-db.v4/…`, see `./persistence.ts`). The stored database is read once, in one
 * transaction, before the database opens (so `read()` stays synchronous); every save is one
 * readwrite transaction (read the current meta record, write the changed records and the new
 * meta), so a half-written save can never be read back.
 */
export async function openIndexedDbStorage(): Promise<DemoStorage | null> {
  let store: UseStore
  let persisted: PersistedDatabase | undefined
  try {
    store = createStore('hangar-demo', 'database')
    const values = await loadAll(store)
    persisted = readPersisted((key) => values.get(key))
  } catch {
    return null // private mode / IndexedDB unavailable: in memory only
  }
  return {
    read: () => persisted,
    write: (request) =>
      store('readwrite', (objects) => {
        const tx = objects.transaction
        return new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
          const current = objects.get(metaKey())
          current.onsuccess = () => {
            try {
              const plan = planSave(current.result, request)
              if (plan.clear) objects.clear()
              for (const key of plan.deletes) objects.delete(key)
              for (const [key, value] of plan.puts) objects.put(value, key)
              if (typeof tx.commit === 'function') tx.commit() // don't wait for idle
            } catch (error) {
              tx.abort() // e.g. a row that cannot be cloned: keep the previous state
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          }
        })
      }),
  }
}

/**
 * Every stored record, in one transaction that also drops the single-snapshot format of older
 * builds (`hangar.demo-db.v3`, ~5 MB).
 */
function loadAll(store: UseStore): Promise<Map<string, unknown>> {
  return store('readwrite', (objects) => {
    const tx = objects.transaction
    return new Promise<Map<string, unknown>>((resolve, reject) => {
      for (const key of LEGACY_DB_KEYS) objects.delete(key)
      const range = IDBKeyRange.bound(`${DB_PREFIX}/`, `${DB_PREFIX}/￿`)
      const keys = objects.getAllKeys(range)
      const values = objects.getAll(range)
      tx.oncomplete = () => {
        const map = new Map<string, unknown>()
        keys.result.forEach((key, index) => {
          if (typeof key === 'string') map.set(key, values.result[index])
        })
        resolve(map)
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted'))
    })
  })
}
