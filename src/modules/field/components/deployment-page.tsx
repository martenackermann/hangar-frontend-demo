import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Download,
  Lock,
  OctagonX,
  Phone,
  ScanLine,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { CopyableId, StatusBadge, VipFlag } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner, EmptyState, FlagBadge, Skeleton } from '@/components/ui/feedback'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api/client'
import { downloadFrom } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type { DeploymentView, DownloadLink, ServiceRequestDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatFullDateTime } from '@/lib/format'
import { FIELD_INVALIDATES, fieldQueries } from '@/modules/field/api'
import { timeWindow } from '@/modules/field/lib/stops'
import { DeploymentScanner } from './deployment-scanner'
import { CompleteForm, DeviationActionForm } from './on-site-forms'

export type DeploymentTab = 'instructions' | 'devices' | 'contact' | 'finish'

const ON_SITE = new Set(['provided', 'shipped'])

/**
 * Deployment (SCREENS.md §6.3): one stop on site, mobile-first — sticky header, tabs
 * instructions · devices · contact · finish, sticky bottom bar Scan · Complete deployment (hidden
 * on the Finish tab, where the form's own submit is the one primary action); success screen with
 * the protocol download and the next stop.
 *
 * The bars stick inside the shell's scrolling `<main>`, so the root must not become a scroll
 * container itself: `overflow-x-clip`, never `overflow-x-hidden` (that would turn the root into
 * the sticky containing block and the footer would scroll away with the content).
 */
