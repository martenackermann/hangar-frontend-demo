import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { idParam, pageParam } from '@/lib/search/params'
import { DeactivationPage } from '@/modules/stock/components/deactivation-page'

/** Deactivation import (SCREENS.md §7.5, SPEC §6.10). Owner: H5. `?batch=` opens a result. */
const searchSchema = z.object({ batch: idParam(), page: pageParam() })

export const Route = createFileRoute('/_app/stock/deactivation')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  beforeLoad: requirePermission('assets.deactivate'),
  staticData: { title: 'Deactivation import' },
  component: DeactivationRoute,
})

function DeactivationRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DeactivationPage
      search={search}
      onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
