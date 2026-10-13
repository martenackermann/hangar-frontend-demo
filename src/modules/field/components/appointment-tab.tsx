import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { detailQueries } from '@/lib/api/details'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { fieldQueries } from '@/modules/field/api'
import { BookAppointmentForm, RequestRescheduleForm } from './appointment-forms'

/** SR drawer › Appointment (SCREENS.md §1.5, H4): current appointment, booking, tour, history. */
export function AppointmentTab({ sr }: { sr: ServiceRequestDetail }) {
  const queryClient = useQueryClient()
  const appointments = useQuery(fieldQueries.srAppointments(sr.id))
  const stops = useQuery(fieldQueries.srTourStops(sr.id))
  const [reschedule, setReschedule] = useState(false)
  const canBook = sr.availableActions.includes('book_appointment')
  const canReschedule = sr.availableActions.includes('request_reschedule')
  const current = appointments.data?.data.find((a) => a.isCurrent)
  const refresh = (updated: ServiceRequestDetail) =>
    queryClient.setQueryData(detailQueries.serviceRequest(sr.id).queryKey, updated)

  return (
    <div className="grid gap-2">
      <SectionHeading
        actions={
          canReschedule && (
            <Button size="sm" icon={CalendarClock} onClick={() => setReschedule(true)}>
              Request reschedule
            </Button>
          )
        }
      >
        Current appointment
      </SectionHeading>
      {sr.appointmentStartAt ? (
        <KeyValues>
          <KeyValue label="When">
            {formatDateTime(sr.appointmentStartAt)}–{formatTime(sr.appointmentEndAt)}
          </KeyValue>
          <KeyValue label="Calendar">{sr.appointmentCalendarName}</KeyValue>
          <KeyValue label="Source">
            {current
              ? current.source === 'manual'
                ? 'Booked by dispatch'
                : 'Booked by the user'
              : null}
          </KeyValue>
          <KeyValue label="Booked">
            {current?.bookedAt ? formatDateTime(current.bookedAt) : null}
          </KeyValue>
        </KeyValues>
      ) : (
        <p className="text-sm text-fg-3">
          {sr.status === 'reschedule_needed'
            ? 'Waiting for a new appointment.'
            : 'No appointment booked yet.'}
        </p>
      )}

      {canBook && (
        <>
          <SectionHeading>Book appointment</SectionHeading>
          <BookAppointmentForm sr={sr} onDone={refresh} />
        </>
      )}

      <SectionHeading>Tour</SectionHeading>
      {stops.isPending ? (
        <Skeleton className="h-10" />
      ) : stops.data?.data.length ? (
        <ul className="grid gap-1">
          {stops.data.data.map((stop) => (
            <li key={stop.stopId} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{formatDate(stop.tourDate)}</span>
              <span className="text-fg-2">{stop.technicianName ?? 'No technician'}</span>
              <StatusBadge entity="tourStatus" state={stop.status} size="sm" />
              <StatusBadge entity="tourStopOutcome" state={stop.outcome} size="sm" />
              <Link
                to="/field/tour-planner"
                search={{
                  panel: 'tour',
                  date: stop.tourDate,
                  calendarId: sr.appointmentCalendarId ?? undefined,
                }}
                className="ml-auto text-xs text-accent-text hover:underline"
              >
                Open in planner
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">Not planned on a tour.</p>
      )}

      <SectionHeading>Appointment history</SectionHeading>
      {appointments.isPending ? (
        <Skeleton className="h-16" />
      ) : appointments.data?.data.length ? (
        <ul className="grid gap-1.5">
          {appointments.data.data.map((a) => (
            <li
              key={a.id}
              className="grid gap-0.5 rounded-xs border border-line-subtle px-2 py-1.5 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="hg-mono">{formatDateTime(a.startAt)}</span>
                <StatusBadge entity="appointmentStatus" state={a.status} size="sm" />
                {a.isCurrent && <span className="text-xs text-accent-text">current</span>}
              </span>
              <span className="text-xs text-fg-3">
                {a.calendar.name} · {a.source === 'manual' ? 'dispatch' : 'booking portal'}
                {a.notes ? ` · ${a.notes}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarClock} title="No appointments for this request." />
      )}

      {reschedule && (
        <Dialog open onOpenChange={(open) => !open && setReschedule(false)}>
          <DialogContent title={`Request reschedule · ${sr.number}`}>
            <RequestRescheduleForm
              sr={sr}
              onCancel={() => setReschedule(false)}
              onDone={(updated) => {
                refresh(updated)
                setReschedule(false)
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
