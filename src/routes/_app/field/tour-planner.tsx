import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { dateParam, enumParam, idListParam, idParam } from '@/lib/search/params'
import { PlannerPage } from '@/modules/field/components/planner-page'

/** Tour planner (SCREENS.md §6.1). Owner: H4 (Field service). Read with `tours.read`. */
const searchSchema = z.object({
  week: dateParam(),
  regionId: idListParam(),
  calendarId: idParam(),
  date: dateParam(),
  panel: enumParam(['tour', 'unmatched', 'sync']),
})

export const Route = createFileRoute('/_app/field/tour-planner')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('tours.read'),
  staticData: { title: 'Tour planner' },
  component: TourPlannerRoute,
})

function TourPlannerRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PlannerPage
      search={search}
      onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
