import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Clock, Gauge, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { KpiStrip, StatTile } from '@/components/domain/stat-tile'
import { Banner, EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Page, PageHeader, Toolbar } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { useHubs, useRegions } from '@/lib/api/core'
import type { DashboardKpis, Tone } from '@/lib/api/types'
import { useEnums } from '@/lib/enums'
import { addDays, formatDate, formatNumber, formatRelative, formatTime } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { stockQueries } from '../api'
import { ChartCard, ColumnChart, LineChart, StageBar } from './charts'
import { screenTarget } from './link-target'
import { ScreenLink } from './links'

const ALL = 'all'
const STALE_MS = 2 * 3_600_000

export interface DashboardSearch {
  siteId?: number | undefined
  regionId?: number | undefined
}

function dayLabels(points: readonly { date: string }[]) {
  return points.map((p) => formatDate(p.date))
}

function Freshness({
  label,
  at,
  staleAfter,
}: {
  label: string
  at: string | null
  staleAfter?: number
}) {
  const now = useNow()
  const stale = at !== null && staleAfter !== undefined && now - Date.parse(at) > staleAfter
  return (
    <span className={cn('inline-flex items-center gap-1.5', stale && 'text-tone-caution-fg')}>
      <Icon
        icon={stale ? Clock : RefreshCw}
        size={12}
        className={stale ? 'text-tone-caution' : 'text-fg-3'}
      />
      {label} <b className="font-medium">{at ? formatRelative(at) : 'never'}</b>
      {stale && <span>(over 2 h ago)</span>}
    </span>
  )
}

function TableSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-sm border border-line bg-surface">
      <h2 className="border-b border-line-subtle px-4 py-2.5 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

const th = 'h-8 px-3 text-left text-xs font-medium text-fg-3 whitespace-nowrap'
const td = 'h-row px-3 whitespace-nowrap'
const num = 'text-right font-mono tabular-nums'

function Tiles({
  kpis,
  scope,
}: {
  kpis: DashboardKpis
  scope: Record<string, number | undefined>
}) {
  const t = kpis.tiles
  const s = kpis.series
  const today = kpis.today
  const sr = (search: Record<string, unknown>) =>
    screenTarget('/service-requests', { ...scope, ...search })
  const weekDelta = t.completedThisWeek - t.completedLastWeek
  return (
    <div className="grid">
      <KpiStrip>
        <StatTile
          label="Open requests"
          value={formatNumber(t.openServiceRequests)}
          context="New requests per day, last 14 days"
          spark={s.importedPerDay.map((p) => p.count)}
          sparkLabels={dayLabels(s.importedPerDay)}
          {...sr({ vip: 'include' })}
        />
        <StatTile
          label="Needs attention"
          value={formatNumber(t.needsAttention)}
          alert={t.needsAttention > 0 ? 'caution' : undefined}
          context="Open requests with an attention flag"
          {...sr({ needsAttention: true })}
        />
        <StatTile
          label="Appointments today"
          value={formatNumber(t.appointmentsToday)}
          context={`${formatNumber(t.appointmentsThisWeek)} this week`}
          spark={s.appointmentsPerDay.map((p) => p.count)}
          sparkLabels={dayLabels(s.appointmentsPerDay)}
          {...sr({ appointmentFrom: today, appointmentTo: today })}
        />
        <StatTile
          label="Completed this week"
          value={formatNumber(t.completedThisWeek)}
          delta={{
            value: weekDelta,
            text: `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week (${t.completedLastWeek})`,
            goodWhen: 'up',
          }}
          spark={s.completionsPerDay.map((p) => p.count)}
          sparkLabels={dayLabels(s.completionsPerDay)}
          {...sr({ status: 'completed', includeClosed: true })}
        />
      </KpiStrip>
      <KpiStrip>
        <StatTile
          label="Escalated"
          value={formatNumber(t.escalatedServiceRequests)}
          unit="requests"
          alert={t.escalatedServiceRequests > 0 ? 'critical' : undefined}
          context={`${formatNumber(t.escalatedLeaseReturns)} lease returns escalated`}
          {...sr({ status: 'escalated' })}
        />
        <StatTile
          label="Hardware unavailable"
          value={formatNumber(t.hardwareUnavailable)}
          alert={t.hardwareUnavailable > 0 ? 'caution' : undefined}
          context="On hardware hold"
          {...sr({ status: 'hardware_unavailable' })}
        />
        <StatTile
          label="Reschedule needed"
          value={formatNumber(t.rescheduleNeeded)}
          alert={t.rescheduleNeeded > 0 ? 'caution' : undefined}
          context="Waiting for a new appointment"
          {...sr({ status: 'reschedule_needed' })}
        />
        <StatTile
          label="Lease returns due in 30 days"
          value={formatNumber(t.leaseReturnsDueNext30Days)}
          alert={t.leaseReturnsOverdue > 0 ? 'critical' : undefined}
          context={`${formatNumber(t.leaseReturnsOverdue)} past their retirement date`}
          {...screenTarget('/lease-returns', { retirementTo: addDays(today, 30) })}
        />
      </KpiStrip>
      <KpiStrip>
        <StatTile
          label="Stock shortfall"
          value={formatNumber(t.stockShortfallArticles)}
          unit="article × hub"
          alert={t.stockShortfallArticles > 0 ? 'caution' : undefined}
          context="Demand above stock"
          {...screenTarget('/stock/matrix', {
            onlyShortfall: true,
            ...(scope.siteId ? { siteId: String(scope.siteId) } : {}),
          })}
        />
        <StatTile
          label="Open inventories"
          value={formatNumber(t.openInventories)}
          context="Stock-takes in progress"
          {...screenTarget('/stock/inventory', { status: 'open' })}
        />
        <StatTile
          label="Chain mails today"
          value={formatNumber(t.chainMailsSentToday)}
          context="Invitations, reminders, escalations"
          {...screenTarget('/communications')}
        />
        <StatTile
          label="Import → completion"
          value={
            t.avgDaysImportToCompletion30d === null
              ? '—'
              : t.avgDaysImportToCompletion30d.toFixed(1)
          }
          unit="days"
          context="Average, completed in the last 30 days"
        />
      </KpiStrip>
    </div>
  )
}

