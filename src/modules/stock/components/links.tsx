import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Link into another slice's screen with search params (`/service-requests?status=escalated`).
 * Those routes declare their own search schemas, so the target is typed loosely here.
 */
export function ScreenLink({
  to,
  search,
  children,
  className,
}: {
  to: string
  search?: Record<string, string | number | boolean | undefined>
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className={cn(
        'hover:underline focus-visible:outline-2 focus-visible:outline-focus',
        className,
      )}
    >
      {children}
    </Link>
  )
}
