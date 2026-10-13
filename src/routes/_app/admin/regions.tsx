import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Map as MapIcon, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { useMediaQuery } from '@/lib/use-media-query'
import { DrawerFrame } from '@/components/drawer/drawer-frame'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, FlagBadge } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { coreQueries } from '@/lib/api/core'
import { srKeys, leaseKeys } from '@/lib/api/keys'
import type { Region } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatNumber } from '@/lib/format'
import { trackJob } from '@/lib/jobs'
import { idParam } from '@/lib/search/params'
import { z } from 'zod'
import { reapplyRegionRules, regionKeys } from '@/modules/imports/api'
import { RegionEditor } from '@/modules/imports/components/region-editor'
import { RuleTester } from '@/modules/imports/components/rule-tester'

/** Admin › Regions (SCREENS.md §9.2). Owner: H2 (Import & Master data). */
const searchSchema = z.object({ region: idParam() })

export const Route = createFileRoute('/_app/admin/regions')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'Regions' },
  component: RegionsPage,
})

function RegionsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const enums = useEnums()
  const canManage = useCan('master.manage')
  const wide = useMediaQuery('(min-width: 1280px)')
  const [confirm, setConfirm] = useState(false)
  const [reapplying, setReapplying] = useState(false)
  const query = useQuery(coreQueries.regions({ active: 'all' }))
  const rows = query.data?.data ?? []
  const open = (id: number | undefined) => void navigate({ search: { region: id } })

  const reapply = async () => {
    setReapplying(true)
    try {
      const accepted = await reapplyRegionRules()
      setConfirm(false)
      void trackJob(queryClient, accepted, {
        title: 'Reapply region rules',
        invalidate: [regionKeys.all, srKeys.all, leaseKeys.all],
        describe: (job) =>
          job.result?.kind === 'regions_reapply'
            ? `${formatNumber(job.result.serviceRequestsChanged)} requests and ${formatNumber(job.result.leaseReturnsChanged)} lease returns changed · ${formatNumber(job.result.unresolved)} unresolved`
            : undefined,
      })
    } finally {
      setReapplying(false)
    }
  }

  const columns: DataColumn<Region>[] = [
    {
      id: 'name',
      header: 'Name',
      width: 140,
      locked: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: 'code',
      header: 'Code',
      width: 110,
      cell: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    { id: 'hub', header: 'Supplying hub', width: 140, cell: (row) => row.supplyingSite.name },
    {
      id: 'delivery',
      header: 'Default delivery',
      width: 180,
      cell: (row) => enumLabel(enums, 'deliveryType', row.defaultDeliveryType),
    },
    {
      id: 'booking',
      header: 'Booking ids',
      width: 220,
      title: (row) => [row.bookingDestinationId, row.bookingServiceId].filter(Boolean).join(' / '),
      cell: (row) => (
        <span className="truncate font-mono text-xs text-fg-2">
          {row.bookingDestinationId ?? '—'} / {row.bookingServiceId ?? '—'}
        </span>
      ),
    },
    {
      id: 'pickup',
      header: 'Pickup point',
      width: 180,
      cell: (row) => <span className="truncate">{row.pickupPoint?.name ?? ''}</span>,
    },
    {
      id: 'rules',
      header: 'Rules',
      width: 70,
      align: 'end',
      cell: (row) => <span className="font-mono">{row.ruleCount}</span>,
    },
    {
      id: 'open',
      header: 'Open SRs',
      width: 90,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.openServiceRequests)}</span>,
    },
    {
      id: 'active',
      header: 'Active',
      width: 80,
      cell: (row) => (row.isActive ? 'Yes' : <FlagBadge>Inactive</FlagBadge>),
    },
  ]
  const selected = rows.find((r) => r.id === search.region)

  return (
    <Page>
      <PageHeader
        title="Regions"
        meta={`${formatNumber(rows.length)} delivery regions · rules decide region, hub and delivery`}
        actions={
          canManage ? (
            <Button icon={RefreshCw} onClick={() => setConfirm(true)}>
              Reapply rules
            </Button>
          ) : null
        }
      />
      <div className="relative flex min-h-0 flex-1 border-t border-line">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable
            label="Regions"
            columns={columns}
            rows={rows}
            getRowId={(row) => String(row.id)}
            total={rows.length}
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            activeId={search.region ? String(search.region) : null}
            onOpen={(row) => open(row.id)}
            empty={<EmptyState icon={MapIcon} title="No regions." />}
          />
        </div>
        {search.region !== undefined ? (
          <DrawerFrame
            label={`Region ${selected?.name ?? ''}`}
            onClose={() => open(undefined)}
            head={
              <div className="grid gap-0.5">
                <h2 className="text-lg font-semibold">{selected?.name ?? 'Region'}</h2>
                <p className="font-mono text-xs text-fg-3">{selected?.code}</p>
              </div>
            }
          >
            <RegionEditor id={search.region} />
          </DrawerFrame>
        ) : (
          wide && <RuleTester className="w-[340px] shrink-0" onOpenRegion={(id) => open(id)} />
        )}
      </div>
      {!wide && search.region === undefined && (
        <RuleTester className="border-t border-l-0" onOpenRegion={(id) => open(id)} />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Re-resolve regions for open requests that are not yet in staging?"
        description="Requests before the appointment stage (without a manual region override) and the campus flag of open lease returns are recalculated with the current rules."
        confirmLabel="Reapply rules"
        pending={reapplying}
        onConfirm={reapply}
      />
    </Page>
  )
}