export function DeploymentPage({
  tourId,
  stopId,
  tab,
  onTabChange,
}: {
  tourId: number
  stopId: number
  tab: DeploymentTab | undefined
  onTabChange: (tab: DeploymentTab) => void
}) {
  const query = useQuery(fieldQueries.deployment(tourId, stopId))
  const queryClient = useQueryClient()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [completed, setCompleted] = useState<ServiceRequestDetail | null>(null)
  const [sheet, setSheet] = useState<'reschedule_on_site' | 'cancel_on_site' | null>(null)
  const enums = useEnums()

  if (query.isPending)
    return (
      <div className="mx-auto grid w-full max-w-[720px] gap-3 p-4" aria-busy="true">
        <Skeleton className="h-14" />
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    )
  if (query.isError) {
    const forbidden = isApiError(query.error) && query.error.status === 403
    return (
      <EmptyState
        icon={forbidden ? Lock : TriangleAlert}
        title={
          forbidden
            ? "This stop belongs to another technician's tour"
            : 'The stop could not be loaded'
        }
        actions={
          forbidden ? (
            <Button asChild variant="secondary">
              <Link to="/field/my-tour">Back to my tour</Link>
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          )
        }
      />
    )
  }

  const view = query.data
  const sr = view.serviceRequest
  const pending = view.stop.outcome === 'pending'
  const onSite = ON_SITE.has(sr.status)
  const active = pending && onSite
  const current: DeploymentTab =
    tab ?? (view.tour.status === 'in_progress' && active ? 'devices' : 'instructions')
  const refresh = () =>
    Promise.all(FIELD_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey })))

  if (completed) return <CompletedScreen view={view} sr={completed} />

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[720px] min-w-0 flex-col overflow-x-clip bg-canvas">
      <header className="sticky top-0 z-10 grid gap-1 border-b border-line bg-surface px-3 py-2">
        <h1 className="sr-only">
          Deployment {sr.number} · {sr.contact.displayName}
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="lg" icon={ArrowLeft}>
            <Link to="/field/my-tour" search={{ date: view.tour.tourDate }}>
              Tour
            </Link>
          </Button>
          <CopyableId value={sr.number} />
          <StatusBadge entity="serviceRequestStatus" state={sr.status} className="ml-auto" />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
          <span className="font-semibold">{sr.contact.displayName}</span>
          <span className="hg-mono text-fg-2">
            {timeWindow(
              view.stop.serviceRequest.appointmentStartAt,
              view.stop.serviceRequest.appointmentEndAt,
            )}
          </span>
          {sr.isVip && <VipFlag />}
          {sr.isCampus && <FlagBadge>Campus</FlagBadge>}
        </div>
      </header>

      <div className="grid min-w-0 flex-1 content-start gap-3 p-3">
        {!pending && (
          <Banner
            tone={view.stop.outcome === 'completed' ? 'done' : 'caution'}
            icon={view.stop.outcome === 'completed' ? CheckCircle2 : CalendarClock}
            title={`This stop is ${enumLabel(enums, 'tourStopOutcome', view.stop.outcome).toLowerCase()}.`}
          >
            {sr.protocolAvailable && <ProtocolButton srId={sr.id} />}
          </Banner>
        )}
        {pending && !onSite && (
          <Banner
            tone="caution"
            icon={TriangleAlert}
            title={`Hardware not handed over yet (status: ${enumLabel(enums, 'serviceRequestStatus', sr.status)}). Contact dispatch.`}
          />
        )}
        <Tabs value={current} onValueChange={(value) => onTabChange(value as DeploymentTab)}>
          <TabsList aria-label="Deployment">
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger
              value="devices"
              count={`${view.progress.newVerified + view.progress.oldVerified}/${view.progress.newTotal + view.progress.oldTotal}`}
            >
              Devices
            </TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="finish">Finish</TabsTrigger>
          </TabsList>
          <TabsContent value="instructions" className="pt-3">
            <Instructions view={view} />
          </TabsContent>
          <TabsContent value="devices" className="pt-3">
            <DeploymentScanner
              view={view}
              cameraOpen={cameraOpen}
              onCameraOpenChange={setCameraOpen}
              disabled={!active}
            />
          </TabsContent>
          <TabsContent value="contact" className="pt-3">
            <ContactPanel view={view} />
          </TabsContent>
          <TabsContent value="finish" className="pt-3">
            {active ? (
              <div className="grid gap-6">
                <CompleteForm
                  sr={sr}
                  codes={view.deviationCodes}
                  onDone={(updated) => {
                    void refresh()
                    setCompleted(updated)
                  }}
                />
                <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <Button
                    variant="secondary"
                    size="touch"
                    icon={CalendarClock}
                    onClick={() => setSheet('reschedule_on_site')}
                  >
                    Reschedule
                  </Button>
                  <Button
                    variant="danger"
                    size="touch"
                    icon={OctagonX}
                    onClick={() => setSheet('cancel_on_site')}
                  >
                    Cancel on site
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-3">Nothing to finish on this stop.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {active && current !== 'finish' && (
        <div className="sticky bottom-0 z-20 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-line bg-raised p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-bar">
          <Button
            variant="secondary"
            size="touch"
            icon={ScanLine}
            onClick={() => {
              onTabChange('devices')
              setCameraOpen(true)
            }}
          >
            Scan
          </Button>
          <Button
            variant="primary"
            size="touch"
            icon={CheckCircle2}
            onClick={() => onTabChange('finish')}
          >
            Complete deployment
          </Button>
        </div>
      )}

      {sheet && (
        <Dialog open onOpenChange={(open) => !open && setSheet(null)}>
          <DialogContent
            title={
              sheet === 'reschedule_on_site'
                ? `Reschedule ${sr.number}`
                : `Cancel ${sr.number} on site`
            }
            description={
              sheet === 'reschedule_on_site'
                ? 'The appointment did not take place. Dispatch books a new date.'
                : 'The order ends here. Choose why.'
            }
          >
            <DeviationActionForm
              sr={sr}
              action={sheet}
              codes={view.deviationCodes}
              onCancel={() => setSheet(null)}
              onDone={() => {
                setSheet(null)
                void refresh()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function Instructions({ view }: { view: DeploymentView }) {
  const enums = useEnums()
  const w = view.workInstructions
  const a = w.deliveryAddress
  return (
    <div className="grid gap-4">
      <KeyValues>
        <KeyValue label="Procurement">
          {enumLabel(enums, 'procurementType', w.procurementType)}
        </KeyValue>
        <KeyValue label="Scope of delivery">{w.scopeOfDelivery}</KeyValue>
        <KeyValue label="Client component">{w.clientComponent}</KeyValue>
        <KeyValue label="OS reinstall">
          {w.osReinstall ? enumLabel(enums, 'osReinstallTiming', w.osReinstall) : 'None'}
        </KeyValue>
        <KeyValue label="Preparation">
          {w.withoutAssetPrep ? 'Without asset preparation' : 'Prepared at the hub'}
        </KeyValue>
        <KeyValue label="Campus">{w.isCampus ? 'Yes' : 'No'}</KeyValue>
      </KeyValues>
      <SectionHeading>Software</SectionHeading>
      {w.software.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {w.software.map((name) => (
            <li key={name}>
              <FlagBadge>{name}</FlagBadge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">No additional software.</p>
      )}
      {w.note && (
        <>
          <SectionHeading>Note</SectionHeading>
          <p className="text-sm">{w.note}</p>
        </>
      )}
      <SectionHeading>Delivery address</SectionHeading>
      <p className="text-sm">
        {a.street ?? '—'}
        <br />
        {[a.zip, a.city].filter(Boolean).join(' ')}
        {(a.building ?? a.room) && (
          <>
            <br />
            {[a.building && `Building ${a.building}`, a.room && `room ${a.room}`]
              .filter(Boolean)
              .join(', ')}
          </>
        )}
      </p>
      {w.onsiteContactPhone && (
        <Button asChild variant="secondary" size="touch" icon={Phone}>
          <a href={`tel:${w.onsiteContactPhone.replace(/\s+/g, '')}`}>
            Call on-site contact {w.onsiteContactPhone}
          </a>
        </Button>
      )}
    </div>
  )
}

function ContactPanel({ view }: { view: DeploymentView }) {
  const c = view.contact
  const phones = [
    ['Mobile', c.mobile],
    ['Phone', c.phone],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  return (
    <div className="grid gap-4">
      <KeyValues>
        <KeyValue label="Name">{c.displayName}</KeyValue>
        <KeyValue label="Employee id">
          <span className="hg-mono">{c.userId}</span>
        </KeyValue>
        <KeyValue label="Email">{c.email}</KeyValue>
        <KeyValue label="Department">{c.department}</KeyValue>
        <KeyValue label="Address" full>
          {[c.address.street, [c.address.zip, c.address.city].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ')}
        </KeyValue>
      </KeyValues>
      <div className="grid gap-2">
        {phones.map(([label, number]) => (
          <Button key={label} asChild variant="secondary" size="touch" icon={Phone}>
            <a href={`tel:${number.replace(/\s+/g, '')}`}>
              {label} {number}
            </a>
          </Button>
        ))}
      </div>
    </div>
  )
}

function ProtocolButton({ srId, size = 'lg' }: { srId: number; size?: 'lg' | 'touch' }) {
  return (
    <Button
      variant="secondary"
      size={size}
      icon={Download}
      onClick={() =>
        void downloadFrom(() => api.get<DownloadLink>(`/service-requests/${srId}/protocol`))
      }
    >
      Download protocol
    </Button>
  )
}

function CompletedScreen({ view, sr }: { view: DeploymentView; sr: ServiceRequestDetail }) {
  const canSeeTour = useCan('tours.execute_own')
  const tourQuery = useQuery(fieldQueries.tour(view.tour.id))
  const next = tourQuery.data?.stops.find((s) => s.outcome === 'pending' && s.id !== view.stop.id)
  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-4 p-6 text-center">
      <div className="hg-tone-done mx-auto grid size-16 place-items-center rounded-full bg-(--t-wash) text-(--t)">
        <CheckCircle2 aria-hidden size={32} />
      </div>
      <div role="status">
        <h1 className="text-xl font-semibold">{sr.number} completed</h1>
      </div>
      <p className="text-fg-2">
        {sr.milestones.completedAt ? formatFullDateTime(sr.milestones.completedAt) : null}
      </p>
      <div className="grid gap-2">
        <ProtocolButton srId={sr.id} size="touch" />
        {next ? (
          <Button asChild variant="primary" size="touch">
            <Link
              to="/field/tours/$tourId/stops/$stopId"
              params={{ tourId: String(view.tour.id), stopId: String(next.id) }}
            >
              Next stop · {next.serviceRequest.contact.displayName}
            </Link>
          </Button>
        ) : (
          canSeeTour && (
            <Button asChild variant="primary" size="touch">
              <Link to="/field/my-tour" search={{ date: view.tour.tourDate }}>
                Back to my tour
              </Link>
            </Button>
          )
        )}
      </div>
    </div>
  )
}
