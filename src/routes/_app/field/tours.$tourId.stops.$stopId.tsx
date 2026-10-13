import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { enumParam } from '@/lib/search/params'
import { DeploymentPage } from '@/modules/field/components/deployment-page'

/** Deployment (SCREENS.md §6.3). Owner: H4 (Field service). Mobile-first on-site screen. */
const searchSchema = z.object({
  tab: enumParam(['instructions', 'devices', 'contact', 'finish']),
})

export const Route = createFileRoute('/_app/field/tours/$tourId/stops/$stopId')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('tours.execute_own'),
  staticData: { title: 'Deployment' },
  component: DeploymentRoute,
})

function DeploymentRoute() {
  const { tourId, stopId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DeploymentPage
      key={`${tourId}:${stopId}`}
      tourId={Number(tourId)}
      stopId={Number(stopId)}
      tab={tab}
      onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })}
    />
  )
}
