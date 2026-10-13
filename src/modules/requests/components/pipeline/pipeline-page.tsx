import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Bookmark, ChevronDown, Inbox, Kanban, RefreshCw, Send, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSavedViews, type BuiltInView } from '@/components/data-table/saved-views'
import { PipelineBoard } from '@/components/domain/pipeline-board'
import { KpiStrip, StatTile } from '@/components/domain/stat-tile'
import { useDrawerNavigation, useDrawerSearch } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Page, PageHeader, Toolbar } from '@/components/ui/page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { useHubs, useRegions } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { JobAccepted, ServiceRequestStatus } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatNumber } from '@/lib/format'
import { trackJob } from '@/lib/jobs'
import { useShortcut } from '@/lib/shortcuts'
import { apiQuery, pipelineKeys, pipelineSummaryQuery } from '@/modules/requests/api'
import { DELIVERY_TYPES, type PipelineSearch } from '@/modules/requests/search'
import { DispatchDialog } from '../dispatch-dialog'
import { ClosedColumn } from './closed-column'
import { COLUMN_PAGE } from './board'
import { StageColumn } from './stage-column'

const SORT_OPTIONS = [
  { value: 'appointmentStartAt', label: 'Appointment' },
  { value: 'statusChangedAt', label: 'Oldest in stage' },
  { value: '-importedAt', label: 'Newest import' },
] as const

type Patch = Partial<Record<keyof PipelineSearch, unknown>>

/**
 * Pipeline board (SCREENS.md §3.1, DESIGN.md §11.1 / comp `pipeline.html`): page head with
 * Board/Table, Sync appointments and the one amber action "Send due mails" → filter toolbar →
 * KPI strip → 7 stage columns + the collapsed Closed column.
 */
