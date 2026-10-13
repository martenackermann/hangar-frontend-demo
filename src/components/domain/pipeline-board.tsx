import { ArrowRight, Timer } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Icon } from '@/components/ui/icon'
import type { Tone } from '@/lib/api/types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * PipelineBoard primitives (DESIGN.md §10). H1 composes the board; these give it the Line,
 * column headers with aging bars, cards and keyboard navigation:
 *
 *   <PipelineBoard>                                   // ←→ column, ↑↓ card, Enter opens
 *     <PipelineColumn header={<ColumnHeader … />}>    // role="list"
 *       <PipelineCard …>…</PipelineCard>             // role="listitem", roving tabindex
 *     </PipelineColumn>
 *     <PipelineColumn collapsed …/>                   // the Closed summary column
 *   </PipelineBoard>
 *
 * No drag-and-drop between columns (transitions run side effects).
 */
export function PipelineBoard({
  children,
  className,
  label = 'Pipeline',
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.matches('[data-board-card]')) return
    const columns = [...(ref.current?.querySelectorAll<HTMLElement>('[data-board-column]') ?? [])]
    const column = target.closest<HTMLElement>('[data-board-column]')
    if (!column) return
    const cards = [...column.querySelectorAll<HTMLElement>('[data-board-card]')]
    const index = cards.indexOf(target)
    const colIndex = columns.indexOf(column)
    let next: HTMLElement | undefined
    if (event.key === 'ArrowDown') next = cards[index + 1]
    else if (event.key === 'ArrowUp') next = cards[index - 1]
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const step = event.key === 'ArrowRight' ? 1 : -1
      for (let c = colIndex + step; c >= 0 && c < columns.length; c += step) {
        const targetCards = columns[c]?.querySelectorAll<HTMLElement>('[data-board-card]')
        if (targetCards?.length) {
          next = targetCards[Math.min(index, targetCards.length - 1)]
          break
        }
      }
    } else return
    if (next) {
      event.preventDefault()
      for (const card of ref.current?.querySelectorAll<HTMLElement>('[data-board-card]') ?? []) {
        card.tabIndex = card === next ? 0 : -1
      }
      next.focus()
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [])

  return (
    // Arrow keys bubble up from the focused card (roving tabindex); the region is not focusable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      role="region"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'grid min-h-full grid-cols-[repeat(7,minmax(172px,1fr))_136px] max-md:snap-x max-md:snap-mandatory max-md:grid-cols-[repeat(7,276px)_160px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PipelineColumn({
  header,
  children,
  label,
  className,
}: {
  header: ReactNode
  children?: ReactNode
  /** Accessible name of the card list ("Invited, 486 requests"). */
  label: string
  className?: string
}) {
  return (
    <section
      data-board-column
      aria-label={label}
      className={cn(
        'flex min-w-0 snap-start flex-col border-r border-line-subtle last:border-r-0',
        className,
      )}
    >
      <div className="sticky top-0 z-[2] border-b border-line bg-surface px-3 pt-2 pb-2.5">
        {header}
      </div>
      <div role="group" aria-label={label} className="flex flex-col gap-1.5 p-2">
        {children}
      </div>
    </section>
  )
}

export interface AgingSplit {
  onTime: number
  aging: number
  overdue: number
}

/**
 * Column header: the Line row (station node in the stage tone, flow chip `→ 37` = moved on in
 * the last 24 h) · stage name + menu · count + "31 overdue" / "12 aging" · aging bar.
 */
