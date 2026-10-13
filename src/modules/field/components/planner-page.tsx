import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Link2Off,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Page, PageHeader, Toolbar } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import type { ID } from '@/lib/api/types'
import { useRegions } from '@/lib/api/core'
import { useShortcut } from '@/lib/shortcuts'
import { addDays, businessToday, formatDate, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fieldQueries } from '@/modules/field/api'
import { weekMonday } from '@/modules/field/lib/time'
import { PlannerGrid, TechnicianLanes } from './planner-grid'
import { SyncPanel, UnmatchedPanel } from './planner-panels'
import { TourEditor } from './tour-editor'

export type PlannerPanel = 'tour' | 'unmatched' | 'sync'

export interface PlannerSearch {
  week?: string | undefined
  regionId?: number[] | undefined
  calendarId?: number | undefined
  date?: string | undefined
  panel?: PlannerPanel | undefined
}

/**
 * Tour planner (SCREENS.md §6.1): week grid of routes × days, technician lanes, the tour editor
 * side panel, unmatched appointments and the sync panel. All state lives in the URL.
 */
export function PlannerPage({
  search,
  onSearch,
}: {
  search: PlannerSearch
  onSearch: (patch: Partial<PlannerSearch>) => void
}) {
  const thisWeek = weekMonday(businessToday())
  const week = search.week ?? thisWeek
  const friday = addDays(week, 4)
  const regions = useRegions()
  const overview = useQuery({
    ...fieldQueries.overview({ from: week, to: friday, regionId: search.regionId }),
    placeholderData: keepPreviousData,
  })
  const tours = useQuery({
    ...fieldQueries.tours({ from: week, to: friday, perPage: 200, regionId: search.regionId }),
    placeholderData: keepPreviousData,
  })
  const unmatched = useQuery(
    fieldQueries.appointments({ unmatched: true, from: businessToday(), perPage: 1 }),
  )
  const syncState = useQuery(fieldQueries.syncState())
  const unmatchedCount = unmatched.data?.meta.total ?? 0
  const panel = search.panel
  const selected =
    search.calendarId && search.date ? { calendarId: search.calendarId, date: search.date } : null
  const totalAppointments =
    overview.data?.rows.reduce(
      (sum, row) => sum + row.cells.reduce((acc, cell) => acc + cell.appointmentCount, 0),
      0,
    ) ?? 0

  const setWeek = (next: string) => onSearch({ week: next === thisWeek ? undefined : next })
  const openCell = (calendarId: ID, date: string) => onSearch({ calendarId, date, panel: 'tour' })
  const closePanel = () => onSearch({ panel: undefined, calendarId: undefined, date: undefined })
  useShortcut('escape', closePanel, {
    enabled: Boolean(panel),
    description: 'Close panel',
    group: 'Tour planner',
  })

  return (
    <Page>
      <PageHeader
        title="Tour planner"
        meta={`Week of ${formatDate(week)} · ${overview.data?.rows.length ?? '…'} routes`}
        actions={
          <>
            <Button
              variant={panel === 'unmatched' ? 'primary' : 'secondary'}
              icon={Link2Off}
              count={unmatchedCount || undefined}
              onClick={() => onSearch({ panel: panel === 'unmatched' ? undefined : 'unmatched' })}
            >
              Unmatched
            </Button>
            <Button
              variant={panel === 'sync' ? 'primary' : 'secondary'}
              icon={RefreshCw}
              onClick={() => onSearch({ panel: panel === 'sync' ? undefined : 'sync' })}
            >
              {syncState.data?.lastIncrementalSyncAt
                ? `Synced ${formatRelative(syncState.data.lastIncrementalSyncAt)}`
                : 'Sync'}
            </Button>
          </>
        }
      />
      <Toolbar>
        <IconButton
          icon={ChevronLeft}
          label="Previous week"
          onClick={() => setWeek(addDays(week, -7))}
        />
        <span className="min-w-36 text-center text-sm font-medium">
          {week === thisWeek
            ? 'This week'
            : week === addDays(thisWeek, 7)
              ? 'Next week'
              : `${formatDate(week)} – ${formatDate(friday)}`}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Next week"
          onClick={() => setWeek(addDays(week, 7))}
        />
        {week !== thisWeek && (
          <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>
            Today
          </Button>
        )}
        <Select<string>
          label="Region"
          prefix="Region"
          value={search.regionId?.length === 1 ? String(search.regionId[0]) : 'all'}
          onValueChange={(value) =>
            onSearch({ regionId: value === 'all' ? undefined : [Number(value)] })
          }
          options={[
            { value: 'all', label: 'All regions' },
            ...regions.map((r) => ({ value: String(r.id), label: r.name })),
          ]}
          className="ml-2"
        />
      </Toolbar>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-4">
          {overview.isPending ? (
            <div className="grid gap-2" aria-busy="true">
              <Skeleton className="h-10" />
              <Skeleton className="h-64" />
            </div>
          ) : overview.isError ? (
            <EmptyState
              icon={TriangleAlert}
              title="The week could not be loaded."
              actions={<Button onClick={() => void overview.refetch()}>Retry</Button>}
            />
          ) : (
            <div className={cn('grid gap-6', overview.isPlaceholderData && 'opacity-60')}>
              {totalAppointments === 0 && (
                <EmptyState icon={CalendarRange} title="No appointments in this week." />
              )}
              <PlannerGrid overview={overview.data} selected={selected} onSelect={openCell} />
              <TechnicianLanes
                overview={overview.data}
                tours={tours.data?.data ?? []}
                onOpenTour={(tour) => openCell(tour.calendar.id, tour.tourDate)}
              />
            </div>
          )}
        </div>
        {panel && (
          <aside
            aria-label="Planner panel"
            className="w-[440px] shrink-0 overflow-y-auto border-l border-line bg-surface max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-full max-lg:max-w-[440px] max-lg:shadow-drawer"
          >
            {panel === 'tour' && selected ? (
              <TourEditor
                key={`${selected.calendarId}:${selected.date}`}
                calendarId={selected.calendarId}
                date={selected.date}
                onClose={closePanel}
              />
            ) : panel === 'unmatched' ? (
              <UnmatchedPanel onClose={closePanel} />
            ) : panel === 'sync' ? (
              <SyncPanel onClose={closePanel} />
            ) : null}
          </aside>
        )}
      </div>
    </Page>
  )
}
