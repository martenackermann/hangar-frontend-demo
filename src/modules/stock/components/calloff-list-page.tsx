import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FilePlus2, Send } from 'lucide-react'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import { useHubs } from '@/lib/api/core'
import type { CallOffOrderSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { useEnums } from '@/lib/enums'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { stockQueries } from '../api'
import { CreateCallOffDialog } from './create-calloff-dialog'

export interface CallOffListSearch {
  siteId?: number[] | undefined
  status?: string[] | undefined
  from?: string | undefined
  to?: string | undefined
  page: number
  perPage: number
  sort?: string | undefined
  new?: boolean | undefined
}

const columns: DataColumn<CallOffOrderSummary>[] = [
  {
    id: 'number',
    header: 'Number',
    cell: (row) => <IdInk value={row.number} />,
    width: 190,
    locked: true,
    pinned: true,
  },
  { id: 'hub', header: 'Hub', cell: (row) => row.site.name, width: 130 },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge entity="callOffOrderStatus" state={row.status} />,
    width: 200,
  },
  {
    id: 'deliveryDate',
    header: 'Delivery date',
    cell: (row) => formatDate(row.deliveryDate),
    sortField: 'deliveryDate',
    width: 130,
  },
  { id: 'lines', header: 'Lines', cell: (row) => row.lineCount, align: 'end', width: 80 },
  {
    id: 'total',
    header: 'Total qty',
    cell: (row) => <span className="font-mono">{formatNumber(row.totalQuantity)}</span>,
    align: 'end',
    width: 100,
  },
  { id: 'recipient', header: 'Recipient', cell: (row) => row.recipientEmail, width: 220 },
  {
    id: 'created',
    header: 'Created',
    cell: (row) => (
      <span className="text-fg-2">
        {formatDateTime(row.createdAt)} · {row.createdBy.displayName}
      </span>
    ),
    sortField: 'createdAt',
    width: 240,
  },
  {
    id: 'sent',
    header: 'Sent',
    cell: (row) =>
      row.sentAt ? (
        <span className="text-fg-2">
          {formatDateTime(row.sentAt)} · {row.sentBy?.displayName}
        </span>
      ) : null,
    width: 240,
  },
]

export function CallOffListPage({
  search,
  onSearchChange,
}: {
  search: CallOffListSearch
  onSearchChange: (patch: Record<string, unknown>) => void
}) {
  const enums = useEnums()
  const hubs = useHubs()
  const navigate = useNavigate()
  const canManage = useCan('calloff.manage')
  const [dialog, setDialog] = useState(Boolean(search.new))
  const query = useQuery(
    stockQueries.calloffList({
      siteId: search.siteId,
      status: search.status,
      from: search.from,
      to: search.to,
      page: search.page,
      perPage: search.perPage,
      sort: search.sort,
    }),
  )
  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'siteId',
      label: 'Hub',
      options: hubs.map((h) => ({ value: String(h.id), label: h.name })),
    },
    {
      kind: 'multi',
      key: 'status',
      label: 'Status',
      options: enums.callOffOrderStatus.map((s) => ({ value: s.value, label: s.label })),
    },
    { kind: 'dateRange', id: 'created', label: 'Created', fromKey: 'from', toKey: 'to' },
  ]
  return (
    <Page>
      <PageHeader
        title="Call-off orders"
        meta="Replenishment orders to Initech Logistics"
        actions={
          canManage && (
            <Button variant="primary" icon={FilePlus2} onClick={() => setDialog(true)}>
              New call-off order
            </Button>
          )
        }
      />
      <FilterBar
        search={search as unknown as Record<string, unknown>}
        onSearchChange={onSearchChange}
        filters={filters}
        resultCount={query.data?.meta.total}
      />
      <DataTable
        label="Call-off orders"
        columns={columns}
        rows={query.data?.data ?? []}
        getRowId={(row) => String(row.id)}
        total={query.data?.meta.total}
        loading={query.isPending}
        fetching={query.isPlaceholderData}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort ?? '-createdAt'}
        onSortChange={(sort) => onSearchChange({ sort, page: 1 })}
        onOpen={(row) =>
          void navigate({
            to: '/stock/call-off-orders/$orderId',
            params: { orderId: String(row.id) },
          })
        }
        pagination={{
          page: search.page,
          perPage: search.perPage,
          total: query.data?.meta.total ?? 0,
          onPageChange: (page) => onSearchChange({ page }),
          onPerPageChange: (perPage) => onSearchChange({ perPage, page: 1 }),
        }}
        empty={
          <EmptyState icon={Send} title="No call-off orders yet">
            Create one from the Stock matrix.
          </EmptyState>
        }
      />
      {dialog && (
        <CreateCallOffDialog
          open
          onOpenChange={(open) => {
            setDialog(open)
            if (!open && search.new) onSearchChange({ new: undefined })
          }}
        />
      )}
    </Page>
  )
}
