import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { toast as sonner, Toaster as SonnerToaster } from 'sonner'
import type { Tone } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { Icon } from './icon'
import { ariaKeyshortcuts, Kbd } from './kbd'

/**
 * Toasts (DESIGN.md §10): bottom-right, 420 px, overlay surface + dialog shadow. Tone icon ·
 * title (what happened, IDs in mono) · body · action (amber text, e.g. "Undo ⌘Z") · dismiss.
 * 6 s auto-dismiss (errors stay), pauses on hover/focus, max 3 stacked.
 *
 * Announcements: Sonner's container is already a polite live region, so cards carry no live
 * role of their own (nested regions double-announce). Errors are the one exception: a single
 * `role="alert"` so they are announced assertively, once. Alt+T focuses the toasts (Sonner).
 *
 *   notify.success('SR0012377 moved to Ready for picking', { description: '…', action: { label: 'Undo', shortcut: 'mod+z', onClick } })
 *   notify.error('Appointment sync failed', { description: 'The booking provider did not answer.' })
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      visibleToasts={3}
      duration={6000}
      gap={8}
      offset={16}
      mobileOffset={12}
      toastOptions={{ unstyled: true, className: 'w-full' }}
      style={{ zIndex: 50 }}
    />
  )
}

export interface NotifyOptions {
  description?: ReactNode
  action?: { label: string; onClick: () => void; shortcut?: string }
  /** Milliseconds; errors default to persistent. */
  duration?: number
  id?: string | number
}

const TONE_ICONS: Record<
  'success' | 'error' | 'warning' | 'info' | 'loading',
  { icon: LucideIcon; tone: Tone | null }
> = {
  success: { icon: CircleCheck, tone: 'done' },
  error: { icon: OctagonX, tone: 'critical' },
  warning: { icon: TriangleAlert, tone: 'caution' },
  info: { icon: Info, tone: null },
  loading: { icon: LoaderCircle, tone: 'outreach' },
}

type Kind = keyof typeof TONE_ICONS

function ToastCard({
  id,
  kind,
  title,
  options,
  icon,
}: {
  id: string | number
  kind: Kind
  title: ReactNode
  options: NotifyOptions
  icon?: LucideIcon
}) {
  const { icon: defaultIcon, tone } = TONE_ICONS[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={cn(
        'grid w-[420px] max-w-[calc(100vw-24px)] grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-md border border-line bg-overlay py-2.5 pr-2.5 pl-3 text-sm text-fg shadow-dialog',
        tone && `hg-tone-${tone}`,
      )}
    >
      <Icon
        icon={icon ?? defaultIcon}
        className={cn(
          'mt-0.5',
          tone ? 'text-(--t)' : 'text-fg-2',
          kind === 'loading' && 'animate-spin motion-reduce:animate-none',
        )}
      />
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {options.description && (
          <div className="mt-0.5 text-xs text-fg-3">{options.description}</div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {options.action && (
          <button
            type="button"
            onClick={() => {
              options.action?.onClick()
              sonner.dismiss(id)
            }}
            aria-keyshortcuts={ariaKeyshortcuts(options.action.shortcut)}
            className="inline-flex h-6 items-center gap-1.5 rounded-xs px-1.5 font-semibold text-accent-text hover:bg-hover"
          >
            {options.action.label}
            {options.action.shortcut && <Kbd keys={options.action.shortcut} hint />}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => sonner.dismiss(id)}
          className="grid size-6 place-items-center rounded-xs text-fg-3 hover:bg-hover hover:text-fg"
        >
          <Icon icon={X} size={14} />
        </button>
      </div>
    </div>
  )
}

function show(kind: Kind, title: ReactNode, options: NotifyOptions = {}, icon?: LucideIcon) {
  const duration =
    options.duration ?? (kind === 'error' ? Infinity : kind === 'loading' ? Infinity : 6000)
  return sonner.custom(
    (id) => <ToastCard id={id} kind={kind} title={title} options={options} icon={icon} />,
    {
      duration,
      id: options.id,
    },
  )
}

export const notify = {
  success: (title: ReactNode, options?: NotifyOptions) => show('success', title, options),
  error: (title: ReactNode, options?: NotifyOptions) => show('error', title, options),
  warning: (title: ReactNode, options?: NotifyOptions) => show('warning', title, options),
  info: (title: ReactNode, options?: NotifyOptions) => show('info', title, options),
  /** Persistent until replaced (pass the same `id`) or dismissed. */
  loading: (title: ReactNode, options?: NotifyOptions) => show('loading', title, options),
  /** Custom icon (e.g. a status icon). */
  custom: (title: ReactNode, icon: LucideIcon, options?: NotifyOptions) =>
    show('info', title, options, icon),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}

export { CircleAlert as ToastAlertIcon }
