import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon, type IconSize } from './icon'

/**
 * Spinning loader (replaces a leading icon while loading; labels never jump). Under reduced
 * motion it stands still: the loader glyph plus the caller's text or `aria-busy` carry the state.
 */
export function Spinner({
  size = 14,
  className,
  label,
}: {
  size?: IconSize
  className?: string
  label?: string
}) {
  return (
    <Icon
      icon={LoaderCircle}
      size={size}
      className={cn('animate-spin motion-reduce:animate-none', className)}
      {...(label ? { 'aria-label': label, role: 'status' } : {})}
    />
  )
}
