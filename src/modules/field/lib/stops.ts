import type { TourDetail, TourStop } from '@/lib/api/types'
import { formatTime } from '@/lib/format'

/** Formatting helpers for tour stops (My tour, planner, deployment). */

/** "09:30–10:30" in the business time zone. */
export function timeWindow(start: string | null, end: string | null): string {
  if (!start) return 'No time'
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start)
}

/** Best phone for a stop: on-site phone, else mobile, else phone. */
export function stopPhone(stop: TourStop): string | null {
  return (
    stop.serviceRequest.onsiteContactPhone ??
    stop.serviceRequest.contact.mobile ??
    stop.serviceRequest.contact.phone
  )
}

/** "Deliver: Aero 14 G3 Laptop, Dock U4 · Collect: GX100068" */
export function deviceSummary(stop: TourStop): string {
  const deliver = stop.serviceRequest.newItems.map((i) => i.label)
  const collect = stop.serviceRequest.oldItems.map((i) => i.label)
  return [
    deliver.length ? `Deliver: ${deliver.join(', ')}` : null,
    collect.length ? `Collect: ${collect.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function addressLines(stop: TourStop): [string, string] {
  const a = stop.serviceRequest.deliveryAddress
  const place = [a.building && `Building ${a.building}`, a.room && `room ${a.room}`]
    .filter(Boolean)
    .join(', ')
  return [
    [a.street, place].filter(Boolean).join(' · ') || 'No street given',
    [a.zip, a.city].filter(Boolean).join(' ') || '—',
  ]
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/** Short tour code for headers: `T-RIV-07`. */
export function tourCode(tour: Pick<TourDetail, 'id' | 'calendar'>): string {
  const region = tour.calendar.region?.code ?? tour.calendar.name
  return `T-${region.slice(0, 3).toUpperCase()}-${String(tour.id).padStart(2, '0')}`
}
