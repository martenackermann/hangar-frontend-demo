import { CalendarClock } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import {
  addWorkingDays,
  businessToday,
  formatDateTime,
  formatRelative,
  toBusinessDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

/** True when the appointment is today or on the next working day (staging must hurry). */
function appointmentSoon(startAt: string | null | undefined): boolean {
  if (!startAt) return false
  return toBusinessDate(startAt) <= addWorkingDays(businessToday(), 1)
}

/** Relative appointment ("in 2 days") with the absolute date as tooltip; caution when soon. */
export function Appointment({
  startAt,
  className,
  absolute,
}: {
  startAt: string | null | undefined
  className?: string
  /** Show the absolute date next to the relative one. */
  absolute?: boolean
}) {
  if (!startAt) return <span className="text-fg-disabled">No appointment</span>
  const soon = appointmentSoon(startAt)
  return (
    <Tooltip content={formatDateTime(startAt)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap',
          soon ? 'hg-tone-caution text-(--t-fg)' : 'text-fg-2',
          className,
        )}
      >
        <Icon icon={CalendarClock} size={12} className={soon ? 'text-(--t)' : 'text-fg-3'} />
        {absolute ? formatDateTime(startAt) : formatRelative(startAt)}
      </span>
    </Tooltip>
  )
}
