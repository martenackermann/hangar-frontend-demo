import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GripVertical, Save, TriangleAlert, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { StatusBadge, IdInk } from '@/components/domain/status'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { notifyActionError } from '@/components/drawer/workflow-actions'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import type { ID, TourCandidates, TourDetail } from '@/lib/api/types'
import { useUsers } from '@/lib/api/core'
import { useCan } from '@/lib/auth/store'
import { formatDate, formatTime } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import {
  fieldQueries,
  useCreateTour,
  usePatchTour,
  usePutStops,
  useTourAction,
} from '@/modules/field/api'
import { StopChip } from './field-bits'

const WARNING_TEXT: Record<string, string> = {
  technician_has_other_tour: 'The technician has another tour on this day.',
  stops_not_ready: 'Some stops are not ready yet (devices not picked).',
  appointment_outside_tour_date: 'A stop has an appointment on another day or route.',
}

/**
 * Tour editor (SCREENS.md §6.1): technician, candidates with readiness, the ordered stop list
 * (Alt+↑/↓ or the arrows to reorder), warnings, Save tour / Cancel tour. Finished stops of a
 * running tour are shown read-only.
 */
export function TourEditor({
  calendarId,
  date,
  onClose,
}: {
  calendarId: ID
  date: string
  onClose: () => void
}) {
  const candidates = useQuery(fieldQueries.candidates(calendarId, date))
  const tourId = candidates.data?.tour?.id
  const tour = useQuery({ ...fieldQueries.tour(tourId ?? 0), enabled: tourId !== undefined })
  if (candidates.isPending || (tourId !== undefined && tour.isPending))
    return (
      <div className="grid gap-2 p-4" aria-busy="true">
        <Skeleton className="h-6" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  if (candidates.isError)
    return (
      <EmptyState
        icon={TriangleAlert}
        title="The route could not be loaded"
        actions={<Button onClick={() => void candidates.refetch()}>Retry</Button>}
      />
    )
  return (
    <EditorForm
      key={`${calendarId}:${date}:${tourId ?? 'new'}:${tour.data?.version ?? 0}`}
      data={candidates.data}
      tour={tourId !== undefined ? tour.data : undefined}
      onClose={onClose}
    />
  )
}

function EditorForm({
  data,
  tour,
  onClose,
}: {
  data: TourCandidates
  tour: TourDetail | undefined
  onClose: () => void
}) {
  const canPlan = useCan('tours.plan')
  const drawer = useDrawerNavigation()
  const technicians = useUsers({ role: ['technician'] })
  const pendingStops = tour?.stops.filter((s) => s.outcome === 'pending') ?? []
  const doneStops = tour?.stops.filter((s) => s.outcome !== 'pending') ?? []
  const [order, setOrder] = useState<ID[]>(() =>
    tour ? pendingStops.map((s) => s.serviceRequest.id) : [],
  )
  const [technicianId, setTechnicianId] = useState<ID | null>(tour?.technician?.id ?? null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const create = useCreateTour()
  const patch = usePatchTour()
  const putStops = usePutStops()
  const action = useTourAction()
  const editable = canPlan && (!tour || ['draft', 'planned', 'in_progress'].includes(tour.status))
  const byId = new Map(data.candidates.map((c) => [c.serviceRequest.id, c]))
  const originalOrder = pendingStops.map((s) => s.serviceRequest.id)
  const dirty =
    !tour ||
    technicianId !== (tour.technician?.id ?? null) ||
    order.join(',') !== originalOrder.join(',')
  const saving = create.isPending || patch.isPending || putStops.isPending

  const toggle = (id: ID, checked: boolean) =>
    setOrder((prev) => {
      if (!checked) return prev.filter((x) => x !== id)
      const next = [...prev, id]
      // new stops slot in by appointment time
      const time = (sr: ID) => byId.get(sr)?.serviceRequest.appointmentStartAt ?? ''
      return tour ? next : next.sort((a, b) => time(a).localeCompare(time(b)))
    })
  const shift = (index: number, delta: number) =>
    setOrder((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      if (item !== undefined) next.splice(target, 0, item)
      return next
    })

  const save = async () => {
    if (!editable || saving) return
    try {
      if (!tour) {
        await create.mutateAsync({
          calendarId: data.calendar.id,
          tourDate: data.date,
          technicianId,
          serviceRequestIds: order,
        })
      } else {
        if (technicianId !== (tour.technician?.id ?? null))
          await patch.mutateAsync({ id: tour.id, body: { technicianId, version: tour.version } })
        if (order.join(',') !== originalOrder.join(','))
          await putStops.mutateAsync({ id: tour.id, serviceRequestIds: order })
      }
      notify.success(`Tour saved · ${data.calendar.name}, ${formatDate(data.date)}`)
    } catch (error) {
      notifyActionError(error)
    }
  }
  useShortcut('s', () => void save(), {
    enabled: editable && dirty,
    description: 'Save tour',
    group: 'Tour planner',
  })

  const onRowKey = (event: KeyboardEvent, index: number) => {
    if (!event.altKey) return
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      shift(index, -1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      shift(index, 1)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h2 className="text-md font-semibold">{data.calendar.name}</h2>
          <p className="text-sm text-fg-3">{formatDate(data.date)}</p>
        </div>
        {tour && <StatusBadge entity="tourStatus" state={tour.status} className="ml-auto" />}
        <IconButton
          icon={X}
          label="Close panel"
          onClick={onClose}
          className={tour ? '' : 'ml-auto'}
        />
      </div>

      <div className="grid gap-1 text-xs text-fg-2">
        <span aria-hidden>Technician</span>
        <Select<string>
          label="Technician"
          value={technicianId ? String(technicianId) : 'none'}
          onValueChange={(value) => setTechnicianId(value === 'none' ? null : Number(value))}
          disabled={
            !editable || (tour !== undefined && !['draft', 'planned'].includes(tour.status))
          }
          options={[
            { value: 'none', label: 'No technician (draft)' },
            ...technicians.map((t) => ({ value: String(t.id), label: t.displayName })),
          ]}
          className="w-full"
        />
      </div>

      {tour?.warnings.map((code) => (
        <Banner key={code} tone="caution" icon={TriangleAlert} title={WARNING_TEXT[code] ?? code} />
      ))}

      {doneStops.length > 0 && (
        <section aria-label="Finished stops" className="grid gap-1">
          <h3 className="text-xs font-semibold text-fg-2">Finished stops</h3>
          <div className="flex flex-wrap gap-1">
            {doneStops.map((stop) => (
              <StopChip
                key={stop.id}
                time={stop.serviceRequest.appointmentStartAt}
                number={stop.serviceRequest.number}
                readiness={stop.readiness}
                outcome={stop.outcome}
                onClick={() => drawer.open('sr', stop.serviceRequest.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Stops in order" className="grid gap-1">
        <h3 className="text-xs font-semibold text-fg-2">
          Stops in order · {order.length}
          {editable && <span className="font-normal text-fg-3"> · Alt+↑/↓ moves a stop</span>}
        </h3>
        {order.length === 0 ? (
          <p className="text-sm text-fg-3">No stops yet. Tick candidates below.</p>
        ) : (
          <ol className="grid gap-1">
            {order.map((id, index) => {
              const candidate = byId.get(id)
              const stop = pendingStops.find((s) => s.serviceRequest.id === id)
              const number =
                candidate?.serviceRequest.number ?? stop?.serviceRequest.number ?? `#${id}`
              const time =
                candidate?.serviceRequest.appointmentStartAt ??
                stop?.serviceRequest.appointmentStartAt ??
                null
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-xs border border-line-subtle px-2 py-1"
                >
                  {editable ? (
                    <button
                      type="button"
                      aria-label={`Stop ${index + 1}: ${number}. Alt plus arrow keys move it`}
                      onKeyDown={(event) => onRowKey(event, index)}
                      className="grid h-6 w-5 cursor-grab place-items-center rounded-xs text-fg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <GripVertical aria-hidden size={14} />
                    </button>
                  ) : null}
                  <span className="hg-mono w-5 text-right text-xs text-fg-3">{index + 1}</span>
                  <StopChip
                    time={time}
                    number={number}
                    readiness={candidate?.readiness ?? stop?.readiness ?? 'not_started'}
                    outcome="pending"
                    onClick={() => drawer.open('sr', id)}
                  />
                  <span className="truncate text-xs text-fg-2">
                    {candidate?.serviceRequest.contact.displayName ??
                      stop?.serviceRequest.contact.displayName}
                  </span>
                  {editable && (
                    <span className="ml-auto flex">
                      <IconButton
                        icon={ArrowUp}
                        size="sm"
                        label={`Move ${number} up`}
                        disabled={index === 0}
                        onClick={() => shift(index, -1)}
                      />
                      <IconButton
                        icon={ArrowDown}
                        size="sm"
                        label={`Move ${number} down`}
                        disabled={index === order.length - 1}
                        onClick={() => shift(index, 1)}
                      />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section aria-label="Candidates" className="grid gap-1">
        <h3 className="text-xs font-semibold text-fg-2">Candidates · {data.candidates.length}</h3>
        {data.candidates.length === 0 ? (
          <p className="text-sm text-fg-3">No booked appointments for this route on this day.</p>
        ) : (
          <ul className="grid gap-0.5">
            {data.candidates.map((candidate) => {
              const sr = candidate.serviceRequest
              const checked = order.includes(sr.id)
              const checkboxId = `candidate-${sr.id}`
              return (
                <li
                  key={sr.id}
                  className="flex items-center gap-2 rounded-xs px-1 py-1 hover:bg-hover"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    disabled={!editable}
                    onCheckedChange={(value) => toggle(sr.id, value)}
                    aria-label={`Include ${sr.number}`}
                  />
                  <span className="hg-mono w-11 text-xs text-fg-2">
                    {sr.appointmentStartAt ? formatTime(sr.appointmentStartAt) : '--:--'}
                  </span>
                  <button
                    type="button"
                    className="rounded-xs focus-visible:outline-2 focus-visible:outline-focus"
                    onClick={() => drawer.open('sr', sr.id)}
                  >
                    <IdInk value={sr.number} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs">{sr.contact.displayName}</span>
                  <StatusBadge entity="readiness" state={candidate.readiness} size="sm" />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            variant="primary"
            icon={Save}
            shortcut="s"
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            Save tour
          </Button>
          {tour?.availableActions.includes('cancel') && (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel tour
            </Button>
          )}
        </div>
      )}
      {tour && (
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={`Cancel the tour ${data.calendar.name}, ${formatDate(data.date)}?`}
          description={`${tour.pendingCount} pending stops become unplanned again.`}
          confirmLabel="Cancel tour"
          destructive
          pending={action.isPending}
          onConfirm={() =>
            action.mutate(
              { id: tour.id, action: 'cancel', version: tour.version },
              {
                onSuccess: () => {
                  setConfirmCancel(false)
                  notify.success('Tour cancelled')
                },
                onError: (error) => notifyActionError(error),
              },
            )
          }
        />
      )}
    </div>
  )
}