export function PipelinePage({
  search,
  onSearch,
}: {
  search: PipelineSearch
  onSearch: (patch: Patch, replace?: boolean) => void
}) {
  const enums = useEnums()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hubs = useHubs()
  const regions = useRegions()
  const drawer = useDrawerNavigation()
  const { sr: selectedId } = useDrawerSearch()
  const canDispatch = useCan('comms.dispatch')
  const canSync = useCan('appointments.manage')
  const canImport = useCan('imports.create')
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [closedExpanded, setClosedExpanded] = useState(false)
  const [limits, setLimits] = useState<Record<string, number>>({})

  const scope = apiQuery({
    siteId: search.siteId,
    regionId: search.regionId,
    deliveryType: search.deliveryType,
    vip: search.vip,
    campus: search.campus,
  })
  const summaryQuery = useQuery(pipelineSummaryQuery(scope))
  const summary = summaryQuery.data
  const riverton = regions.find((r) => r.code === 'riverton')

  const builtIns = useMemo<BuiltInView[]>(
    () => [
      { key: 'all-open', name: 'All open', search: {} },
      ...(riverton
        ? [{ key: 'riverton', name: 'My region: Riverton', search: { regionId: [riverton.id] } }]
        : []),
      { key: 'attention', name: 'Needs attention', search: { needsAttention: true } },
    ],
    [riverton],
  )
  const views = useSavedViews({ route: '/pipeline', builtIns, search })

  useShortcut('m', () => canDispatch && setDispatchOpen(true), {
    enabled: canDispatch,
    description: 'Send due mails',
    group: 'Actions',
  })

  const syncNow = () =>
    api.post<JobAccepted>('/appointments/sync', {}).then(
      (accepted) =>
        trackJob(queryClient, accepted, {
          title: 'Syncing appointments',
          invalidate: [pipelineKeys.all, ['service-requests']],
        }),
      (error: unknown) =>
        notify.error(isApiError(error) ? error.title : 'The sync could not start', {
          description: isApiError(error) ? error.detail : undefined,
        }),
    )

  const toggleStatus = (status: ServiceRequestStatus) => {
    const current = search.status ?? []
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    onSearch({ status: next.length ? next : undefined, view: undefined }, true)
  }

  const stages = summary?.stages ?? []
  const openStages = stages.filter((s) => s.stage !== 'closed')
  const closed = stages.find((s) => s.stage === 'closed')
  const inFlight = summary?.totals.open ?? 0
  const trends = summary?.trends
  const openDelta =
    trends && trends.open.length >= 8
      ? (trends.open[trends.open.length - 1] ?? 0) - (trends.open[trends.open.length - 8] ?? 0)
      : null
  const empty = summary !== undefined && stages.every((s) => s.count === 0)
  let firstCardColumn = openStages.findIndex((s) => s.count > 0)
  if (firstCardColumn < 0) firstCardColumn = 0

  return (
    <Page>
      <PageHeader
        title="Pipeline"
        meta={
          summary
            ? `${formatNumber(inFlight)} in flight · ${formatNumber(summary.totals.completedLast7Days)} deployed this week`
            : 'Globex Fleet AG rollout'
        }
        actions={
          <>
            <SegmentedControl
              label="View"
              value="board"
              onValueChange={(value) => {
                if (value === 'table')
                  void navigate({ to: '/service-requests', search: scope as never })
              }}
              options={[
                { value: 'board', label: 'Board', icon: Kanban },
                { value: 'table', label: 'Table', icon: Table2 },
              ]}
              className="max-md:hidden"
            />
            {canSync && (
              <Button icon={RefreshCw} onClick={() => void syncNow()} className="max-md:hidden">
                Sync appointments
              </Button>
            )}
            {canDispatch && (
              <Button
                variant="primary"
                icon={Send}
                shortcut="m"
                onClick={() => setDispatchOpen(true)}
              >
                Send due mails
              </Button>
            )}
          </>
        }
      />
      <Toolbar
        end={
          <>
            <Select
              prefix="Sort"
              label="Sort cards"
              value={search.sort ?? 'appointmentStartAt'}
              onValueChange={(sort) =>
                onSearch({ sort: sort === 'appointmentStartAt' ? undefined : sort }, true)
              }
              options={SORT_OPTIONS}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={Bookmark}
                  iconEnd={ChevronDown}
                  title="Saved view — stored in the URL"
                >
                  {views.active?.name ?? 'Custom view'}
                  {views.modified ? ' · modified' : ''}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Views</DropdownMenuLabel>
                {views.views.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    icon={view.icon}
                    onSelect={() =>
                      void navigate({ to: '/pipeline', search: views.searchFor(view) as never })
                    }
                  >
                    {view.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="hg-no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <Select
            prefix="Hub"
            label="Hub"
            value={search.siteId?.[0] ? String(search.siteId[0]) : 'all'}
            onValueChange={(value) =>
              onSearch({ siteId: value === 'all' ? undefined : [Number(value)], view: undefined })
            }
            options={[
              { value: 'all', label: 'All hubs' },
              ...hubs.map((hub) => ({ value: String(hub.id), label: hub.name })),
            ]}
          />
          <Select
            prefix="Region"
            label="Region"
            value={search.regionId?.[0] !== undefined ? String(search.regionId[0]) : 'all'}
            onValueChange={(value) =>
              onSearch({
                regionId:
                  value === 'all' ? undefined : value === 'none' ? ['none'] : [Number(value)],
                view: undefined,
              })
            }
            options={[
              { value: 'all', label: `All ${regions.length || ''}`.trim() },
              ...regions.map((region) => ({ value: String(region.id), label: region.name })),
              { value: 'none', label: 'Unresolved' },
            ]}
          />
          <Select
            prefix="Delivery"
            label="Delivery type"
            value={search.deliveryType?.[0] ?? 'any'}
            onValueChange={(value) =>
              onSearch({ deliveryType: value === 'any' ? undefined : [value], view: undefined })
            }
            options={[
              { value: 'any', label: 'Any' },
              ...DELIVERY_TYPES.map((type) => ({
                value: type,
                label: enumLabel(enums, 'deliveryType', type),
              })),
            ]}
          />
          <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
          <Switch
            label="Hide VIP"
            count={summary ? formatNumber(summary.totals.vipOpen) : undefined}
            checked={(search.vip ?? 'exclude') === 'exclude'}
            onCheckedChange={(hide) =>
              onSearch({ vip: hide ? undefined : 'include', view: undefined })
            }
          />
          <Switch
            label="Exceptions only"
            count={summary ? formatNumber(summary.totals.needsAttention) : undefined}
            checked={search.needsAttention === true}
            onCheckedChange={(on) =>
              onSearch({ needsAttention: on ? true : undefined, view: undefined })
            }
          />
        </div>
      </Toolbar>
      <KpiStrip>
        {summary ? (
          <>
            <StatTile
              label="Open requests"
              value={formatNumber(summary.totals.open)}
              spark={trends?.open}
              sparkLabels={trends?.days}
              delta={
                openDelta !== null
                  ? {
                      value: openDelta,
                      text: (
                        <>
                          {formatNumber(Math.abs(openDelta))}
                          <span className="font-normal text-fg-3"> vs last week</span>
                        </>
                      ),
                      goodWhen: 'down',
                    }
                  : undefined
              }
              to="/service-requests"
            />
            <StatTile
              label="Needs attention"
              alert={summary.totals.needsAttention > 0 ? 'caution' : undefined}
              value={formatNumber(summary.totals.needsAttention)}
              context="open requests with an exception"
              to="/service-requests"
              search={{ needsAttention: true }}
            />
            <StatTile
              label="Appointments today"
              value={formatNumber(summary.totals.appointmentsToday)}
              context="technician visits and handovers"
              to="/service-requests"
              search={{ hasAppointment: true, sort: 'appointmentStartAt' }}
            />
            <StatTile
              label="Deployed last 7 days"
              value={formatNumber(summary.totals.completedLast7Days)}
              spark={trends?.completed}
              sparkLabels={trends?.days}
              context={`${formatNumber(summary.totals.cancelledLast7Days)} cancelled`}
              to="/service-requests"
              search={{ includeClosed: true, stage: ['deployed'] }}
            />
            <StatTile
              label="VIP open"
              value={formatNumber(summary.totals.vipOpen)}
              context="handled personally, hidden by default"
              to="/service-requests"
              search={{ vip: 'only' }}
            />
            <StatTile
              label="Lead time, import → deployed"
              value={
                summary.totals.leadTimeDays === null ? '—' : summary.totals.leadTimeDays.toFixed(1)
              }
              unit="d median"
              context="requests deployed in the last 30 days"
            />
          </>
        ) : (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid gap-2 px-4 py-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))
        )}
      </KpiStrip>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-canvas" tabIndex={-1}>
        {summaryQuery.isError ? (
          <EmptyState icon={Kanban} title="The board could not be loaded.">
            <Button size="sm" onClick={() => void summaryQuery.refetch()}>
              Retry
            </Button>
          </EmptyState>
        ) : empty ? (
          <EmptyState
            icon={Inbox}
            title="No service requests yet. Import an ITSM export to get started."
            actions={
              canImport ? (
                <Button asChild variant="primary">
                  <Link to="/data/imports">Go to Imports</Link>
                </Button>
              ) : undefined
            }
          />
        ) : !summary ? (
          <div className="grid grid-cols-[repeat(7,minmax(172px,1fr))_136px] gap-px">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="grid content-start gap-2 p-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-[92px]" />
                <Skeleton className="h-[92px]" />
              </div>
            ))}
          </div>
        ) : (
          <PipelineBoard
            className={
              closedExpanded
                ? 'grid-cols-[repeat(8,minmax(172px,1fr))] max-md:grid-cols-[repeat(8,276px)]'
                : undefined
            }
          >
            {openStages.map((stage, index) => (
              <StageColumn
                key={stage.stage}
                summary={stage}
                next={stage.stage === 'deployed' ? undefined : stages[index + 1]}
                search={search}
                first={index === 0}
                limit={limits[stage.stage] ?? COLUMN_PAGE}
                onLimit={(limit) => setLimits((prev) => ({ ...prev, [stage.stage]: limit }))}
                selectedId={selectedId}
                focusFirst={index === firstCardColumn}
                onOpen={(id) => drawer.open('sr', id)}
                onToggleStatus={toggleStatus}
              />
            ))}
            {closed &&
              (closedExpanded ? (
                <StageColumn
                  summary={closed}
                  next={undefined}
                  search={search}
                  limit={limits.closed ?? COLUMN_PAGE}
                  onLimit={(limit) => setLimits((prev) => ({ ...prev, closed: limit }))}
                  selectedId={selectedId}
                  onOpen={(id) => drawer.open('sr', id)}
                  onToggleStatus={toggleStatus}
                />
              ) : (
                <ClosedColumn
                  summary={closed}
                  totals={summary.totals}
                  onExpand={() => setClosedExpanded(true)}
                />
              ))}
          </PipelineBoard>
        )}
      </div>
      <DispatchDialog open={dispatchOpen} onOpenChange={setDispatchOpen} />
    </Page>
  )
}
