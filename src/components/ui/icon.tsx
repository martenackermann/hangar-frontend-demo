import type { LucideIcon, LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Size/stroke pairs of DESIGN.md §8. */
const STROKES: Record<number, number> = {
  12: 2.25,
  14: 2,
  16: 1.75,
  18: 1.75,
  20: 1.75,
  24: 1.75,
  32: 1.75,
}

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 32

export interface IconProps extends Omit<LucideProps, 'size' | 'ref'> {
  icon: LucideIcon
  size?: IconSize
}

/**
 * Lucide icon with the design system's size/stroke pairs. Decorative by default
 * (`aria-hidden`); pass `aria-label` for meaningful standalone icons.
 */
export function Icon({ icon: Glyph, size = 16, className, ...props }: IconProps) {
  const labelled = props['aria-label'] !== undefined
  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={STROKES[size] ?? 1.75}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={cn('inline-block shrink-0 align-middle', className)}
      {...props}
    />
  )
}
