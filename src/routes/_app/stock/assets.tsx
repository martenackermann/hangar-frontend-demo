import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import {
  boolParam,
  dateParam,
  idListParam,
  idParam,
  listParam,
  listSearchDefaults,
  listSearchSchema,
  stringParam,
} from '@/lib/search/params'
import { AssetsPage } from '@/modules/stock/components/assets-page'

/**
 * Assets (SCREENS.md §7.4). Owner: H5. Virtualized table, filters, saved views, bulk
 * mark missing / correct, CSV export; rows open the shared asset drawer (`?asset=`).
 */
const searchSchema = listSearchSchema.extend({
  status: listParam([
    'available',
    'assigned',
    'prepared',
    'provided',
    'in_use',
    'collected',
    'missing',
    'deactivated_returned',
    'deactivated_bought_out',
    'deactivated_disposed',
  ]),
  siteId: idListParam(),
  locationType: listParam([
    'goods_in',
    'staging',
    'goods_out',
    'return',
    'in_transit',
    'in_use',
    'off_fleet',
  ]),
  locationId: idListParam(),
  articleId: idListParam(),
  category: listParam([
    'laptop',
    'desktop',
    'tablet',
    'docking_station',
    'monitor',
    'headset',
    'keyboard',
    'mouse',
    'webcam',
    'bag',
    'accessory',
  ]),
  source: listParam(['import_new', 'import_status_sync', 'technician_scan', 'manual', 'seed']),
  installationPlace: stringParam(),
  hasInstallationPlace: boolParam(),
  serviceRequestId: idParam(),
  checkedInFrom: dateParam(),
  checkedInTo: dateParam(),
})

export const Route = createFileRoute('/_app/stock/assets')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(listSearchDefaults)] },
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Assets' },
  component: AssetsRoute,
})

function AssetsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AssetsPage
      search={search}
      onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
      onReplaceSearch={(next) =>
        void navigate({
          search: (prev) => ({
            ...(next as typeof prev),
            asset: prev.asset,
            tab: prev.tab,
            page: 1,
            perPage: prev.perPage,
          }),
        })
      }
    />
  )
}
