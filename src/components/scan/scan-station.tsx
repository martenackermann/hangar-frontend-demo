import { Camera, CircleCheck, OctagonX, TriangleAlert, WifiOff } from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { ScanResult } from '@/lib/api/types'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { CameraScanner } from './camera-scanner'
import { ScanAnnouncer } from './scan-announcer'
import { ScanInput, type ScanInputHandle } from './scan-input'
import { keepFocus, ScanCueToggles, ScanDock, ScanModeContext, ScanSessionBar } from './scan-layout'
import { ScanList, type ScanEntry } from './scan-list'
import { useScanSession, type ScanSession } from './use-scan-session'
import { ScanFailedBanner, VerdictBanner } from './verdict-banner'

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

export function pendingText(count: number): string {
  return `${count} scan${count === 1 ? '' : 's'} being checked`
}

/**
 * The pending-scan count for screen readers: mounted for the station's lifetime and spoken only
 * once a queue builds up (2 or more), so a normal scan is not announced twice.
 */
export function PendingAnnouncer({ count }: { count: number }) {
  return (
    <span className="sr-only" aria-live="polite">
      {count > 1 ? pendingText(count) : ''}
    </span>
  )
}

/** Whether `undoLast` (⌘Z, the dock's Undo) has something to undo. */
export function canUndoLast(session: Pick<ScanSession<unknown>, 'entries'>): boolean {
  return session.entries.some(
    (entry) => entry.result?.undo && entry.result.applied && !entry.undone,
  )
}

export interface ScanSessionInfo {
  /** The page's h1: "Inventory · Hillford Hub". */
  title: string
  meta?: ReactNode
  progress?: ReactNode
  /** Session actions; the primary ("Finish & verify") is the view's one amber action. */
  actions?: ReactNode
}

export interface ScanStationProps<T> {
  /** "Scan serial or asset tag" */
  label: string
  /** The slice's scan endpoint: one request per scan → `ScanResult`. */
  submit: (value: string) => Promise<ScanResult<T>>
  /** Entity summary for list rows. */
  describe?: (result: ScanResult<T>) => ReactNode
  /** Extra banner content for the latest result (location comparison, item details). */
  details?: (result: ScanResult<T>) => ReactNode
  /** Context line under the field: what is expected next + chips (site, zone, locked place, SR). */
  context?: ReactNode
  /** Progress aside (inventory counters, packing progress). Desktop: 360 px column. */
  aside?: ReactNode
  onResult?: (result: ScanResult<T>, entry: ScanEntry<T>) => void
  onUndone?: (entry: ScanEntry<T>) => void
  initialEntries?: ScanEntry<T>[]
  /** Compact mode for embedding (personalization work panel, parcel packing). */
  compact?: boolean
  focusLock?: boolean
  listTitle?: string
  emptyList?: ReactNode
  /** Show the camera button (default: always; it is the primary input on phones). */
  camera?: boolean
  /**
   * Controlled camera sheet, e.g. for a phone bottom dock's "Camera scan" button. Leave it
   * undefined to let the station's own Camera button (and F3) manage it.
   */
  cameraOpen?: boolean
  onCameraOpenChange?: (open: boolean) => void
  placeholder?: string
  /** Classes of the station grid (field column + aside). */
  className?: string
  /**
   * Focus layout (DESIGN.md §9.3 inside the shell): a graphite session bar above the station.
   * With `session`, `dock` or `footer` the station fills its container and scrolls itself.
   */
  session?: ScanSessionInfo
  /** Phone bottom dock: Undo · Camera scan · `finish` (DESIGN.md §11.3). */
  dock?: boolean | { finish?: ReactNode }
  /** Content below the station inside its scroll area (reconciliation tables). */
  footer?: ReactNode
}

/**
 * ScanStation (SCREENS.md §10, DESIGN.md §9.3): focus-locked ScanInput → context line → verdict
 * banner → running list (+ optional progress aside). Enter submits; scans queue FIFO (max 20)
 * while a request is in flight; same value within 800 ms is a bounce. Shortcuts: Esc clears,
 * Esc Esc releases focus, ⌘Z/Ctrl+Z undoes the last undoable scan, F2 sound, F3 camera.
 * Offline: the field is disabled with "Offline — scanning needs a connection." Verdicts are
 * announced through two always-mounted live regions (`ScanAnnouncer`).
 */
