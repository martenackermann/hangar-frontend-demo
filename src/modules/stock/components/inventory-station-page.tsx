import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleHelp,
  Copy,
  Download,
  ListChecks,
  Lock,
  MapPin,
  MapPinOff,
  ScanLine,
  XCircle,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { StatusBadge } from '@/components/domain/status'
import { sessionBarButton, SoundCueLegend } from '@/components/scan/scan-layout'
import type { ScanEntry } from '@/components/scan/scan-list'
import { ScanStation, type ScanSessionInfo } from '@/components/scan/scan-station'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Banner,
  EmptyState,
  FlagBadge,
  ProgressMeter,
  SkeletonRows,
  ToneBadge,
} from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field } from '@/components/ui/input'
import { Page, PageHeader, Toolbar } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notify } from '@/components/ui/toast'
import { downloadGet } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type {
  InventoryDetail,
  InventoryScan,
  ReconciliationItem,
  ScanResult,
} from '@/lib/api/types'
import { useCan, useMe } from '@/lib/auth/store'
import { useEnums } from '@/lib/enums'
import { businessToday, formatDate, formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { inventoryKeys, stockQueries, submitScan, useInventoryAction } from '../api'

export type ReconciliationCategory = 'missing' | 'wrong_location' | 'unknown' | 'matched'

export interface StationSearch {
  zone?: number | undefined
  category?: ReconciliationCategory | undefined
  page: number
}

const CATEGORIES: { value: ReconciliationCategory; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'matched', label: 'Matched' },
]

const RESULT_VERDICT = { matched: 'ok', wrong_location: 'warning', unknown: 'warning' } as const
const RESULT_CODE = {
  matched: 'matched',
  wrong_location: 'wrong_location',
  unknown: 'unknown_recorded',
} as const

/** Server scans → station entries, so the running list survives a reload (SCREENS §10). */
function toEntries(
  detail: InventoryDetail,
  meId: number | undefined,
  canManage: boolean,
): ScanEntry<InventoryScan>[] {
  return detail.recentScans.map((scan, index) => {
    const result: ScanResult<InventoryScan> = {
      verdict: RESULT_VERDICT[scan.result],
      code: RESULT_CODE[scan.result],
      message:
        scan.result === 'matched'
          ? `${scan.asset?.article?.name ?? scan.asset?.model ?? 'Device'} · ${scan.recordedLocation?.name ?? ''}`
          : scan.result === 'unknown'
            ? 'Unknown serial — recorded as unexpected.'
            : `Recorded at ${scan.recordedLocation?.name ?? '—'}${scan.scannedLocation ? `, scanned in ${scan.scannedLocation.name}` : ''}.`,
      scannedValue: scan.serialNumber,
      applied: true,
      entity: scan,
      undo:
        detail.status === 'open' && (scan.scannedBy.id === meId || canManage)
          ? { method: 'DELETE', href: `/inventories/${detail.id}/scans/${scan.id}`, body: null }
          : null,
      progress: null,
      canRegister: false,
      suggestedSlots: [],
    }
    return {
      id: `server-${scan.id}`,
      sequence: detail.recentScans.length - index,
      at: new Date(scan.scannedAt),
      value: scan.serialNumber,
      state: 'done',
      result,
    }
  })
}

function describeScan(result: ScanResult<InventoryScan>) {
  const scan = result.entity
  if (!scan) return null
  const asset = scan.asset
  return (
    <span className="truncate text-fg-2">
      {asset?.assetTag && <span className="hg-mono mr-2">{asset.assetTag}</span>}
      {asset?.article?.name ?? asset?.model ?? 'Not in the asset records'}
      {scan.scannedBy && (
        <span className="ml-2 text-xs text-fg-3">· {scan.scannedBy.displayName}</span>
      )}
    </span>
  )
}

