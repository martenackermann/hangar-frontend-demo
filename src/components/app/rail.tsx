import { Link, useRouterState } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { useEnums, enumLabel } from '@/lib/enums'
import { useMe } from '@/lib/auth/store'
import type { NavEntry } from '@/lib/nav/types'
import { useNavigation } from '@/lib/nav/use-navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'

export function isEntryActive(entry: NavEntry, pathname: string): boolean {
  return pathname === entry.to || pathname.startsWith(`${entry.to}/`)
}

/**
 * The graphite rail (DESIGN.md §2.5, §9.1): 232 px expanded / 56 px collapsed (`[`). Groups and
 * items from every module's nav.ts filtered by `/me.permissions`; active item = rail-active fill
 * + amber icon; current user at the bottom; collapse toggle.
 */
export function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { groups } = useNavigation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const me = useMe()
  const enums = useEnums()
  // Keep the current page's entry in view (the admin group sits below the fold on short screens).
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [pathname, collapsed])

  return (
    <nav
      aria-label="Main"
      className={cn(
        'z-20 flex min-h-0 flex-col border-r border-rail-line bg-rail text-rail-fg-2',
        collapsed ? 'w-rail-collapsed' : 'w-rail',
      )}
    >
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center gap-2.5 border-b border-rail-line',
          collapsed ? 'justify-center' : 'pr-3 pl-4',
        )}
      >
        <Logo />
        {!collapsed && (
          <div className="grid min-w-0 leading-[1.1]">
            <b className="text-[14px] font-[650] tracking-[-0.01em] text-rail-fg">Hangar</b>
            <span className="truncate text-2xs text-rail-fg-3">Globex Fleet AG rollout</span>
          </div>
        )}
      </div>
      <div ref={scrollRef} className="hg-rail-scroll min-h-0 flex-1 overflow-y-auto pt-1 pb-3">
        {groups.map((group, index) => (
          <div key={group.id} role="group" aria-label={group.label}>
            {collapsed ? (
              index > 0 && <div className="mx-3.5 my-2.5 h-px bg-rail-line" aria-hidden />
            ) : (
              <p className="px-5 pt-3.5 pb-1 text-2xs leading-4 font-medium text-rail-fg-3">
                {group.label}
              </p>
            )}
            <ul>
              {group.entries.map((entry) => {
                const active = isEntryActive(entry, pathname)
                const link = (
                  <Link
                    to={entry.to}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? entry.label : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-sm whitespace-nowrap transition-colors duration-[var(--hg-dur-instant)]',
                      'hover:bg-rail-hover hover:text-rail-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                      collapsed ? 'mx-auto my-0.5 h-8 w-10 justify-center' : 'mx-2 h-7 pr-2 pl-3',
                      active && 'bg-rail-active font-medium text-rail-fg',
                    )}
                  >
                    <Icon icon={entry.icon} className={active ? 'text-accent' : 'text-rail-fg-3'} />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{entry.label}</span>}
                  </Link>
                )
                return (
                  <li key={entry.id}>
                    {collapsed ? (
                      <Tooltip content={entry.label} shortcut={entry.shortcut} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div
        className={cn(
          'flex shrink-0 flex-col gap-1 border-t border-rail-line p-2',
          collapsed && 'items-center',
        )}
      >
        {me && !collapsed && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-rail-fg">{me.displayName}</span>
            <span className="rounded-2xs bg-rail-active px-1 text-2xs font-semibold text-rail-fg-2">
              {enumLabel(enums, 'role', me.role)}
            </span>
          </div>
        )}
        <Tooltip
          content={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          shortcut="["
          side="right"
        >
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-7 items-center gap-2.5 rounded-sm text-rail-fg-2 hover:bg-rail-hover hover:text-rail-fg focus-visible:outline-2 focus-visible:outline-focus',
              collapsed ? 'w-10 justify-center' : 'px-3',
            )}
          >
            <Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} className="text-rail-fg-3" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Collapse</span>
                <Kbd tone="rail">[</Kbd>
              </>
            )}
          </button>
        </Tooltip>
      </div>
    </nav>
  )
}
