import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Crown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar } from '@/components/data-table/filter-bar'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageHeader } from '@/components/ui/page'
import type { VipEntry } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useCan } from '@/lib/auth/store'
import { formatDate, formatNumber } from '@/lib/format'
import { stringParam } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { useDeleteVip, vipQueries } from '@/modules/imports/api'
import { VipDialog } from '@/modules/imports/components/vip-dialog'

/** Admin › VIP list (SCREENS.md §9.4). Owner: H2 (Import & Master data). */
const searchSchema = z.object({ q: stringParam() })

export const Route = createFileRoute('/_app/admin/vip-list')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('master.read'),
  staticData: { title: 'VIP list' },
  component: VipListPage,
})

function VipListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const canManage = useCan('master.manage')
  const query = useQuery(vipQueries.list(search.q))
  const remove = useDeleteVip()
  const [editing, setEditing] = useState<VipEntry | null | 'new'>(null)
  const [removing, setRemoving] = useState<VipEntry | null>(null)
  const rows = query.data?.data ?? []
  useShortcut('n', () => setEditing('new'), {
    enabled: canManage && editing === null,
    description: 'Add VIP',
    group: 'Page',
  })

  const columns: DataColumn<VipEntry>[] = [
    {
      id: 'userId',
      header: 'User id',
      width: 110,
      locked: true,
      cell: (row) => <span className="font-mono">{row.userId}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      width: 200,
      cell: (row) => (
        <span className="truncate">{[row.firstName, row.lastName].filter(Boolean).join(' ')}</span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      width: 120,
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          <Crown size={12} className="text-fg-3" aria-hidden /> {row.vipType}
        </span>
      ),
    },
    {
      id: 'title',
      header: 'Title',
      width: 220,
      title: (row) => row.title,
      cell: (row) => <span className="truncate text-fg-2">{row.title ?? ''}</span>,
    },
    {
      id: 'contact',
      header: 'Contact',
      width: 200,
      cell: (row) =>
        row.contact ? (
          <button
            type="button"
            className="truncate text-accent-text hover:underline"
            onClick={(event) => {
              event.stopPropagation()
              void navigate({
                to: '/service-requests',
                search: {
                  contactId: row.contact!.id,
                  includeClosed: true,
                  vip: 'include',
                } as never,
              })
            }}
          >
            {row.contact.displayName}
          </button>
        ) : (
          <span className="text-fg-3">Not imported yet</span>
        ),
    },
    {
      id: 'openSrs',
      header: 'Open SRs',
      width: 90,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.openServiceRequests)}</span>,
    },
    {
      id: 'openLeases',
      header: 'Open lease returns',
      width: 140,
      align: 'end',
      cell: (row) => <span className="font-mono">{formatNumber(row.openLeaseReturns)}</span>,
    },
    {
      id: 'createdAt',
      header: 'Added',
      width: 110,
      cell: (row) => formatDate(row.createdAt),
    },
    {
      id: 'actions',
      header: '',
      width: 76,
      align: 'end',
      cell: (row) =>
        canManage ? (
          <span className="inline-flex">
            <IconButton
              icon={Pencil}
              size="sm"
              label={`Edit ${row.userId}`}
              onClick={(event) => {
                event.stopPropagation()
                setEditing(row)
              }}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              label={`Remove ${row.userId}`}
              onClick={(event) => {
                event.stopPropagation()
                setRemoving(row)
              }}
            />
          </span>
        ) : null,
    },
  ]

  const addButton = canManage ? (
    <Button variant="primary" icon={Plus} shortcut="n" onClick={() => setEditing('new')}>
      Add VIP
    </Button>
  ) : null

  return (
    <Page>
      <PageHeader
        title="VIP list"
        meta={`${formatNumber(rows.length)} VIPs · no automatic mails, hidden from default lists`}
        actions={addButton}
      />
      <FilterBar
        search={search}
        onSearchChange={(patch) =>
          void navigate({ search: (prev) => ({ ...prev, q: patch.q as string | undefined }) })
        }
        filters={[]}
        searchPlaceholder="Filter by user id, name, type, title…"
        resultCount={rows.length}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          label="VIP list"
          columns={columns}
          rows={rows}
          getRowId={(row) => String(row.id)}
          total={rows.length}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          onOpen={canManage ? (row) => setEditing(row) : undefined}
          empty={
            <EmptyState icon={Crown} title="The VIP list is empty." actions={addButton}>
              Add board members and their assistants to handle their requests personally.
            </EmptyState>
          }
        />
      </div>
      <VipDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        entry={editing === 'new' ? null : editing}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.userId ?? ''} from the VIP list?`}
        description="Requests of this user will appear in default lists again. Their status does not change."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id)
          setRemoving(null)
        }}
      />
    </Page>
  )
}