function scanDetails(result: ScanResult<InventoryScan>) {
  const scan = result.entity
  if (!scan) return null
  if (
    result.code === 'wrong_zone' ||
    result.code === 'wrong_site' ||
    result.code === 'wrong_location'
  ) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <FlagBadge icon={MapPin}>Booked at {scan.recordedLocation?.name ?? '—'}</FlagBadge>
        <Icon icon={ArrowRight} size={14} className="text-fg-3" />
        <FlagBadge icon={MapPinOff}>Found at {scan.scannedLocation?.name ?? 'this site'}</FlagBadge>
        <span className="text-fg-3">
          Counted and flagged for the discrepancy report. Keep scanning.
        </span>
      </span>
    )
  }
  if (result.code === 'unknown_recorded')
    return (
      <span className="text-sm text-fg-3">
        Recorded as unexpected; it appears in the unknown report.
      </span>
    )
  return null
}

/**
 * KPI tile of the aside. Quiet by default (flow whispers); a caution/critical tally gets its tone
 * wash and ink only while it is above zero (exceptions shout).
 */
function Tally({
  icon,
  tone,
  label,
  value,
  emphasis = false,
}: {
  icon: typeof CircleCheck
  tone: 'done' | 'caution' | 'critical' | 'outreach'
  label: string
  value: number
  emphasis?: boolean
}) {
  const loud = emphasis && value > 0
  return (
    <div className={cn(`hg-tone-${tone} grid gap-0.5 px-4 py-3`, loud && 'bg-(--t-wash)')}>
      <span className="flex items-center gap-1.5 text-xs text-fg-2">
        <Icon icon={icon} size={14} className="text-(--t)" />
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold [font-variant-numeric:proportional-nums]',
          loud && 'text-(--t-fg)',
        )}
      >
        {formatNumber(value)}
      </span>
    </div>
  )
}

function StationAside({ detail, duplicates }: { detail: InventoryDetail; duplicates: number }) {
  const s = detail.summary
  const scanned = detail.progress.scanned
  return (
    <div className="grid">
      <div className="grid gap-2 border-b border-line p-4">
        <span className="text-xs text-fg-3">Counted against expected</span>
        <div className="flex items-baseline justify-between">
          <span>
            <span className="text-[44px] leading-none font-semibold">{formatNumber(scanned)}</span>
            <span className="text-fg-3"> / {formatNumber(detail.progress.expected)}</span>
          </span>
          <span className="font-mono text-lg">{detail.progress.percent}%</span>
        </div>
        <ProgressMeter
          size="station"
          label="Inventory progress"
          valueText={`${scanned} of ${detail.progress.expected} counted`}
          max={detail.progress.expected}
          segments={[
            { value: s.matched, tone: 'done', label: 'Matched' },
            {
              value: Math.max(0, scanned - s.matched),
              tone: 'caution',
              label: 'Counted in another zone',
            },
          ]}
        />
        <span className="text-xs text-fg-3">{formatNumber(s.missing)} not yet scanned</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
        <Tally icon={CircleCheck} tone="done" label="Matched" value={s.matched} />
        <Tally
          icon={MapPinOff}
          tone="caution"
          label="Wrong location"
          value={s.wrongLocation}
          emphasis
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
        <Tally icon={CircleHelp} tone="caution" label="Unknown serial" value={s.unknown} emphasis />
        <Tally icon={Copy} tone="caution" label="Duplicates" value={duplicates} />
      </div>
      <div className="grid gap-1 p-4">
        <h3 className="text-xs font-semibold text-fg-2">Latest scans, all counters</h3>
        <ul className="grid gap-1 text-sm">
          {detail.recentScans.slice(0, 6).map((scan) => (
            <li key={scan.id} className="flex items-center gap-2">
              <span className="font-mono text-xs text-fg-3">{formatTime(scan.scannedAt)}</span>
              <span className="hg-mono truncate">{scan.serialNumber}</span>
              <span className="ml-auto truncate text-xs text-fg-3">
                {scan.scannedBy.displayName}
              </span>
            </li>
          ))}
          {detail.recentScans.length === 0 && (
            <li className="text-fg-3">Nobody has scanned yet.</li>
          )}
        </ul>
      </div>
      <SoundCueLegend className="border-t border-line" />
    </div>
  )
}

function CloseDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: InventoryDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = useInventoryAction(detail.id)
  const [countDate, setCountDate] = useState<string | undefined>(businessToday())
  const [apply, setApply] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const s = detail.summary
  const submit = async () => {
    if (!countDate) {
      setError('Choose the count date.')
      return
    }
    try {
      const closed = await action.mutateAsync({
        action: 'close',
        body: { countDate, applyCorrections: apply },
      })
      onOpenChange(false)
      notify.success(`Inventory ${closed.site.name} closed`, {
        description: `${closed.summary.missing} missing · ${closed.summary.wrongLocation} wrong location${
          closed.summary.corrected !== null
            ? ` · ${closed.summary.corrected} records corrected`
            : ''
        }`,
      })
    } catch (err) {
      const fields = isApiError(err) ? Object.values(err.fieldErrors).flat().join(' ') : ''
      setError(fields ? fields : isApiError(err) ? (err.detail ?? err.title) : 'Not closed.')
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Close inventory ${detail.site.name}?`}
        description="The reconciliation is frozen, three CSV reports are stored and mailed to the team mailbox."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Keep counting
            </Button>
            <Button
              variant="primary"
              icon={Lock}
              loading={action.isPending}
              onClick={() => void submit()}
            >
              Close inventory
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <dl className="grid grid-cols-4 gap-2 rounded-sm bg-pressed p-3 text-sm">
            {[
              ['Expected', s.expected],
              ['Missing', s.missing],
              ['Wrong location', s.wrongLocation],
              ['Unknown', s.unknown],
            ].map(([label, value]) => (
              <div key={label} className="grid">
                <dt className="text-xs text-fg-3">{label}</dt>
                <dd className="font-mono text-lg font-semibold">{formatNumber(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <Field
            label="Count date"
            required
            help="The official stock-take date; not in the future."
          >
            {() => <DatePicker label="Count date" value={countDate} onChange={setCountDate} />}
          </Field>
          <div className="flex items-start gap-2 text-sm">
            <Checkbox
              id="apply-corrections"
              checked={apply}
              onCheckedChange={setApply}
              className="mt-0.5"
            />
            <label htmlFor="apply-corrections">
              <b className="font-medium">Apply corrections</b>
              <span className="block text-fg-3">
                Mark missing items as missing and move misplaced items to where they were scanned.
                Devices in a request workflow are only reported.
              </span>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-tone-critical-fg">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The scan station; seeded once with the server's recent scans (all counters). */
function StationScanner({
  detail,
  zoneId,
  meId,
  canManage,
  onResult,
  onUndone,
  aside,
  zoneSelect,
  session,
  finish,
  footer,
}: {
  detail: InventoryDetail
  zoneId: number | undefined
  meId: number | undefined
  canManage: boolean
  onResult: (result: ScanResult<InventoryScan>) => void
  onUndone: () => void
  aside: ReactNode
  zoneSelect: ReactNode
  session: ScanSessionInfo
  finish: ReactNode
  footer: ReactNode
}) {
  // own recent scans reload into the running list; everybody's appear in the aside
  const [initialEntries] = useState(() =>
    toEntries(
      { ...detail, recentScans: detail.recentScans.filter((scan) => scan.scannedBy.id === meId) },
      meId,
      canManage,
    ),
  )
  return (
    <ScanStation<InventoryScan>
      label="Scan serial or asset tag"
      placeholder="Waiting for scanner…"
      submit={(value) => submitScan(detail.id, { serial: value, stockLocationId: zoneId ?? null })}
      describe={describeScan}
      details={scanDetails}
      initialEntries={initialEntries}
      onResult={onResult}
      onUndone={onUndone}
      listTitle="Scans"
      emptyList="Scan the first serial to start counting."
      context={
        <>
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={MapPin} size={14} className="text-fg-3" />
            Counting at <b className="font-semibold text-fg">{detail.site.name}</b>
          </span>
          {zoneSelect}
        </>
      }
      aside={aside}
      session={session}
      dock={{ finish }}
      footer={footer}
      className="border-b border-line xl:h-full xl:min-h-[560px]"
    />
  )
}

const reconciliationColumns: DataColumn<ReconciliationItem>[] = [
  {
    id: 'serial',
    header: 'Serial',
    cell: (row) => <span className="hg-mono">{row.serialNumber}</span>,
    width: 150,
    locked: true,
  },
  {
    id: 'tag',
    header: 'Asset tag',
    cell: (row) => <span className="hg-mono">{row.asset?.assetTag}</span>,
    width: 110,
  },
  {
    id: 'article',
    header: 'Article',
    cell: (row) => row.asset?.article?.name ?? row.asset?.model,
    width: 200,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) =>
      row.asset ? <StatusBadge entity="assetStatus" state={row.asset.status} size="sm" /> : null,
    width: 150,
  },
  {
    id: 'recorded',
    header: 'Recorded location',
    cell: (row) => row.recordedLocation?.name,
    width: 170,
  },
  {
    id: 'scanned',
    header: 'Scanned location',
    cell: (row) => row.scannedLocation?.name,
    width: 170,
  },
  {
    id: 'by',
    header: 'Scanned by / at',
    cell: (row) =>
      row.scannedBy ? `${row.scannedBy.displayName} · ${formatDateTime(row.scannedAt)}` : null,
    width: 230,
  },
  {
    id: 'correctable',
    header: 'Correction',
    cell: (row) =>
      row.correctable ? <ToneBadge tone="outreach">Would be corrected</ToneBadge> : null,
    width: 160,
  },
]

export function InventoryStationPage({
  inventoryId,
  search,
  onSearchChange,
}: {
  inventoryId: number
  search: StationSearch
  onSearchChange: (patch: Partial<StationSearch>) => void
}) {
  const enums = useEnums()
  const me = useMe()
  const canScan = useCan('inventory.scan')
  const canManage = useCan('inventory.manage')
  const queryClient = useQueryClient()
  const query = useQuery(stockQueries.inventory(inventoryId, true))
  const detail = query.data
  const category = search.category ?? 'missing'
  const reconciliation = useQuery(stockQueries.reconciliation(inventoryId, category, search.page))
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [duplicates, setDuplicates] = useState(0)
  const cancel = useInventoryAction(inventoryId)

  if (!detail) {
    return (
      <Page>
        <PageHeader title="Inventory" />
        {query.isError ? (
          <EmptyState
            icon={ScanLine}
            title="This inventory could not be loaded."
            actions={<Button onClick={() => void query.refetch()}>Retry</Button>}
          />
        ) : (
          <SkeletonRows rows={10} />
        )}
      </Page>
    )
  }

  const open = detail.status === 'open'
  const s = detail.summary
  const counts: Record<ReconciliationCategory, number> = {
    missing: s.missing,
    wrong_location: s.wrongLocation,
    unknown: s.unknown,
    matched: s.matched,
  }
  const statusLabel = enums.inventoryStatus.find((v) => v.value === detail.status)?.label

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.detail(inventoryId) })
    void queryClient.invalidateQueries({
      queryKey: inventoryKeys.scope('reconciliation', inventoryId),
    })
  }

  const canClose = detail.availableActions.includes('close')
  const canCancel = detail.availableActions.includes('cancel')
  const percent = `${detail.progress.percent}%`

  const reconciliationSection = (
    <section
      className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-2 px-4 py-4 max-md:px-3"
      aria-label="Reconciliation"
    >
      <div className="flex flex-wrap items-center gap-x-2">
        <h2 className="text-sm font-semibold">Reconciliation</h2>
        <span className="text-xs text-fg-3">
          {open ? 'live — the expected set updates with every movement' : 'frozen at close'}
        </span>
      </div>
      <Tabs
        value={category}
        onValueChange={(value) =>
          onSearchChange({ category: value as ReconciliationCategory, page: 1 })
        }
      >
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger
              key={c.value}
              value={c.value}
              count={formatNumber(counts[c.value])}
              alert={c.value === 'missing' && counts.missing > 0 && !open}
            >
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div
        className={cn(
          'flex h-[520px] flex-col rounded-sm border border-line',
          reconciliation.isPlaceholderData && 'opacity-60',
        )}
      >
        <DataTable
          label={`Reconciliation · ${CATEGORIES.find((c) => c.value === category)?.label}`}
          keyboard={false}
          columns={reconciliationColumns}
          rows={reconciliation.data?.data ?? []}
          getRowId={(row) => `${row.category}-${row.serialNumber}`}
          total={reconciliation.data?.meta.total}
          loading={reconciliation.isPending}
          error={reconciliation.error}
          onRetry={() => void reconciliation.refetch()}
          pagination={{
            page: search.page,
            perPage: 50,
            total: reconciliation.data?.meta.total ?? 0,
            onPageChange: (page) => onSearchChange({ page }),
          }}
          empty={
            <EmptyState
              icon={CircleCheck}
              title={`Nothing in ${CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()}.`}
            >
              {category === 'matched'
                ? 'Scan the first serial to start counting.'
                : 'Every expected device is accounted for here.'}
            </EmptyState>
          }
        />
      </div>
    </section>
  )

  const dialogs = (
    <>
      {closing && <CloseDialog detail={detail} open onOpenChange={setClosing} />}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel inventory ${detail.site.name}?`}
        description="Scans are kept for audit; no corrections are applied and no reports are sent."
        confirmLabel="Cancel inventory"
        cancelLabel="Keep counting"
        destructive
        comment={{ label: 'Reason (optional)' }}
        pending={cancel.isPending}
        onConfirm={async (comment) => {
          try {
            await cancel.mutateAsync({ action: 'cancel', body: comment ? { comment } : {} })
            setCancelling(false)
            notify.success(`Inventory ${detail.site.name} cancelled`)
          } catch (error) {
            notify.error(isApiError(error) ? error.title : 'Not cancelled', {
              description: isApiError(error) ? error.detail : undefined,
            })
          }
        }}
      />
    </>
  )

  if (open && canScan) {
    // Scan mode (DESIGN.md §9.3): graphite session bar, station, reconciliation below, phone dock.
    return (
      <Page>
        <StationScanner
          detail={detail}
          zoneId={search.zone}
          meId={me?.id}
          canManage={canManage}
          onResult={(result) => {
            if (result.code === 'duplicate') setDuplicates((n) => n + 1)
            refresh()
          }}
          onUndone={refresh}
          aside={<StationAside detail={detail} duplicates={duplicates} />}
          zoneSelect={
            <Select
              label="Zone"
              prefix="Zone"
              value={search.zone ? String(search.zone) : 'any'}
              onValueChange={(value) =>
                onSearchChange({ zone: value === 'any' ? undefined : Number(value) })
              }
              options={[
                { value: 'any', label: 'Any zone' },
                ...detail.zones.map((z) => ({ value: String(z.id), label: z.name })),
              ]}
              className="pointer-coarse:h-11"
            />
          }
          session={{
            title: `Inventory · ${detail.site.name}`,
            meta: `#${detail.id} · started ${formatDateTime(detail.openedAt)} by ${detail.openedBy.displayName}`,
            progress: percent,
            actions: (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className={cn(sessionBarButton, 'border-transparent max-lg:hidden')}
                >
                  <Link to="/stock/inventory">All inventories</Link>
                </Button>
                {canCancel && (
                  <Button
                    icon={XCircle}
                    onClick={() => setCancelling(true)}
                    className={cn(sessionBarButton, 'max-md:size-11 max-md:px-0')}
                  >
                    <span className="max-md:sr-only">Cancel inventory</span>
                  </Button>
                )}
                {canClose && (
                  <Button
                    variant="primary"
                    icon={ListChecks}
                    onClick={() => setClosing(true)}
                    className="max-md:hidden"
                  >
                    Finish &amp; verify
                  </Button>
                )}
              </>
            ),
          }}
          finish={
            canClose ? (
              <Button
                size="touch"
                icon={ListChecks}
                onClick={() => setClosing(true)}
                className="w-full px-2"
              >
                Finish
              </Button>
            ) : null
          }
          footer={reconciliationSection}
        />
        {dialogs}
      </Page>
    )
  }

  return (
    <Page className="overflow-y-auto">
      <PageHeader
        title={`Inventory · ${detail.site.name}`}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge
              entity="inventoryStatus"
              state={detail.status}
              label={open ? 'Counting' : statusLabel}
            />
            <span>
              #{detail.id} · started {formatDateTime(detail.openedAt)} by{' '}
              {detail.openedBy.displayName}
            </span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" icon={ArrowLeft} className="max-md:hidden">
              <Link to="/stock/inventory">All inventories</Link>
            </Button>
            {canCancel && (
              <Button icon={XCircle} onClick={() => setCancelling(true)}>
                Cancel inventory
              </Button>
            )}
            {canClose && (
              <Button variant="primary" icon={ListChecks} onClick={() => setClosing(true)}>
                Finish &amp; verify
              </Button>
            )}
          </>
        }
      />
      <Toolbar
        end={
          <span className="text-sm text-fg-2">
            {formatNumber(detail.progress.scanned)} of {formatNumber(detail.progress.expected)}{' '}
            expected ({percent})
          </span>
        }
      >
        <span className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1">
            <Icon icon={CircleCheck} size={14} className="text-tone-done" />{' '}
            {formatNumber(s.matched)} matched
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon icon={MapPinOff} size={14} className="text-tone-caution" />{' '}
            {formatNumber(s.wrongLocation)} wrong location
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon icon={CircleHelp} size={14} className="text-tone-caution" />{' '}
            {formatNumber(s.unknown)} unknown
          </span>
        </span>
      </Toolbar>

      {!open && (
        <div className="px-4 pt-4">
          <Banner
            tone={detail.status === 'closed' ? 'done' : 'intake'}
            icon={Lock}
            title={
              detail.status === 'closed'
                ? `Closed ${detail.closedAt ? formatDateTime(detail.closedAt) : ''} by ${detail.closedBy?.displayName ?? '—'} · count date ${detail.countDate ? formatDate(detail.countDate) : '—'}`
                : `Cancelled ${detail.closedAt ? formatDateTime(detail.closedAt) : ''} by ${detail.closedBy?.displayName ?? '—'}`
            }
            actions={
              detail.status === 'closed' && (
                <>
                  {(['missing', 'wrong_location', 'unknown'] as const).map((kind) => (
                    <Button
                      key={kind}
                      size="sm"
                      icon={Download}
                      onClick={() => void downloadGet(`/inventories/${detail.id}/reports/${kind}`)}
                    >
                      {CATEGORIES.find((c) => c.value === kind)?.label}
                    </Button>
                  ))}
                </>
              )
            }
          >
            {detail.status === 'closed'
              ? detail.applyCorrections
                ? `Corrections applied: ${s.corrected ?? 0} asset records updated.`
                : 'Corrections were not applied; asset records are unchanged.'
              : (detail.note ?? 'Scans are kept for audit.')}
          </Banner>
        </div>
      )}

      {open && (
        <div className="px-4 pt-4">
          <Banner tone="outreach" icon={ScanLine} title="Counting in progress">
            Technicians and dispatchers scan at this station; you see the live reconciliation below.
          </Banner>
        </div>
      )}

      {reconciliationSection}
      {dialogs}
    </Page>
  )
}
