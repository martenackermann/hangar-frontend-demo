import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, MapPin, Phone, Play, RotateCw, WifiOff } from 'lucide-react'
import { useOnline } from '@/components/scan/scan-station'
import { StatusBadge, VipFlag } from '@/components/domain/status'
import { TechnicianShell, TourStation } from '@/components/app/technician-shell'
import { Button } from '@/components/ui/button'
import { Banner, EmptyState, FlagBadge, ProgressMeter, Skeleton } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { notify } from '@/components/ui/toast'
import { notifyActionError } from '@/components/drawer/workflow-actions'
import type { TourDetail, TourStop } from '@/lib/api/types'
import { addWorkingDays, businessToday, plural } from '@/lib/format'
import { fieldQueries, useTourAction } from '@/modules/field/api'
import {
  addressLines,
  deviceSummary,
  stopPhone,
  timeWindow,
  tourCode,
} from '@/modules/field/lib/stops'
import { cn } from '@/lib/utils'

/**
 * My tour (SCREENS.md §6.2, DESIGN.md §9.4): the technician's day at 390 px — date stepper,
 * tour card with progress and Start, the Line of stops with call / navigate-free big targets.
 * One amber action per view: Start tour while the tour can be started, otherwise the current
 * stop's Open.
 */
export function MyTour({
  date,
  tourId,
  onDateChange,
  onTourChange,
}: {
  date: string
  tourId: number | undefined
  onDateChange: (date: string) => void
  onTourChange: (tourId: number) => void
}) {
  const online = useOnline()
  // The query keeps an offline copy in IndexedDB (`meta.persist`, `@/lib/query/persist`), so a
  // reload without a connection still shows the last loaded tour.
  const query = useQuery(fieldQueries.myTours(date))

  const offline = !online || (query.isError && query.data !== undefined)
  const tours = query.data?.data ?? []
  const tour = tours.find((t) => t.id === tourId) ?? tours[0]
  const devices = tour
    ? tour.stops.reduce(
        (sum, s) => sum + s.serviceRequest.newItems.length + s.serviceRequest.oldItems.length,
        0,
      )
    : 0

  return (
    <TechnicianShell
      date={date}
      onDateChange={onDateChange}
      tourCode={tour ? tourCode(tour) : null}
      summary={
        tour
          ? `${plural(tour.stopCount, 'stop')} · ${plural(devices, 'device')} · ${tour.calendar.name}`
          : null
      }
      status={
        offline ? (
          <span className="inline-flex items-center gap-1 text-tone-caution-fg">
            <Icon icon={WifiOff} size={12} /> Offline
          </span>
        ) : query.isFetching ? (
          <span className="inline-flex items-center gap-1">
            <Icon icon={RotateCw} size={12} className="animate-spin" /> Updating
          </span>
        ) : null
      }
    >
      <h1 className="sr-only">My tour</h1>
      {offline && (
        <Banner
          tone="caution"
          icon={WifiOff}
          title="Offline — showing saved tour. Scans need a connection."
          className="m-3"
        />
      )}
      {query.isPending && !offline ? (
        <div className="grid gap-3 p-4" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : query.isError && !offline ? (
        <EmptyState
          icon={WifiOff}
          title="Your tour could not be loaded"
          actions={
            <Button variant="secondary" size="touch" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      ) : !tour ? (
        <EmptyState
          icon={MapPin}
          title="No tour planned for you on this day"
          actions={
            <Button
              variant="secondary"
              size="touch"
              onClick={() => onDateChange(addWorkingDays(date, 1))}
            >
              Show next working day
            </Button>
          }
        />
      ) : (
        <>
          {tours.length > 1 && (
            <div className="px-4 pt-3">
              <SegmentedControl
                label="Tour"
                value={String(tour.id)}
                onValueChange={(value) => onTourChange(Number(value))}
                options={tours.map((t) => ({ value: String(t.id), label: t.calendar.name }))}
              />
            </div>
          )}
          <TourCard tour={tour} disabled={offline} />
          <ol aria-label="Stops" className="pt-2 pb-6">
            {tour.stops.map((stop) => (
              <StopStation
                key={stop.id}
                tour={tour}
                stop={stop}
                isNow={stop.id === tour.stops.find((s) => s.outcome === 'pending')?.id}
                primary={!tour.availableActions.includes('start')}
              />
            ))}
          </ol>
        </>
      )}
    </TechnicianShell>
  )
}

function TourCard({ tour, disabled }: { tour: TourDetail; disabled: boolean }) {
  const action = useTourAction()
  const done = tour.stopCount - tour.pendingCount
  const today = businessToday()
  return (
    <section
      aria-label={`Tour ${tour.calendar.name}`}
      className="m-3 grid gap-3 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-md font-semibold">{tour.calendar.name}</h2>
        <StatusBadge entity="tourStatus" state={tour.status} className="ml-auto" />
      </div>
      <div className="grid gap-1.5">
        <ProgressMeter
          label="Tour progress"
          valueText={`${done} of ${tour.stopCount} done`}
          max={Math.max(1, tour.stopCount)}
          segments={[
            { value: tour.completedCount, tone: 'done', label: 'Done' },
            { value: tour.rescheduledCount, tone: 'caution', label: 'Rescheduled' },
            { value: tour.cancelledCount, tone: 'critical', label: 'Cancelled' },
          ]}
        />
        <p aria-hidden className="text-xs text-fg-2">
          <span className="hg-mono text-fg">{done}</span> of{' '}
          <span className="hg-mono text-fg">{tour.stopCount}</span> done
        </p>
      </div>
      {tour.availableActions.includes('start') && (
        <Button
          variant="primary"
          size="touch"
          icon={Play}
          disabled={disabled}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              { id: tour.id, action: 'start', version: tour.version },
              {
                onSuccess: () => notify.success(`Tour started · ${tour.calendar.name}`),
                onError: (error) => notifyActionError(error),
              },
            )
          }
        >
          Start tour
        </Button>
      )}
      {tour.status === 'planned' && tour.tourDate !== today && (
        <p className="text-xs text-fg-3">The tour can be started on its tour date.</p>
      )}
    </section>
  )
}

