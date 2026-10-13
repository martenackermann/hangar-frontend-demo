import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/guards'
import { businessToday } from '@/lib/format'
import { dateParam, idParam } from '@/lib/search/params'
import { MyTour } from '@/modules/field/components/my-tour'

/** My tour (SCREENS.md §6.2). Owner: H4 (Field service). Mobile-first technician view. */
const searchSchema = z.object({
  date: dateParam(),
  tourId: idParam(),
})

export const Route = createFileRoute('/_app/field/my-tour')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('tours.execute_own'),
  staticData: { title: 'My tour' },
  component: MyTourPage,
})

function MyTourPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const today = businessToday()
  const date = search.date ?? today
  return (
    <MyTour
      date={date}
      tourId={search.tourId}
      onDateChange={(next) =>
        void navigate({ search: { date: next === today ? undefined : next, tourId: undefined } })
      }
      onTourChange={(tourId) => void navigate({ search: (prev) => ({ ...prev, tourId }) })}
    />
  )
}
