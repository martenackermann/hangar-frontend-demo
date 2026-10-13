import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, PackageCheck, Printer, Truck } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BulkAction, BulkActionBar } from '@/components/data-table/bulk-action-bar'
import { IdInk } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { DrawerError } from '@/components/drawer/drawer-states'
import { useBulkAction, useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState, SkeletonRows, ToneBadge } from '@/components/ui/feedback'
import { Page, PageHeader, Toolbar } from '@/components/ui/page'
import { api } from '@/lib/api/client'
import { useHubs } from '@/lib/api/core'
import type { Page as ApiPage, TechnicianPicking, TourSummary } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { addWorkingDays, businessToday, formatDate, formatTime, isWorkingDay } from '@/lib/format'
import { dateParam, idParam } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { stagingQueries } from '@/modules/staging/api'
import { HubSelect } from '@/modules/staging/components/hub-select'
import { useHubId } from '@/modules/staging/hooks/use-hub'

/**
 * Picking for technicians (SCREENS.md §5.4): prepared requests of a hub with an appointment on
 * `date`, grouped by booking calendar and enriched with the tour of that day (`GET /tours`,
 * H4). Mark provided per row or in bulk; print a pick list.
 */
const searchSchema = z.object({ siteId: idParam(), date: dateParam() })
type Search = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/warehouse/picking')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Picking' },
  component: PickingPage,
})

