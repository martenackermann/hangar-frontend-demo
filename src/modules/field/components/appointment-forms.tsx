import { useQuery } from '@tanstack/react-query'
import { CalendarCheck2, CalendarX2, OctagonX } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Banner } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { isApiError } from '@/lib/api/errors'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { addWorkingDays, businessToday } from '@/lib/format'
import { fieldQueries } from '@/modules/field/api'
import { businessInstant } from '@/modules/field/lib/time'

const TIMES = Array.from({ length: 21 }, (_, index) => {
  const minutes = 7 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return { root: 'The action failed.' }
  const out: Record<string, string> = {}
  for (const [key, messages] of Object.entries(error.fieldErrors)) out[key] = messages.join(' ')
  if (!Object.keys(out).length) out.root = error.guard?.message ?? error.detail ?? error.title
  return out
}

/**
 * Book appointment (SR #13): calendar (defaults to the region's route), date and time; the
 * appointment is created at the booking provider (502 `booking_error` when it refuses).
 */
export function BookAppointmentForm({
  sr,
  onDone,
  onCancel,
}: {
  sr: ServiceRequestDetail
  onDone: (updated: ServiceRequestDetail) => void
  onCancel?: () => void
}) {
  const calendars = useQuery(fieldQueries.calendars()).data?.data ?? []
  const regionCalendar = calendars.find((c) => c.region?.id === sr.region?.id && c.isEnabled)
  const [calendarId, setCalendarId] = useState<number | undefined>(undefined)
  const [date, setDate] = useState<string | undefined>(addWorkingDays(businessToday(), 2))
  const [time, setTime] = useState('09:00')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useWorkflowAction('serviceRequest', sr, sr.number)
  const effectiveCalendar = calendarId ?? regionCalendar?.id

  const submit = async () => {
    const local: Record<string, string> = {}
    if (!effectiveCalendar) local.calendarId = 'Choose a calendar.'
    if (!date) local.startAt = 'Choose a date.'
    setErrors(local)
    if (Object.keys(local).length || !date) return
    const [hour = 9, minute = 0] = time.split(':').map(Number)
    try {
      const updated = await mutation.mutateAsync({
        action: 'book_appointment',
        body: { calendarId: effectiveCalendar, startAt: businessInstant(date, hour, minute) },
      })
      onDone(updated)
    } catch (error) {
      setErrors(fieldErrors(error))
    }
  }

  return (
    <div className="grid gap-3">
      <Field label="Calendar" required error={errors.calendarId}>
        {({ id }) => (
          <Select<string>
            id={id}
            value={effectiveCalendar ? String(effectiveCalendar) : undefined}
            onValueChange={(value) => setCalendarId(Number(value))}
            placeholder="Choose a route"
            className="w-full"
            options={calendars.map((c) => ({
              value: String(c.id),
              label: `${c.name}${c.isEnabled ? '' : ' (disabled)'}`,
              disabled: !c.isEnabled,
            }))}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required error={errors.startAt}>
          {() => <DatePicker label="Appointment date" value={date} onChange={setDate} />}
        </Field>
        <Field label="Time" required>
          {({ id }) => (
            <Select<string>
              id={id}
              value={time}
              onValueChange={setTime}
              options={TIMES.map((t) => ({ value: t, label: t }))}
              className="w-full"
            />
          )}
        </Field>
      </div>
      {errors.root && <Banner tone="critical" icon={OctagonX} title={errors.root} />}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          icon={CalendarCheck2}
          loading={mutation.isPending}
          onClick={() => void submit()}
        >
          Book appointment
        </Button>
      </div>
    </div>
  )
}

/** Request reschedule (SR #16): reason, notify the employee, cancel at the provider. */
export function RequestRescheduleForm({
  sr,
  onDone,
  onCancel,
}: {
  sr: ServiceRequestDetail
  onDone: (updated: ServiceRequestDetail) => void
  onCancel?: () => void
}) {
  const [reason, setReason] = useState('')
  const [notifyUser, setNotifyUser] = useState(true)
  const [cancelAtProvider, setCancelAtProvider] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useWorkflowAction('serviceRequest', sr, sr.number)
  const submit = async () => {
    if (!reason.trim()) {
      setErrors({ reason: 'A reason is required.' })
      return
    }
    try {
      const updated = await mutation.mutateAsync({
        action: 'request_reschedule',
        body: { reason: reason.trim(), notifyUser, cancelAtProvider },
      })
      onDone(updated)
    } catch (error) {
      setErrors(fieldErrors(error))
    }
  }
  return (
    <div className="grid gap-3">
      <Field label="Reason" required error={errors.reason}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={3}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </Field>
      <Switch
        checked={notifyUser}
        onCheckedChange={setNotifyUser}
        label="Email the employee to book a new date"
      />
      <Switch
        checked={cancelAtProvider}
        onCheckedChange={setCancelAtProvider}
        label="Cancel the appointment at the booking provider"
      />
      {errors.root && <Banner tone="critical" icon={OctagonX} title={errors.root} />}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          icon={CalendarX2}
          loading={mutation.isPending}
          onClick={() => void submit()}
        >
          Request reschedule
        </Button>
      </div>
    </div>
  )
}
