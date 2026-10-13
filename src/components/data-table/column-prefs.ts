import { useCallback, useState } from 'react'

/**
 * Column visibility + order per table, persisted per user in localStorage (SCREENS.md §0
 * "Tables"). Key: `hangar.table.<tableId>.<userKey>.v1`.
 */
export interface ColumnPrefs {
  hidden: string[]
  order: string[]
}

export interface ColumnMeta {
  id: string
  defaultHidden?: boolean | undefined
  locked?: boolean | undefined
}

function storageKey(tableId: string, userKey: string): string {
  return `hangar.table.${tableId}.${userKey}.v1`
}

export function defaultColumnPrefs(columns: readonly ColumnMeta[]): ColumnPrefs {
  return {
    hidden: columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id),
    order: columns.map((c) => c.id),
  }
}

/** Merge stored prefs with the current column set (new columns appended, removed ones dropped). */
export function reconcileColumnPrefs(
  stored: Partial<ColumnPrefs> | null,
  columns: readonly ColumnMeta[],
): ColumnPrefs {
  const defaults = defaultColumnPrefs(columns)
  if (!stored) return defaults
  const ids = new Set(columns.map((c) => c.id))
  const locked = new Set(columns.filter((c) => c.locked).map((c) => c.id))
  const order = (stored.order ?? []).filter((id) => ids.has(id))
  for (const column of columns) if (!order.includes(column.id)) order.push(column.id)
  const hidden = (stored.hidden ?? defaults.hidden).filter((id) => ids.has(id) && !locked.has(id))
  return { hidden, order }
}

function readPrefs(key: string, columns: readonly ColumnMeta[]): ColumnPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return reconcileColumnPrefs(raw ? (JSON.parse(raw) as Partial<ColumnPrefs>) : null, columns)
  } catch {
    return defaultColumnPrefs(columns)
  }
}

export function useColumnPrefs(tableId: string, userKey: string, columns: readonly ColumnMeta[]) {
  const key = storageKey(tableId, userKey)
  const signature = `${key}|${columns
    .map((c) => `${c.id}:${c.defaultHidden ? 1 : 0}:${c.locked ? 1 : 0}`)
    .join('|')}`
  const [state, setState] = useState(() => ({ signature, prefs: readPrefs(key, columns) }))
  // Table or column set changed: re-read (state adjustment during render, no effect needed).
  let current = state
  if (state.signature !== signature) {
    current = { signature, prefs: readPrefs(key, columns) }
    setState(current)
  }

  const setPrefs = useCallback(
    (next: ColumnPrefs) => {
      setState((prev) => ({ ...prev, prefs: next }))
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(next))
      } catch {
        // ignore (private mode)
      }
    },
    [key],
  )

  const reset = useCallback(() => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // ignore
    }
    setState((prev) => ({ ...prev, prefs: defaultColumnPrefs(columns) }))
  }, [key, columns])

  return { prefs: current.prefs, setPrefs, reset }
}
