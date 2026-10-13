import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import {
  boolParam,
  dateParam,
  idListParam,
  listParam,
  listSearchDefaults,
  listSearchSchema,
} from '@/lib/search/params'
import { CallOffListPage } from '@/modules/stock/components/calloff-list-page'

/** Call-off orders (SCREENS.md §7.2). Owner: H5. `?new=true` opens "New call-off order". */
const searchSchema = listSearchSchema.extend({
  siteId: idListParam(),
  status: listParam(['draft', 'sent', 'cancelled']),
  from: dateParam(),
  to: dateParam(),
  new: boolParam(),
})

export const Route = createFileRoute('/_app/stock/call-off-orders/')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Call-off orders' },
  component: CallOffOrdersRoute,
})

function CallOffOrdersRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CallOffListPage
      search={search}
      onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
