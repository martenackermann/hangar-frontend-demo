import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MoreHorizontal, Package, PackageCheck, PanelRightOpen, Truck, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { CopyableId, IdInk } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { DrawerError } from '@/components/drawer/drawer-states'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { ScanStation } from '@/components/scan/scan-station'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, ProgressMeter, SkeletonRows, ToneBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Page, PageHeader, SectionHeading } from '@/components/ui/page'
import { useHubs } from '@/lib/api/core'
import { srKeys } from '@/lib/api/keys'
import type { ParcelPickingItem, ShipmentCreated } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { addDays, businessToday } from '@/lib/format'
import { idParam, listParam, stringParam } from '@/lib/search/params'
import { cn } from '@/lib/utils'
import { scanParcel, stagingQueries, useUnpack } from '@/modules/staging/api'
import { Appointment } from '@/modules/staging/components/appointment'
import { HubSelect } from '@/modules/staging/components/hub-select'
import {
  ShipmentForm,
  ShipmentResult,
  ShipToCard,
} from '@/modules/staging/components/shipment-form'
import { ShipmentsTable } from '@/modules/staging/components/shipments-table'
import { useHubId } from '@/modules/staging/hooks/use-hub'

/**
 * Parcel shipping (SCREENS.md §5.5): ready list (left) → packing station for the selected
 * request (scan, options, **Create shipment** via the carrier, label + tracking) → "Shipped"
 * table of the last 7 days. The selected request lives in `?selected=`.
 */
const PARCEL = ['parcel_to_user', 'parcel_to_pickup_point'] as const

const searchSchema = z.object({
  siteId: idParam(),
  deliveryType: listParam(PARCEL),
  q: stringParam(),
  selected: idParam(),
})
type Search = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/warehouse/parcel-shipping')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('sr.read'),
  staticData: { title: 'Parcel shipping' },
  component: ParcelShippingPage,
})

function ParcelShippingPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const enums = useEnums()
  const hubs = useHubs()
  const siteId = useHubId(search.siteId)
  const site = hubs.find((hub) => hub.id === siteId)
  const drawer = useDrawerNavigation()
  const [created, setCreated] = useState<Record<number, ShipmentCreated>>({})
  const patch = (values: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...values }) })

  const list = useQuery({
    ...stagingQueries.parcelPicking({
      siteId,
      deliveryType: search.deliveryType,
      q: search.q,
    }),
    enabled: siteId !== undefined,
  })
  const from = addDays(businessToday(), -7)
  const shipped = useQuery({
    ...stagingQueries.shipments({ siteId, from, perPage: 50 }),
    enabled: siteId !== undefined,
  })
  const rows = list.data?.data ?? []
  const selected = rows.find((row) => row.id === search.selected)
  const result = search.selected ? created[search.selected] : undefined

  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'deliveryType',
      label: 'Delivery',
      options: PARCEL.map((value) => ({
        value,
        label: enumLabel(enums, 'deliveryType', value),
      })),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Parcel shipping"
        meta={site ? `${site.name} · ${rows.length} ready for packing` : undefined}
        actions={<HubSelect value={siteId} onChange={(next) => patch({ siteId: next })} />}
      />
      <FilterBar
        search={search}
        onSearchChange={(values) => patch(values)}
        filters={filters}
        searchPlaceholder="SR, name, email…"
        resultCount={rows.length}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] max-lg:grid-cols-1">
        <section
          aria-label="Ready for packing"
          className="min-h-0 overflow-y-auto border-r border-line max-lg:border-r-0 max-lg:border-b"
        >
          {list.isPending ? (
            <SkeletonRows rows={6} widths={[90, 140, 60]} />
          ) : list.isError ? (
            <DrawerError error={list.error} onRetry={() => void list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Package} title="No parcel orders ready for packing.">
              Orders appear here once they are closed.
            </EmptyState>
          ) : (
            <ReadyList
              rows={rows}
              selected={search.selected}
              onSelect={(id) => patch({ selected: id })}
            />
          )}
        </section>
        <div className="min-h-0 overflow-y-auto">
          <section aria-label="Packing station" className="border-b border-line">
            {result ? (
              <div className="grid gap-3 p-4">
                <div className="flex items-center gap-2">
                  <CopyableId value={result.serviceRequest.number} />
                  <ToneBadge tone="transit" icon={Truck}>
                    Shipped
                  </ToneBadge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => patch({ selected: undefined })}
                  >
                    Next order
                  </Button>
                </div>
                <ShipmentResult created={result} />
              </div>
            ) : selected ? (
              <PackingStation
                key={selected.id}
                row={selected}
                onOpenDetails={() => drawer.open('sr', selected.id, 'shipping')}
                onCreated={(value) => setCreated((prev) => ({ ...prev, [selected.id]: value }))}
                onClosed={() => patch({ selected: undefined })}
              />
            ) : (
              <EmptyState icon={PackageCheck} title="Select an order to pack.">
                Scan each device into the parcel, then create the shipment.
              </EmptyState>
            )}
          </section>
          <section aria-label="Shipped" className="grid gap-2 py-3">
            <h2 className="px-4 text-sm font-semibold">Shipped · last 7 days</h2>
            {shipped.isPending ? (
              <SkeletonRows rows={4} />
            ) : (
              <ShipmentsTable
                shipments={shipped.data?.data ?? []}
                onOpen={(id) => drawer.open('sr', id, 'shipping')}
                empty={<p className="px-4 text-sm text-fg-3">No shipments in the last 7 days.</p>}
              />
            )}
          </section>
        </div>
      </div>
    </Page>
  )
}

