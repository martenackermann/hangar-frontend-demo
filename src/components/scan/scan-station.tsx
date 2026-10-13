import {
  Camera,
  CircleCheck,
  OctagonX,
  TriangleAlert,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconButton } from '@/components/ui/button'
import { Banner } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import type { ScanResult } from '@/lib/api/types'
import { setPrefs, usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { CameraScanner } from './camera-scanner'
import { ScanInput, type ScanInputHandle } from './scan-input'
import { ScanList, type ScanEntry } from './scan-list'
import { useScanSession } from './use-scan-session'
import { VerdictBanner } from './verdict-banner'
import { VERDICT_STYLES } from './verdict'

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
  placeholder?: string
  className?: string
}

/**
 * ScanStation (SCREENS.md §10, DESIGN.md §9.3): focus-locked ScanInput → context line → verdict
 * banner → running list (+ optional progress aside). Enter submits; scans queue FIFO (max 20)
 * while a request is in flight; same value within 800 ms is a bounce. Shortcuts: Esc clears,
 * Esc Esc releases focus, ⌘Z/Ctrl+Z undoes the last undoable scan, F2 sound, F3 camera.
 * Offline: the field is disabled with "Offline — scanning needs a connection."
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
  placeholder,
  className,
}: ScanStationProps<T>) {
  const online = useOnline()
  const sound = usePrefs((prefs) => prefs.sound)
  const inputRef = useRef<ScanInputHandle>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const session = useScanSession<T>({ submit, onResult, onUndone, initialEntries })

  useShortcut('mod+z', () => session.undoLast(), {
    description: 'Undo last scan',
    group: 'Scan station',
    allowInInput: true,
  })
  useShortcut('f2', () => setPrefs({ sound: !sound }), {
    description: 'Sound on/off',
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

  const tools = (
    <>
      <IconButton
        icon={sound ? Volume2 : VolumeX}
        label={sound ? 'Sound on' : 'Sound off'}
        shortcut="f2"
        size="sm"
        onClick={() => setPrefs({ sound: !sound })}
      />
      {camera && (
        <Button
          size="sm"
          icon={Camera}
          onClick={() => setCameraOpen(true)}
          shortcut="f3"
          className="max-md:hidden"
        >
          Camera
        </Button>
      )}
    </>
  )

  return (
    <div
      className={cn(
        'grid min-h-0',
        aside && !compact && 'grid-cols-[minmax(0,1fr)_360px] max-xl:grid-cols-1',
        className,
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className={cn('grid gap-3', compact ? 'p-3' : 'p-6 max-md:p-3')}>
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
          />
          {(context ?? session.pending > 0) && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
              {context}
              {session.pending > 0 && (
                <span className="ml-auto text-xs text-fg-3" aria-live="polite">
                  {session.pending} scan{session.pending === 1 ? '' : 's'} being checked
                </span>
              )}
            </div>
          )}
          {latest?.state === 'failed' ? (
            <Banner tone="critical" icon={OctagonX} title={`Scan #${latest.sequence} not checked`}>
              {latest.error} {latest.value}
            </Banner>
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
            />
          ) : null}
        </div>
        {!compact && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface">
            <ScanList
              entries={session.entries}
              describe={describe}
              onUndo={(entry) => void session.undo(entry)}
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
            if (!open) inputRef.current?.focus()
          }}
          onDetected={session.scan}
          flashTone={latestResult ? VERDICT_STYLES[latestResult.verdict].tone : null}
        />
      )}
    </div>
  )
}