type PickRow = TechnicianPicking['groups'][number]['serviceRequests'][number]

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  [data-print-root], [data-print-root] * { visibility: visible !important; }
  [data-print-root] { position: absolute; inset: 0; padding: 12mm; color: #000; background: #fff; }
  [data-print-hide] { display: none !important; }
}`

function stepWorkingDay(day: string, step: 1 | -1): string {
  return addWorkingDays(day, step)
}

function PickingPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const hubs = useHubs()
  const siteId = useHubId(search.siteId)
  const site = hubs.find((hub) => hub.id === siteId)
  const today = businessToday()
  const day = search.date ?? (isWorkingDay(today) ? today : addWorkingDays(today, 1))
  const canPick = useCan('fulfilment.pick')
  const canTours = useCan('tours.read')
  const [selected, setSelected] = useState<number[]>([])
  const bulk = useBulkAction('serviceRequest')

  const patch = (values: Partial<Search>) => {
    setSelected([])
    void navigate({ search: (prev) => ({ ...prev, ...values }) })
  }
  const query = useQuery({
    ...stagingQueries.technicianPicking({ siteId: siteId ?? 0, date: day }),
    enabled: siteId !== undefined,
  })
  const tours = useQuery({
    queryKey: ['tours', 'list', { from: day, to: day }],
    queryFn: ({ signal }) =>
      api.get<ApiPage<TourSummary>>('/tours', {
        query: { from: day, to: day, perPage: 100 },
        signal,
      }),
    enabled: canTours,
    retry: false,
    meta: { errorToast: false },
  })
  const tourOf = (calendarId: number | null) =>
    tours.data?.data.find((tour) => tour.calendar.id === calendarId && tour.tourDate === day)

  useShortcut('arrowleft', () => patch({ date: stepWorkingDay(day, -1) }), {
    description: 'Previous working day',
    group: 'Picking',
  })
  useShortcut('arrowright', () => patch({ date: stepWorkingDay(day, 1) }), {
    description: 'Next working day',
    group: 'Picking',
  })

  const data = query.data
  const openIds = (data?.groups ?? [])
    .flatMap((group) => group.serviceRequests)
    .filter((row) => !row.picked && row.availableActions.includes('mark_provided'))
    .map((row) => row.id)

  return (
    <Page>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title="Picking"
        meta={data ? `${data.totals.toPick} to pick · ${data.totals.picked} picked` : site?.name}
        actions={
          <>
            <Button icon={Printer} onClick={() => window.print()} disabled={!data}>
              Print pick list
            </Button>
            <HubSelect value={siteId} onChange={(next) => patch({ siteId: next })} />
          </>
        }
      />
      <Toolbar>
        <IconButton
          icon={ChevronLeft}
          label="Previous working day"
          shortcut="arrowleft"
          size="sm"
          onClick={() => patch({ date: stepWorkingDay(day, -1) })}
        />
        <DatePicker label="Date" value={day} onChange={(date) => patch({ date })} />
        <IconButton
          icon={ChevronRight}
          label="Next working day"
          shortcut="arrowright"
          size="sm"
          onClick={() => patch({ date: stepWorkingDay(day, 1) })}
        />
        {day !== today && (
          <Button size="sm" variant="ghost" onClick={() => patch({ date: undefined })}>
            Today
          </Button>
        )}
        {canPick && openIds.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(selected.length === openIds.length ? [] : openIds)}
          >
            {selected.length === openIds.length ? 'Clear selection' : 'Select all to pick'}
          </Button>
        )}
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto" data-print-root>
        <h2 className="hidden text-lg font-semibold print:block">
          Pick list · {site?.name} · {formatDate(day)}
        </h2>
        {query.isPending ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <DrawerError error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.groups.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing to pick for this date.">
            Orders appear here once they are closed and booked.
          </EmptyState>
        ) : (
          <div className="grid gap-4 p-4">
            {data.groups.map((group) => (
              <PickGroup
                key={`${group.calendar.id ?? 'none'}`}
                group={group}
                tour={tourOf(group.calendar.id)}
                canPick={canPick}
                selected={selected}
                onToggle={(id, on) =>
                  setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
                }
              />
            ))}
          </div>
        )}
      </div>
      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <BulkAction
          onClick={() =>
            bulk.mutate(
              { action: 'mark_provided', ids: selected },
              { onSuccess: () => setSelected([]) },
            )
          }
        >
          Mark provided
        </BulkAction>
      </BulkActionBar>
    </Page>
  )
}

function PickGroup({
  group,
  tour,
  canPick,
  selected,
  onToggle,
}: {
  group: TechnicianPicking['groups'][number]
  tour: TourSummary | undefined
  canPick: boolean
  selected: readonly number[]
  onToggle: (id: number, on: boolean) => void
}) {
  const enums = useEnums()
  const title = [
    group.calendar.name ?? 'No calendar',
    tour ? (tour.technician?.displayName ?? 'No technician') : null,
    tour ? enumLabel(enums, 'tourStatus', tour.status) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section aria-label={title} className="rounded-sm border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-fg-3">
          {group.serviceRequests.filter((row) => row.picked).length}/{group.serviceRequests.length}{' '}
          picked
        </span>
      </header>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-fg-3">
          <tr>
            <th className="w-9 px-3 py-1.5 font-medium" data-print-hide>
              <span className="sr-only">Select</span>
            </th>
            <th className="w-16 py-1.5 font-medium">Time</th>
            <th className="w-28 py-1.5 font-medium">SR number</th>
            <th className="py-1.5 font-medium">User</th>
            <th className="py-1.5 font-medium">Devices (goods-out)</th>
            <th className="w-48 px-3 py-1.5 text-right font-medium">Picked</th>
          </tr>
        </thead>
        <tbody>
          {group.serviceRequests.map((row) => (
            <PickRowView
              key={row.id}
              row={row}
              canPick={canPick}
              checked={selected.includes(row.id)}
              onToggle={(on) => onToggle(row.id, on)}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function PickRowView({
  row,
  canPick,
  checked,
  onToggle,
}: {
  row: PickRow
  canPick: boolean
  checked: boolean
  onToggle: (on: boolean) => void
}) {
  const drawer = useDrawerNavigation()
  const action = useWorkflowAction('serviceRequest', row, row.number)
  const pickable = canPick && !row.picked && row.availableActions.includes('mark_provided')
  const devices = row.items.filter((item) => item.direction === 'deliver')
  return (
    <tr className="border-t border-line-subtle align-top">
      <td className="px-3 py-2" data-print-hide>
        {pickable && (
          <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            aria-label={`Select ${row.number}`}
          />
        )}
      </td>
      <td className="hg-mono py-2">{formatTime(row.appointmentStartAt)}</td>
      <td className="py-2">
        <button
          type="button"
          className="hover:underline"
          onClick={() => drawer.open('sr', row.id, 'staging')}
        >
          <IdInk value={row.number} />
        </button>
      </td>
      <td className="py-2">{row.contact.displayName}</td>
      <td className="py-2">
        <ul className="grid gap-0.5">
          {devices.map((item) => (
            <li key={item.slot} className="flex items-center gap-2">
              <span aria-hidden className="hidden size-3 border border-black print:inline-block" />
              <IdInk value={item.asset?.assetTag ?? item.asset?.serialNumber} />
              <span className="truncate text-fg-2">
                {item.asset?.article?.name ?? item.requestedType}
              </span>
            </li>
          ))}
        </ul>
      </td>
      <td className="px-3 py-2 text-right">
        {row.picked ? (
          <ToneBadge tone="transit" icon={Truck}>
            Provided
          </ToneBadge>
        ) : pickable ? (
          <span data-print-hide>
            <Button
              size="sm"
              loading={action.isPending}
              onClick={() => action.mutate({ action: 'mark_provided' })}
            >
              Mark provided
            </Button>
          </span>
        ) : (
          <ToneBadge tone="workshop">To pick</ToneBadge>
        )}
      </td>
    </tr>
  )
}