export function ColumnHeader({
  title,
  tone,
  count,
  flow,
  aging,
  first,
  menu,
}: {
  title: string
  tone: Tone
  count: number
  /** Moved on in the last 24 h. */
  flow?: number
  aging?: AgingSplit
  first?: boolean
  menu?: ReactNode
}) {
  const total = aging ? aging.onTime + aging.aging + aging.overdue : 0
  return (
    <div className={`hg-tone-${tone}`}>
      <div className="relative -mx-3 mb-1.5 h-5" aria-hidden>
        <span
          className={cn(
            'absolute top-[9px] right-0 h-0.5 bg-line-strong',
            first ? 'left-[17px]' : 'left-0',
          )}
        />
        <span className="absolute top-[5px] left-3 size-2.5 rounded-full bg-(--t) shadow-[0_0_0_3px_var(--hg-surface)]" />
        {flow !== undefined && (
          <span className="absolute top-px left-[calc(50%+6px)] inline-flex h-[18px] -translate-x-1/2 items-center gap-0.5 rounded-xs bg-surface pr-[5px] pl-[3px] font-mono text-[11px] text-fg-2 shadow-[inset_0_0_0_1px_var(--hg-line)]">
            <Icon icon={ArrowRight} size={12} className="text-fg-3" />
            {flow}
          </span>
        )}
      </div>
      <div className="flex h-5 items-center justify-between">
        <h2 className="truncate text-xs font-semibold text-fg-2">{title}</h2>
        {menu}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 text-xs whitespace-nowrap">
        <span className="text-[22px] leading-7 font-semibold tracking-[-0.012em] text-fg [font-stretch:87.5%] [font-variant-numeric:proportional-nums]">
          {formatNumber(count)}
        </span>
        {aging && aging.overdue > 0 ? (
          <span className="inline-flex items-center gap-[3px] font-semibold text-tone-critical-fg">
            <Icon icon={Timer} size={12} />
            {aging.overdue} overdue
          </span>
        ) : aging && aging.aging > 0 ? (
          <span className="font-medium text-tone-caution-fg">{aging.aging} aging</span>
        ) : null}
      </div>
      {aging && total > 0 && (
        <div
          className="mt-1.5 flex h-1 gap-0.5"
          role="img"
          aria-label={`${aging.onTime} on time, ${aging.aging} aging, ${aging.overdue} overdue`}
        >
          {aging.onTime > 0 && (
            <span
              className="rounded-[1px] bg-[color-mix(in_srgb,var(--hg-fg-3)_45%,transparent)]"
              style={{ flex: aging.onTime }}
            />
          )}
          {aging.aging > 0 && (
            <span
              className="min-w-0.5 rounded-[1px] bg-tone-caution"
              style={{ flex: aging.aging }}
            />
          )}
          {aging.overdue > 0 && (
            <span
              className="min-w-0.5 rounded-[1px] bg-tone-critical"
              style={{ flex: aging.overdue }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export interface PipelineCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Open in the drawer (`aria-current`). */
  selected?: boolean
  /** Just changed stage: 1.6 s amber-wash fade. */
  fresh?: boolean
  /** First card of the board gets tabIndex 0 (roving tabindex). */
  initialFocus?: boolean
  onOpen?: () => void
}

/**
 * Card shell (raised, hairline, radius 4, 7–9 px padding). Content is composed by the slice:
 * top row (SR number, editor, aging) · name · device type · region + flags · footer.
 */
export const PipelineCard = forwardRef<HTMLDivElement, PipelineCardProps>(function PipelineCard(
  { selected, fresh, initialFocus, onOpen, className, children, onKeyDown, onClick, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="button"
      data-board-card
      tabIndex={initialFocus ? 0 : -1}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        onClick?.(event)
        onOpen?.()
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen?.()
        }
      }}
      className={cn(
        'grid min-w-0 cursor-pointer gap-px rounded-sm border border-line bg-raised px-[9px] pt-[7px] pb-2 outline-none',
        'transition-[border-color,background-color] duration-[var(--hg-dur-instant)] hover:border-line-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        selected && 'border-accent-line bg-accent-wash shadow-[0_0_0_1px_var(--hg-accent-line)]',
        fresh && 'animate-fresh',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})

/** Card footer row (hairline above). */
export function PipelineCardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[5px] flex flex-wrap gap-x-2 gap-y-1 border-t border-line-subtle pt-1.5 text-xs text-fg-2">
      {children}
    </div>
  )
}
