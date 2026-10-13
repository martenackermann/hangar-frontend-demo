import { FilePlus2, RefreshCw, ScanBarcode } from 'lucide-react'
import { api } from '@/lib/api/client'
import type { InventorySummary, Page } from '@/lib/api/types'
import { getMe } from '@/lib/auth/store'
import type { CommandDescriptor } from '@/lib/registry'
import { startRecalculation } from './api'

/**
 * ⌘K actions contributed by H5 (SCREENS.md §1.3), shown only with `permission`.
 * "Start inventory scan" jumps into the open inventory of the user's home site (or the only
 * open one); otherwise it lands on the inventory list where one can be opened.
 */
export const commands: CommandDescriptor[] = [
  {
    id: 'stock.inventory-scan',
    label: 'Start inventory scan',
    icon: ScanBarcode,
    permission: 'inventory.scan',
    keywords: ['inventory', 'stock-take', 'count', 'scan'],
    run: async ({ navigate }) => {
      const open = await api
        .get<Page<InventorySummary>>('/inventories', { query: { status: 'open', perPage: 50 } })
        .then((page) => page.data)
        .catch(() => [] as InventorySummary[])
      const home = getMe()?.homeSite?.id
      const target =
        open.find((inventory) => inventory.site.id === home) ??
        (open.length === 1 ? open[0] : undefined)
      navigate(target ? `/stock/inventory/${target.id}` : '/stock/inventory')
    },
  },
  {
    id: 'stock.calloff-new',
    label: 'New call-off order…',
    icon: FilePlus2,
    permission: 'calloff.manage',
    keywords: ['order', 'replenish', 'call-off'],
    run: ({ navigate }) => navigate('/stock/call-off-orders?new=true'),
  },
  {
    id: 'stock.recalculate',
    label: 'Recalculate stock',
    icon: RefreshCw,
    permission: 'stock.recalculate',
    keywords: ['matrix', 'demand', 'buffer'],
    run: ({ queryClient }) => startRecalculation(queryClient),
  },
]
