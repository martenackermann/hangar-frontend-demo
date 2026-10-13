import type { LucideIcon } from 'lucide-react'
import { Tabs as RadixTabs } from 'radix-ui'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './icon'

/**
 * Tabs (DESIGN.md §10): 36 px, 13/500 fg-3 → fg when selected, 2 px amber underline, optional
 * count pill (critical wash for alert counts); overflow scrolls horizontally.
 * Use `activationMode="manual"` in drawers so arrowing does not load panels.
 */
export const Tabs = RadixTabs.Root
export const TabsContent = RadixTabs.Content

export function TabsList({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'hg-no-scrollbar flex items-stretch gap-0.5 overflow-x-auto border-b border-line',
        className,
      )}
      {...props}
    >
      {children}
    </RadixTabs.List>
  )
}

export function tabClassName(className?: string): string {
  return cn(
    '-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 font-medium whitespace-nowrap text-fg-3',
    'hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
    'aria-selected:border-accent aria-selected:text-fg data-[state=active]:border-accent data-[state=active]:text-fg',
    'aria-[current=page]:border-accent aria-[current=page]:text-fg',
    className,
  )
}

export function TabCount({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-xs px-[5px] font-mono text-2xs leading-4',
        alert ? 'bg-tone-critical-wash text-tone-critical-fg' : 'bg-pressed text-fg-3',
      )}
    >
      {children}
    </span>
  )
}

export function TabsTrigger({
  className,
  children,
  icon,
  count,
  alert,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & {
  icon?: LucideIcon
  count?: ReactNode
  alert?: boolean
}) {
  return (
    <RadixTabs.Trigger className={tabClassName(className)} {...props}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
      {count !== undefined && count !== null && <TabCount alert={alert}>{count}</TabCount>}
    </RadixTabs.Trigger>
  )
}
