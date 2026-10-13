import { useQuery } from '@tanstack/react-query'
import { Link2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { IdInk } from '@/components/domain/status'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { KeyValue, KeyValues } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import { isApiError } from '@/lib/api/errors'
import type { Appointment } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { businessToday, formatDateTime, formatFullDateTime, formatRelative } from '@/lib/format'
import { fieldQueries, useLinkAppointment, useSyncAppointments } from '@/modules/field/api'

/** Unmatched appointments (SCREENS.md §6.1): link each one to its service request. */
export function UnmatchedPanel({ onClose }: { onClose: () => void }) {
  const query = useQuery(
    fieldQueries.appointments({ unmatched: true, from: businessToday(), perPage: 100 }),
  )
  return (
    <div className="grid gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-md font-semibold">Unmatched appointments</h2>
        <IconButton icon={X} label="Close panel" onClick={onClose} className="ml-auto" />
      </div>
      {query.isPending ? (
        <Skeleton className="h-32" />
      ) : query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Appointments could not be loaded"
          actions={<Button onClick={() => void query.refetch()}>Retry</Button>}
        />
      ) : query.data.data.length === 0 ? (
        <p className="text-sm text-fg-3">All appointments are matched to requests.</p>
      ) : (
        <ul className="grid gap-2">
          {query.data.data.map((appointment) => (
            <UnmatchedRow key={appointment.id} appointment={appointment} />
          ))}
        </ul>
      )}
    </div>
  )
}

function UnmatchedRow({ appointment }: { appointment: Appointment }) {
  const canLink = useCan('appointments.manage')
  const link = useLinkAppointment()
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    setError(null)
    link.mutate(
      { id: appointment.id, body: { serviceRequestNumber: number.trim() } },
      {
        onSuccess: (linked) =>
          notify.success(`Linked to ${linked.serviceRequest?.number ?? number.toUpperCase()}`),
        onError: (failure) =>
          setError(isApiError(failure) ? (failure.detail ?? failure.title) : 'Linking failed.'),
      },
    )
  }
  return (
    <li className="grid gap-1.5 rounded-sm border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="hg-mono">{formatDateTime(appointment.startAt)}</span>
        <span className="text-fg-2">{appointment.calendar.name}</span>
      </div>
      <div className="text-xs text-fg-3">
        Reference: {appointment.reference ? <IdInk value={appointment.reference} whole /> : 'none'}{' '}
        · {appointment.contactName ?? 'Unknown contact'}
      </div>
      {canLink && (
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid flex-1 gap-1">
            <Input
              aria-label={`Service request for the appointment at ${formatDateTime(appointment.startAt)}`}
              placeholder="SR0012345"
              value={number}
              onChange={(event) => setNumber(event.target.value.toUpperCase())}
              aria-invalid={Boolean(error)}
              className="hg-mono"
            />
            {error && <p className="text-xs text-tone-critical-fg">{error}</p>}
          </div>
          <Button type="submit" icon={Link2} loading={link.isPending} disabled={!number.trim()}>
            Link to SR
          </Button>
        </form>
      )}
    </li>
  )
}

/** Sync panel (SCREENS.md §6.1 `panel=sync`): last run, counts, Sync now. */
export function SyncPanel({ onClose }: { onClose: () => void }) {
  const canSync = useCan('appointments.manage')
  const state = useQuery({ ...fieldQueries.syncState(), refetchInterval: 15_000 })
  const sync = useSyncAppointments()
  const result = state.data?.lastResult
  return (
    <div className="grid gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-md font-semibold">Appointment sync</h2>
        <IconButton icon={X} label="Close panel" onClick={onClose} className="ml-auto" />
      </div>
      {state.isPending ? (
        <Skeleton className="h-24" />
      ) : state.data ? (
        <>
          <p className="text-sm text-fg-2">
            {state.data.running
              ? 'A sync is running…'
              : state.data.lastIncrementalSyncAt
                ? `Last sync ${formatRelative(state.data.lastIncrementalSyncAt)} (${formatFullDateTime(state.data.lastIncrementalSyncAt)})`
                : 'No sync has run yet.'}
          </p>
          {result && (
            <KeyValues columns={3}>
              <KeyValue label="Calendars">{result.calendars}</KeyValue>
              <KeyValue label="New">{result.created}</KeyValue>
              <KeyValue label="Changed">{result.updated}</KeyValue>
              <KeyValue label="Cancelled">{result.cancelled}</KeyValue>
              <KeyValue label="Matched">{result.matched}</KeyValue>
              <KeyValue label="Status changes">{result.transitions}</KeyValue>
            </KeyValues>
          )}
          <p className="text-xs text-fg-3">
            Next scheduled run {formatDateTime(state.data.nextScheduledAt)}.
          </p>
        </>
      ) : null}
      {canSync && (
        <Button
          variant="primary"
          icon={RefreshCw}
          loading={sync.isPending || state.data?.running}
          onClick={() =>
            sync.mutate(undefined, {
              onError: (error) =>
                notify.error(isApiError(error) ? error.title : 'The sync could not start', {
                  description: isApiError(error) ? error.detail : undefined,
                }),
            })
          }
        >
          Sync now
        </Button>
      )}
    </div>
  )
}
