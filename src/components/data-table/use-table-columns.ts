import { useMe } from '@/lib/auth/store'
import { useColumnPrefs } from './column-prefs'
import type { DataColumn } from './data-table'

/**
 * Column prefs for one table, persisted per user:
 *
 *   const cols = useTableColumns('service-requests', columns)
 *   <DataTable columns={columns} columnPrefs={cols.prefs} … />
 *   <FilterBar … end={<ColumnChooser columns={columns} prefs={cols.prefs} onChange={cols.setPrefs} onReset={cols.reset} />} />
 */
export function useTableColumns<T>(tableId: string, columns: readonly DataColumn<T>[]) {
  const me = useMe()
  return useColumnPrefs(tableId, me ? String(me.id) : 'anonymous', columns)
}