export function ScanStation<T = unknown>({
  label,
  submit,
  describe,
  details,
  context,
  aside,
  onResult,
  onUndone,
  initialEntries,
  compact,
  focusLock = true,
  listTitle,
  emptyList,
  camera = true,
  cameraOpen: cameraOpenProp,
  onCameraOpenChange,
  placeholder,
  className,
  session: sessionInfo,
  dock,
  footer,
}: ScanStationProps<T>) {
  const online = useOnline()
  const inputRef = useRef<ScanInputHandle>(null)
  const [active, setActive] = useState(false)
  const [cameraOpenState, setCameraOpenState] = useState(false)
  const cameraOpen = cameraOpenProp ?? cameraOpenState
  const setCameraOpen = (open: boolean) => {
    if (cameraOpenProp === undefined) setCameraOpenState(open)
    onCameraOpenChange?.(open)
  }
  const session = useScanSession<T>({ submit, onResult, onUndone, initialEntries })

  useShortcut('mod+z', () => session.undoLast(), {
    description: 'Undo last scan',
    group: 'Scan station',
    allowInInput: true,
  })
  useShortcut('f3', () => setCameraOpen(true), {
    description: 'Camera scan',
    group: 'Scan station',
    allowInInput: true,
    enabled: camera,
  })

  const latest = session.latest
  const latestResult = latest?.result
  const withDock = Boolean(dock) && !compact
  const finish = typeof dock === 'object' ? dock.finish : undefined

  const tools = (
    <>
      <ScanCueToggles />
      {camera && (
        <Button
          size="sm"
          icon={Camera}
          onMouseDown={keepFocus}
          onClick={() => setCameraOpen(true)}
          shortcut="f3"
          className={cn(
            'max-md:h-11 max-md:px-3 max-md:text-sm pointer-coarse:h-11',
            withDock && 'max-md:hidden',
          )}
        >
          Camera
        </Button>
      )}
    </>
  )

  const station = (
    <div
      // minmax(0,1fr) columns: the station never grows wider than its container (390 px phones)
      className={cn(
        'grid min-h-0 grid-cols-[minmax(0,1fr)]',
        aside && !compact && 'grid-cols-[minmax(0,1fr)_360px] max-xl:grid-cols-[minmax(0,1fr)]',
        className,
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        <div
          className={cn('grid grid-cols-[minmax(0,1fr)] gap-3', compact ? 'p-3' : 'p-6 max-md:p-3')}
        >
          {!online && (
            <Banner tone="caution" icon={WifiOff} title="Offline — scanning needs a connection." />
          )}
          <ScanInput
            ref={inputRef}
            label={label}
            placeholder={placeholder}
            onSubmit={session.scan}
            focusLock={focusLock}
            disabled={!online}
            disabledReason="Offline — scanning needs a connection."
            compact={compact}
            tools={tools}
            onActiveChange={setActive}
          />
          {(context ?? session.pending > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
              {context}
              {session.pending > 0 && (
                <span aria-hidden className="ml-auto text-xs text-fg-3">
                  {pendingText(session.pending)}
                </span>
              )}
            </div>
          )}
          <PendingAnnouncer count={session.pending} />
          {latest?.state === 'failed' ? (
            <ScanFailedBanner
              sequence={latest.sequence}
              value={latest.value}
              error={latest.error}
            />
          ) : latest && latestResult ? (
            <VerdictBanner
              result={latestResult}
              sequence={latest.sequence}
              at={latest.at}
              compact={compact}
              details={details?.(latestResult)}
              onUndo={
                latestResult.undo && latestResult.applied && !latest.undone
                  ? () => void session.undo(latest)
                  : undefined
              }
              undoPending={session.undoingId === latest.id}
              dockUndo={withDock}
            />
          ) : null}
          <ScanAnnouncer latest={latest} />
        </div>
        {!compact && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface">
            <ScanList
              entries={session.entries}
              describe={describe}
              onUndo={(entry) => session.undo(entry)}
              title={listTitle}
              empty={emptyList}
            />
          </div>
        )}
        {compact && session.entries.length > 0 && (
          <ul
            className="flex flex-wrap gap-3 px-3 pb-3 text-xs text-fg-3"
            aria-label="Scan counters"
          >
            <li className="flex items-center gap-1">
              <Icon icon={CircleCheck} size={12} className="text-tone-done" /> {session.counters.ok}{' '}
              OK
            </li>
            <li className="flex items-center gap-1">
              <Icon icon={TriangleAlert} size={12} className="text-tone-caution" />{' '}
              {session.counters.warning} warnings
            </li>
            <li className="flex items-center gap-1">
              <Icon icon={OctagonX} size={12} className="text-tone-critical" />{' '}
              {session.counters.error} errors
            </li>
          </ul>
        )}
      </div>
      {aside && !compact && (
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface max-xl:border-t max-xl:border-l-0">
          {aside}
        </aside>
      )}
      {camera && (
        <CameraScanner
          open={cameraOpen}
          onOpenChange={(open) => {
            setCameraOpen(open)
            if (!open) inputRef.current?.refocus()
          }}
          onDetected={session.scan}
          latest={latest}
        />
      )}
    </div>
  )

  const focusLayout = Boolean(sessionInfo) || withDock || footer !== undefined
  return (
    <ScanModeContext value={active}>
      {focusLayout ? (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          {sessionInfo && <ScanSessionBar {...sessionInfo} />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {station}
            {footer}
          </div>
          {withDock && (
            <ScanDock
              onUndo={() => session.undoLast()}
              canUndo={canUndoLast(session)}
              onCamera={camera ? () => setCameraOpen(true) : undefined}
              finish={finish}
            />
          )}
        </div>
      ) : (
        station
      )}
    </ScanModeContext>
  )
}
