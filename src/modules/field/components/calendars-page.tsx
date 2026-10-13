import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Pencil, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { notifyActionError } from '@/components/drawer/workflow-actions'
import { Button, IconButton } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { Page, PageHeader } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import type { BookingCalendar } from '@/lib/api/types'
import { useRegions } from '@/lib/api/core'
import { useCan } from '@/lib/auth/store'
import { formatRelative } from '@/lib/format'
import { fieldQueries, usePatchCalendar, useSyncAppointments } from '@/modules/field/api'

/** Admin › Calendars (SCREENS.md §9.3): booking calendars synced from the provider. */
export function CalendarsPage() {
  const canEdit = useCan('master.manage')
  const canSync = useCan('appointments.manage')
  const query = useQuery(fieldQueries.calendars())
  const regions = useRegions()
  const patch = usePatchCalendar()
  const sync = useSyncAppointments()
  const [renaming, setRenaming] = useState<BookingCalendar | null>(null)
  const rows = query.data?.data ?? []

  const update = (calendar: BookingCalendar, body: Parameters<typeof patch.mutate>[0]['patch']) =>
    patch.mutate(
      { id: calendar.id, patch: body },
      {
        onSuccess: (updated) => notify.success(`${updated.name} updated`),
        onError: (error) => notifyActionError(error),
      },
    )

  const columns: DataColumn<BookingCalendar>[] = [
    {
      id: 'name',
      header: 'Name',
      locked: true,
      width: 220,
      cell: (row) => (
        <span className="flex items-center gap-1">
          <span className="truncate font-medium">{row.name}</span>
          {canEdit && (
            <IconButton
              icon={Pencil}
              size="sm"
              label={`Rename ${row.name}`}
              onClick={() => setRenaming(row)}
            />
          )}
        </span>
      ),
    },
    {
      id: 'externalId',
      header: 'External id',
      width: 150,
      cell: (row) => <span className="hg-mono">{row.externalId}</span>,
    },
    {
      id: 'region',
      header: 'Region',
      width: 170,
      cell: (row) =>
        canEdit ? (
          <Select<string>
            label={`Region of ${row.name}`}
            value={row.region ? String(row.region.id) : 'none'}
            onValueChange={(value) =>
              update(row, { regionId: value === 'none' ? null : Number(value) })
            }
            options={[
              { value: 'none', label: 'No region' },
              ...regions.map((r) => ({ value: String(r.id), label: r.name })),
            ]}
          />
        ) : (
          (row.region?.name ?? '—')
        ),
    },
    {
      id: 'services',
      header: 'Services',
      width: 160,
      cell: (row) => <span className="hg-mono text-xs">{row.serviceIds.join(', ') || '—'}</span>,
    },
    {
      id: 'enabled',
      header: 'Enabled',
      width: 110,
      cell: (row) =>
        canEdit ? (
          <Switch
            variant="neutral"
            checked={row.isEnabled}
            onCheckedChange={(isEnabled) => update(row, { isEnabled })}
            aria-label={`${row.name} enabled`}
          />
        ) : row.isEnabled ? (
          'Enabled'
        ) : (
          'Disabled'
        ),
    },
    {
      id: 'upcoming',
      header: 'Upcoming appointments',
      align: 'end',
      width: 180,
      cell: (row) => <span className="hg-mono">{row.upcomingAppointments}</span>,
    },
    {
      id: 'synced',
      header: 'Last synced',
      width: 140,
      cell: (row) => (row.syncedAt ? formatRelative(row.syncedAt) : 'Never'),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Calendars"
        meta={`${rows.length} booking calendars · ${rows.filter((r) => r.isEnabled).length} enabled`}
        actions={
          canSync && (
            <Button icon={RefreshCw} loading={sync.isPending} onClick={() => sync.mutate()}>
              Sync appointments
            </Button>
          )
        }
      />
      <DataTable
        label="Booking calendars"
        columns={columns}
        rows={rows}
        getRowId={(row) => String(row.id)}
        total={rows.length}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={
          <EmptyState icon={CalendarDays} title="No calendars yet">
            Run an appointment sync to load them.
          </EmptyState>
        }
      />
      {renaming && (
        <RenameDialog
          calendar={renaming}
          onClose={() => setRenaming(null)}
          onSave={(name) => {
            update(renaming, { name })
            setRenaming(null)
          }}
        />
      )}
    </Page>
  )
}

function RenameDialog({
  calendar,
  onClose,
  onSave,
}: {
  calendar: BookingCalendar
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(calendar.name)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Rename ${calendar.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          {({ id }) => (
            <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  )
}