function StopStation({
  tour,
  stop,
  isNow,
  primary,
}: {
  tour: TourDetail
  stop: TourStop
  isNow: boolean
  /** The current stop's Open is the view's amber action once the tour has started. */
  primary: boolean
}) {
  const sr = stop.serviceRequest
  const phone = stopPhone(stop)
  const [line1, line2] = addressLines(stop)
  const state = stop.outcome !== 'pending' ? 'done' : isNow ? 'now' : 'next'
  return (
    <TourStation
      time={timeWindow(sr.appointmentStartAt, sr.appointmentEndAt)}
      title={sr.contact.displayName}
      state={state}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <span className="hg-mono">{sr.number}</span>
          {stop.outcome === 'pending' ? (
            <StatusBadge entity="readiness" state={stop.readiness} size="sm" />
          ) : (
            <StatusBadge entity="tourStopOutcome" state={stop.outcome} size="sm" />
          )}
          {sr.isVip && <VipFlag />}
          {sr.isCampus && <FlagBadge>Campus</FlagBadge>}
        </span>
      }
    >
      <div className={cn('grid gap-2', state === 'done' && 'opacity-70')}>
        <button
          type="button"
          className="grid justify-items-start rounded-sm text-left text-sm text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`${line1}, ${line2}`)
              .then(() => notify.success('Address copied', { duration: 2000 }))
          }}
          aria-label={`Copy address ${line1}, ${line2}`}
        >
          <span>{line1}</span>
          <span>{line2}</span>
        </button>
        <p className="text-xs text-fg-3">{deviceSummary(stop)}</p>
        <div className="grid grid-cols-2 gap-2">
          {phone ? (
            <Button asChild variant="secondary" size="touch" icon={Phone}>
              <a href={`tel:${phone.replace(/\s+/g, '')}`}>Call</a>
            </Button>
          ) : (
            <Button variant="secondary" size="touch" icon={Phone} disabled>
              No phone
            </Button>
          )}
          {/* Stays a working link offline: the deployment view keeps an offline copy too. */}
          <Button
            asChild
            variant={isNow && primary ? 'primary' : 'secondary'}
            size="touch"
            iconEnd={ChevronRight}
          >
            <Link
              to="/field/tours/$tourId/stops/$stopId"
              params={{ tourId: String(tour.id), stopId: String(stop.id) }}
            >
              {stop.outcome === 'pending' ? 'Open' : 'View'}
              <span className="sr-only"> stop · {sr.contact.displayName}</span>
            </Link>
          </Button>
        </div>
      </div>
    </TourStation>
  )
}
