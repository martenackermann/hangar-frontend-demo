import {
  Camera,
  Check,
  CircleHelp,
  Copy,
  MapPinOff,
  ScanLine,
  Undo2,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import { createContext, use, useId, type MouseEvent, type ReactNode } from 'react'
import { Button, IconButton } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import type { Tone } from '@/lib/api/types'
import { setPrefs, usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { useDocumentTitle } from '@/lib/use-document-title'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { canVibrate, CUE_DESCRIPTIONS, CUE_LEGEND, type ScanCue } from './sound'

/** Scan mode is on: the focus lock holds the scan field (ScanStation provides it). */
export const ScanModeContext = createContext(false)

/** Pointer clicks on station controls keep the focus in the (locked) scan field. */
export function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

/**
 * Session bar of a scan station (DESIGN.md §9.3 focus layout, inside the shell): 52 px graphite
 * band with the scan-mode pill, the session name (the page's h1), its context, progress, the
 * station's actions (the one amber action of the view) and the "Exit · Esc Esc" hint.
 */
export function ScanSessionBar({
  title,
  meta,
  progress,
  actions,
  active: activeProp,
}: {
  /** "Inventory · Hillford Hub" */
  title: string
  /** "#3 · started Mon 12 Oct by Dana Dispatcher" */
  meta?: ReactNode
  /** "57%" */
  progress?: ReactNode
  /** Buttons for the graphite band (`sessionBarButton` styles the secondary ones). */
  actions?: ReactNode
  /** Scan mode (defaults to the enclosing ScanStation's state). */
  active?: boolean
}) {
  useDocumentTitle(title)
  const fromStation = use(ScanModeContext)
  const active = activeProp ?? fromStation
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-rail-line bg-rail pr-3 pl-4 text-rail-fg max-md:gap-2 max-md:pl-3">
      <span
        className={cn(
          'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-semibold whitespace-nowrap max-md:hidden pointer-coarse:hidden',
          active
            ? 'bg-accent text-fg-on-accent'
            : 'text-rail-fg-2 shadow-[inset_0_0_0_1px_var(--hg-rail-active)]',
        )}
        data-testid="scan-mode"
      >
        <Icon icon={ScanLine} size={14} />
        {active ? 'Scan mode' : 'Scan mode paused'}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="truncate text-lg font-semibold tracking-[-0.012em] max-md:text-md">
          {title}
        </h1>
        {meta && <p className="min-w-0 truncate text-xs text-rail-fg-2 max-lg:hidden">{meta}</p>}
      </div>
      {progress && (
        <span className="shrink-0 font-mono text-md font-semibold text-rail-fg">{progress}</span>
      )}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      <span
        className="flex shrink-0 items-center gap-1.5 text-xs text-rail-fg-2 max-md:hidden pointer-coarse:hidden"
        aria-hidden
      >
        {active ? (
          <>
            Exit
            <Kbd tone="rail">Esc</Kbd>
            <Kbd tone="rail">Esc</Kbd>
          </>
        ) : (
          'Click the field to resume'
        )}
      </span>
    </header>
  )
}

/** Secondary/ghost buttons on the graphite session bar (the primary stays amber). */
export const sessionBarButton =
  'border-rail-active bg-transparent text-rail-fg hover:border-rail-fg-3 hover:bg-rail-hover active:bg-rail-active [&_svg]:text-rail-fg-2'

/**
 * Phone bottom dock of a scan station (DESIGN.md §11.3): Undo · **Camera scan** (the amber
 * action) · Finish. 48 px buttons, hidden from 768 px.
 */
export function ScanDock({
  onUndo,
  canUndo,
  onCamera,
  finish,
}: {
  onUndo: () => void
  canUndo: boolean
  onCamera?: (() => void) | undefined
  /** "Finish" (secondary, touch size). */
  finish?: ReactNode
}) {
  return (
    <nav
      aria-label="Scan actions"
      className={cn(
        'grid shrink-0 gap-2 border-t border-line bg-raised px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-bar md:hidden',
        onCamera && finish
          ? 'grid-cols-[1fr_1.4fr_1fr]'
          : onCamera || finish
            ? 'grid-cols-[1fr_1.6fr]'
            : 'grid-cols-1',
      )}
    >
      <Button
        size="touch"
        icon={Undo2}
        onMouseDown={keepFocus}
        onClick={onUndo}
        disabled={!canUndo}
        className="w-full px-2"
      >
        Undo
      </Button>
      {onCamera && (
        <Button
          size="touch"
          variant="primary"
          icon={Camera}
          onClick={onCamera}
          className="w-full px-2"
        >
          Camera scan
        </Button>
      )}
      {finish}
    </nav>
  )
}

/**
 * Sound cue and vibration toggles (constant names, state in `aria-pressed`). F2 toggles sound.
 * Vibration shows on touch devices that can vibrate.
 */
export function ScanCueToggles() {
  const sound = usePrefs((prefs) => prefs.sound)
  const vibration = usePrefs((prefs) => prefs.vibration)
  const coarse = useMediaQuery('(pointer: coarse)')
  useShortcut('f2', () => setPrefs({ sound: !sound }), {
    description: 'Sound cues on/off',
    group: 'Scan station',
    allowInInput: true,
  })
  const size = 'pointer-coarse:size-11 max-md:size-11'
  return (
    <>
      <IconButton
        icon={sound ? Volume2 : VolumeX}
        label="Sound cues"
        aria-pressed={sound}
        shortcut="f2"
        size="sm"
        className={size}
        onMouseDown={keepFocus}
        onClick={() => setPrefs({ sound: !sound })}
      />
      {coarse && canVibrate() && (
        <IconButton
          icon={vibration ? Vibrate : VibrateOff}
          label="Vibration"
          aria-pressed={vibration}
          size="sm"
          className={size}
          onMouseDown={keepFocus}
          onClick={() => setPrefs({ vibration: !vibration })}
        />
      )}
    </>
  )
}

const LEGEND_ICONS: Record<ScanCue, { icon: LucideIcon; tone: Tone }> = {
  ok: { icon: Check, tone: 'done' },
  warn: { icon: MapPinOff, tone: 'caution' },
  error: { icon: CircleHelp, tone: 'critical' },
  duplicate: { icon: Copy, tone: 'caution' },
}

/** "Sound cues" legend for the station aside (DESIGN.md §10): verdict · cue in words. */
export function SoundCueLegend({ className }: { className?: string }) {
  const sound = usePrefs((prefs) => prefs.sound)
  const headingId = useId()
  return (
    <section className={cn('grid gap-2 p-4', className)} aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-xs font-semibold text-fg-2">
          Sound cues
        </h3>
        <span className="text-xs text-fg-3">{sound ? 'On' : 'Off'}</span>
      </div>
      <ul className="grid gap-1.5 text-xs">
        {CUE_LEGEND.map(({ cue, label }) => {
          const { icon, tone } = LEGEND_ICONS[cue]
          return (
            <li key={cue} className="grid grid-cols-[16px_minmax(0,7rem)_minmax(0,1fr)] gap-2">
              <Icon icon={icon} size={14} className={`hg-tone-${tone} mt-px text-(--t)`} />
              <span className="font-medium text-fg">{label}</span>
              <span className="text-fg-2">{CUE_DESCRIPTIONS[cue]}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