export function DashboardPage({
  search,
  onSearchChange,
}: {
  search: DashboardSearch
  onSearchChange: (patch: DashboardSearch) => void
}) {
  const enums = useEnums()
  const hubs = useHubs()
  const regions = useRegions()
  const navigate = useNavigate()
  const query = useQuery(
    stockQueries.dashboard({ siteId: search.siteId, regionId: search.regionId }),
  )
  const kpis = query.data
  const scope = { siteId: search.siteId, regionId: search.regionId }

  const stageTone = (stage: string): Tone =>
    enums.pipelineStage.find((s) => s.value === stage)?.tone ?? 'intake'
  const stageLabel = (stage: string) =>
    enums.pipelineStage.find((s) => s.value === stage)?.label ?? stage

  const series = kpis?.series
  const hasActivity = kpis
    ? kpis.stageCounts.some((s) => s.count > 0) || kpis.tiles.openServiceRequests > 0
    : true

  return (
    <Page className="overflow-y-auto">
      <PageHeader
        title="Dashboard"
        meta={
          kpis
            ? `As of ${formatTime(kpis.asOf)} · refreshes every minute`
            : 'Rollout, stock and data freshness'
        }
      />
      <Toolbar>
        <Select
          label="Hub"
          prefix="Hub"
          value={search.siteId ? String(search.siteId) : ALL}
          onValueChange={(value) =>
            onSearchChange({ siteId: value === ALL ? undefined : Number(value) })
          }
          options={[
            { value: ALL, label: 'All hubs' },
            ...hubs.map((h) => ({ value: String(h.id), label: h.name })),
          ]}
        />
        <Select
          label="Region"
          prefix="Region"
          value={search.regionId ? String(search.regionId) : ALL}
          onValueChange={(value) =>
            onSearchChange({ regionId: value === ALL ? undefined : Number(value) })
          }
          options={[
            { value: ALL, label: 'All regions' },
            ...regions.map((r) => ({ value: String(r.id), label: r.name })),
          ]}
        />
        {query.isFetching && <span className="text-xs text-fg-3">Updating…</span>}
      </Toolbar>

      {query.isError && !kpis ? (
        <div className="p-4">
          <Banner tone="critical" icon={Gauge} title="The dashboard could not be loaded.">
            {query.error instanceof Error ? query.error.message : null}
          </Banner>
        </div>
      ) : !kpis ? (
        <SkeletonRows rows={10} />
      ) : !hasActivity ? (
        <EmptyState icon={Gauge} title="No activity yet.">
          Data appears here after the first import.
        </EmptyState>
      ) : (
        <div className={cn('grid gap-4 pb-6', query.isPlaceholderData && 'opacity-60')}>
          <Tiles kpis={kpis} scope={scope} />
          <div className="grid grid-cols-2 gap-4 px-4 max-lg:grid-cols-1">
            <ChartCard
              title="Requests by stage"
              subtitle="Open requests, plus deployed and closed in the last 14 days"
            >
              <StageBar
                label="Service requests by pipeline stage"
                segments={kpis.stageCounts.map((s) => ({
                  key: s.stage,
                  label: stageLabel(s.stage),
                  count: s.count,
                  tone: stageTone(s.stage),
                }))}
              />
            </ChartCard>
            {series && (
              <ChartCard
                title="Completions per day"
                subtitle="Last 14 days"
                table={series.completionsPerDay.map((p) => ({
                  label: formatDate(p.date),
                  value: p.count,
                }))}
              >
                <ColumnChart
                  label="Completions per day, last 14 days"
                  points={series.completionsPerDay}
                  nowIndex={series.completionsPerDay.length - 1}
                />
              </ChartCard>
            )}
            {series && (
              <ChartCard
                title="Appointments per day"
                subtitle="Today and the next 13 days"
                table={series.appointmentsPerDay.map((p) => ({
                  label: formatDate(p.date),
                  value: p.count,
                }))}
              >
                <ColumnChart
                  label="Appointments per day, next 14 days"
                  points={series.appointmentsPerDay}
                  nowIndex={0}
                />
              </ChartCard>
            )}
            {series && (
              <ChartCard
                title="Requests imported per day"
                subtitle="First imports, last 14 days"
                table={series.importedPerDay.map((p) => ({
                  label: formatDate(p.date),
                  value: p.count,
                }))}
              >
                <LineChart
                  label="Service requests imported per day, last 14 days"
                  points={series.importedPerDay}
                />
              </ChartCard>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 px-4 max-lg:grid-cols-1">
            <TableSection title="Region load">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className={th}>Region</th>
                    <th className={cn(th, 'text-right')}>Open</th>
                    <th className={cn(th, 'text-right')}>Booked</th>
                    <th className={cn(th, 'text-right')}>Completed this week</th>
                    <th className={cn(th, 'text-right')}>Escalated</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.regionLoad.map((row) => (
                    <tr
                      key={row.region.id}
                      className="border-b border-line-subtle last:border-0 hover:bg-hover"
                    >
                      <td className={td}>
                        <ScreenLink to="/service-requests" search={{ regionId: row.region.id }}>
                          {row.region.name}
                        </ScreenLink>
                      </td>
                      <td className={cn(td, num)}>{row.open}</td>
                      <td className={cn(td, num)}>{row.booked}</td>
                      <td className={cn(td, num)}>{row.completedThisWeek}</td>
                      <td className={cn(td, num, row.escalated > 0 && 'text-tone-critical-fg')}>
                        {row.escalated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>
            <TableSection title="Stock alerts">
              {kpis.stockAlerts.length === 0 ? (
                <EmptyState icon={Gauge} title="No shortfalls.">
                  Every hub covers its open demand.
                </EmptyState>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-subtle">
                      <th className={th}>Article</th>
                      <th className={th}>Hub</th>
                      <th className={cn(th, 'text-right')}>Stock</th>
                      <th className={cn(th, 'text-right')}>Demand</th>
                      <th className={cn(th, 'text-right')}>Buffer</th>
                      <th className={cn(th, 'text-right')}>Order qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.stockAlerts.map((row) => (
                      <tr
                        key={`${row.article.id}-${row.site.id}`}
                        tabIndex={0}
                        onClick={() =>
                          void navigate({
                            to: '/stock/matrix',
                            search: { siteId: [row.site.id], q: row.article.number },
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter')
                            void navigate({
                              to: '/stock/matrix',
                              search: { siteId: [row.site.id], q: row.article.number },
                            })
                        }}
                        className="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                      >
                        <td className={cn(td, 'max-w-56 truncate')} title={row.article.name}>
                          <span className="hg-mono mr-2 text-fg-3">{row.article.number}</span>
                          {row.article.internalDescription}
                        </td>
                        <td className={td}>{row.site.name.replace(' Hub', '')}</td>
                        <td className={cn(td, num)}>{row.stock}</td>
                        <td className={cn(td, num)}>{row.demand}</td>
                        <td className={cn(td, num)}>{row.buffer}</td>
                        <td className={cn(td, num, 'font-semibold text-tone-caution-fg')}>
                          +{row.orderQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableSection>
          </div>
          <footer
            className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-4 pt-3 text-xs text-fg-2"
            aria-label="Data freshness"
          >
            <Freshness label="Last import" at={kpis.tiles.lastImportAt} />
            <Freshness
              label="Last appointment sync"
              at={kpis.tiles.lastAppointmentSyncAt}
              staleAfter={STALE_MS}
            />
            <Freshness
              label="Last stock calculation"
              at={kpis.tiles.lastStockCalculationAt}
              staleAfter={STALE_MS}
            />
          </footer>
        </div>
      )}
    </Page>
  )
}
