import type { ReactNode } from 'react'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'

/**
 * Page scaffolding (DESIGN.md §9.1): PAGE HEAD (title · meta · actions, one amber primary) →
 * optional views/toolbar → content. Pages fill the shell's content area; tables scroll inside.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-full min-h-0 min-w-0 flex-col', className)}>{children}</div>
}

export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: string
  /** "1,284 open · Globex Fleet AG" */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  useDocumentTitle(title)
  return (
    <header
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-3 px-4 pt-3.5 pb-3 max-md:px-3',
        className,
      )}
    >
      <h1 className="text-xl font-semibold tracking-[-0.012em] whitespace-nowrap">{title}</h1>
      {meta && <p className="min-w-0 truncate text-fg-3">{meta}</p>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Hairline toolbar band (filters scope everything below). */
export function Toolbar({
  children,
  end,
  className,
}: {
  children: ReactNode
  end?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 border-y border-line bg-surface px-4 py-2 max-md:flex-wrap max-md:px-3',
        className,
      )}
    >
      {children}
      {end && <div className="ml-auto flex items-center gap-2 max-md:hidden">{end}</div>}
    </div>
  )
}

/** Content panel with a surface background (forms max 880 px per SCREENS.md §1.1). */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-sm border border-line bg-surface', className)}>
      {(title ?? actions) && (
        <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Key/value grid used in drawers and detail panels. */
export function KeyValues({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <dl
      className={cn(
        'grid gap-x-4 gap-y-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2 max-md:grid-cols-1',
        columns === 3 && 'grid-cols-3 max-md:grid-cols-1',
      )}
    >
      {children}
    </dl>
  )
}

/** One key/value pair; an empty value renders a muted "—" (read as "Not set"). */
export function KeyValue({
  label,
  children,
  full,
}: {
  label: ReactNode
  children: ReactNode
  full?: boolean
}) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className={cn('grid min-w-0 content-start gap-0.5', full && 'col-span-full')}>
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className={cn('min-w-0 break-words', empty ? 'text-fg-3' : 'text-fg')}>
        {empty ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Not set</span>
          </>
        ) : (
          children
        )}
      </dd>
    </div>
  )
}

/** Section heading inside a drawer/panel body (hairline above). */
export function SectionHeading({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mt-4 mb-2 flex items-center gap-2 border-t border-line-subtle pt-3.5 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-fg-2">{children}</h3>
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  )
}
