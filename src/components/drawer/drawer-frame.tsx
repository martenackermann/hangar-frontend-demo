import { ChevronDown, ChevronUp, Link2, X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from '@/components/data-table/data-table'
import { IconButton } from '@/components/ui/button'
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notify } from '@/components/ui/toast'
import { formatNumber } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

const WIDTH_KEY = 'hangar.drawer.width'
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const MIN_WIDTH = 400
const MAX_WIDTH = 720

function readWidth(): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(WIDTH_KEY))
    return value >= MIN_WIDTH && value <= MAX_WIDTH ? value : 480
  } catch {
    return 480
  }
}

export interface DrawerNav {
  position: number
  total: number
  onPrev?: (() => void) | undefined
  onNext?: (() => void) | undefined
}

/**
 * Detail drawer frame (DESIGN.md §10 Drawer): bar (prev/next K/J, "6 of 318", copy link, close
 * Esc) → head → optional next-step block → tabs → scrolling body.
 * Modes: docked split view ≥ 1280 px (480 px, resizable 400–720, remembered; the table stays
 * interactive) · non-modal overlay < 1280 · full-screen modal sheet < 768.
 */
export function DrawerFrame({
  label,
  onClose,
  nav,
  head,
  nextStep,
  children,
}: {
  /** Accessible name ("Service request SR0012388"). */
  label: string
  onClose: () => void
  nav?: DrawerNav | undefined
  head?: ReactNode
  nextStep?: ReactNode
  children: ReactNode
}) {
  const isPhone = useMediaQuery('(max-width: 767px)')
  const docked = useMediaQuery('(min-width: 1280px)')
  const [width, setWidth] = useState(readWidth)
  const dragging = useRef(false)

  useShortcut('escape', onClose, { description: 'Close drawer', group: 'Drawer' })
  useShortcut('k', () => nav?.onPrev?.(), {
    enabled: Boolean(nav?.onPrev),
    description: 'Previous record',
    group: 'Drawer',
  })
  useShortcut('j', () => nav?.onNext?.(), {
    enabled: Boolean(nav?.onNext),
    description: 'Next record',
    group: 'Drawer',
  })

  const onResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])
  const onResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - event.clientX))
    setWidth(next)
  }, [])
  const onResizeEnd = useCallback(() => {
    dragging.current = false
    try {
      globalThis.localStorage?.setItem(WIDTH_KEY, String(width))
    } catch {
      // ignore
    }
  }, [width])

  const bar = (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-line-subtle pr-2 pl-3">
      <div className="flex items-center gap-0.5">
        {nav && (
          <>
            <IconButton
              icon={ChevronUp}
              label="Previous record"
              shortcut="k"
              size="sm"
              disabled={!nav.onPrev}
              onClick={nav.onPrev}
            />
            <IconButton
              icon={ChevronDown}
              label="Next record"
              shortcut="j"
              size="sm"
              disabled={!nav.onNext}
              onClick={nav.onNext}
            />
            <span className="ml-1.5 text-xs text-fg-3">
              {formatNumber(nav.position)} of {formatNumber(nav.total)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={Link2}
          label="Copy link"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(window.location.href)
              .then(() => notify.success('Link copied', { duration: 2000 }))
          }}
        />
        <IconButton icon={X} label="Close" shortcut="escape" size="sm" onClick={onClose} />
      </div>
    </div>
  )

  const content = (
    <>
      {bar}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {head && <div className="grid shrink-0 gap-2 px-4 pt-3.5 pb-3">{head}</div>}
        {nextStep && <div className="shrink-0 px-4 pb-3">{nextStep}</div>}
        {children}
      </div>
    </>
  )

  if (isPhone) {
    return (
      <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
        <RadixDialog.Portal>
          <RadixDialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-[60] flex flex-col bg-raised text-fg outline-none"
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
            {content}
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    )
  }

  return (
    <aside
      aria-label={label}
      style={{ width }}
      className={cn(
        'z-30 flex min-h-0 flex-col border-l border-line bg-raised shadow-drawer',
        docked
          ? 'relative shrink-0'
          : 'absolute inset-y-0 right-0 max-w-full animate-slide-in-right',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize drawer"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-[color-mix(in_srgb,var(--hg-line-strong)_40%,transparent)]"
      />
      {content}
    </aside>
  )
}

export interface DrawerTab {
  id: string
  label: string
  count?: number | null | undefined
  content: ReactNode
}

/** Drawer tabs: `1`–`9` jump, `activationMode="manual"`, value bound to `?tab=`. */
export function DrawerTabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: readonly DrawerTab[]
  value: string | undefined
  onValueChange: (tab: string) => void
}) {
  const active = tabs.find((tab) => tab.id === value)?.id ?? tabs[0]?.id
  useShortcut(
    DIGITS,
    (event) => {
      const tab = tabs[Number(event.key) - 1]
      if (tab) onValueChange(tab.id)
    },
    { enabled: tabs.length > 1, description: 'Switch tab (1–9)', group: 'Drawer' },
  )
  if (!active) return null
  return (
    <Tabs
      value={active}
      onValueChange={onValueChange}
      activationMode="manual"
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className="sticky top-0 z-[1] shrink-0 bg-raised px-2">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="px-1.5">
            {tab.label}
            {tab.count !== undefined && tab.count !== null && <TabCount>{tab.count}</TabCount>}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="px-4 pt-3.5 pb-6 outline-none">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