function ReadyList({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly ParcelPickingItem[]
  selected: number | undefined
  onSelect: (id: number) => void
}) {
  const enums = useEnums()
  return (
    <ul aria-label="Parcel orders">
      {rows.map((row) => {
        const newItems = row.items.filter((item) => item.direction === 'deliver')
        const packed = newItems.filter((item) => item.packedAt !== null).length
        return (
          <li key={row.id} className="border-b border-line-subtle">
            <button
              type="button"
              aria-current={row.id === selected ? 'true' : undefined}
              onClick={() => onSelect(row.id)}
              className={cn(
                'grid w-full gap-1 px-3 py-2 text-left hover:bg-hover',
                row.id === selected && 'bg-accent-wash',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="hg-mono text-sm font-semibold">{row.number}</span>
                <Appointment startAt={row.appointmentStartAt} className="text-xs" />
                <span className="ml-auto text-xs text-fg-2">
                  {packed}/{newItems.length} packed
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-fg-2">
                <span className="truncate">{row.contact.displayName}</span>
                {row.region && <span className="text-fg-3">· {row.region.name}</span>}
                <span className="ml-auto text-fg-3">
                  {row.shipTo.kind === 'pickup_point'
                    ? 'Pickup point'
                    : enumLabel(enums, 'deliveryType', row.deliveryType)}
                </span>
              </span>
              <ProgressMeter
                segments={[{ value: packed, tone: packed === newItems.length ? 'done' : 'accent' }]}
                max={Math.max(newItems.length, 1)}
                label="Packed"
                valueText={`${packed} of ${newItems.length} packed`}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PackingStation({
  row,
  onOpenDetails,
  onCreated,
  onClosed,
}: {
  row: ParcelPickingItem
  onOpenDetails: () => void
  onCreated: (created: ShipmentCreated) => void
  onClosed: () => void
}) {
  const enums = useEnums()
  const queryClient = useQueryClient()
  const canShip = useCan('fulfilment.ship')
  const unpack = useUnpack(row.id)
  const action = useWorkflowAction('serviceRequest', row, row.number)
  const [closing, setClosing] = useState(false)
  const newItems = row.items.filter((item) => item.direction === 'deliver')
  const shipReady = row.allPacked && row.availableActions.includes('ship')
  const refresh = () => void queryClient.invalidateQueries({ queryKey: srKeys.all })

  return (
    <div className="grid gap-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CopyableId value={row.number} />
        <span className="text-sm text-fg-2">{row.contact.displayName}</span>
        <Appointment startAt={row.appointmentStartAt} absolute className="text-sm" />
        <span className="ml-auto flex items-center gap-1">
          <IconButton
            icon={PanelRightOpen}
            label="Open details"
            size="sm"
            onClick={onOpenDetails}
          />
          {canShip && row.availableActions.includes('close_without_label') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={MoreHorizontal} label="More actions" size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setClosing(true)}>
                  Close without label
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </header>
      <ShipToCard shipTo={row.shipTo} />
      <div>
        <SectionHeading>Items to pack</SectionHeading>
        <ul className="grid gap-1.5" aria-label="Items to pack">
          {newItems.map((item) => (
            <li key={item.slot} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full',
                  item.packedAt ? 'hg-tone-done bg-(--t-wash) text-(--t)' : 'bg-pressed',
                )}
                aria-label={item.packedAt ? 'Packed' : 'Not packed'}
              >
                {item.packedAt && <Icon icon={PackageCheck} size={12} />}
              </span>
              <IdInk value={item.asset?.assetTag ?? item.asset?.serialNumber} />
              <span className="truncate text-fg-2">
                {item.asset?.article?.name ?? item.requestedType}
              </span>
              <span className="text-xs text-fg-3">{enumLabel(enums, 'itemSlot', item.slot)}</span>
              {item.packedAt && canShip && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Undo2}
                  className="ml-auto"
                  loading={unpack.isPending && unpack.variables === item.slot}
                  onClick={() => unpack.mutate(item.slot)}
                >
                  Unpack
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {canShip && (
        <div className="rounded-sm border border-line bg-surface" data-testid="pack-scan">
          <ScanStation
            compact
            label="Scan device into the parcel"
            submit={(serial) => scanParcel(row.id, serial)}
            onResult={(result) => result.applied && refresh()}
            onUndone={refresh}
          />
        </div>
      )}
      {canShip ? (
        <div>
          <SectionHeading>Shipment</SectionHeading>
          <ShipmentForm
            srId={row.id}
            hasOldItems={row.hasOldItems}
            ready={shipReady}
            blockedReason={
              row.allPacked ? 'Create shipment is not available.' : 'Pack every new device first.'
            }
            onCreated={onCreated}
          />
        </div>
      ) : (
        <p className="text-sm text-fg-3">Packing and shipping need the fulfilment permission.</p>
      )}
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title={`Close without label · ${row.number}?`}
        description="The devices are handed over without a carrier label (e.g. courier run). They count as provided."
        confirmLabel="Close without label"
        comment={{ required: true, label: 'Why is no label needed?' }}
        pending={action.isPending}
        onConfirm={(comment) =>
          action.mutate(
            { action: 'close_without_label', body: { comment } },
            {
              onSuccess: () => {
                setClosing(false)
                onClosed()
              },
            },
          )
        }
      />
    </div>
  )
}
