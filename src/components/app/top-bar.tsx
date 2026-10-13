import { useQuery } from '@tanstack/react-query'
import { Link, useMatches, useRouterState } from '@tanstack/react-router'
import {
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  Keyboard,
  LoaderCircle,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { api } from '@/lib/api/client'
import { coreQueries, useAppConfig } from '@/lib/api/core'
import type { SyncState } from '@/lib/api/types'
import { useCan, useMe } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatRelative, formatTime } from '@/lib/format'
import { NAV_GROUPS } from '@/lib/nav/types'
import { useNavigation } from '@/lib/nav/use-navigation'
import { toggleTheme, usePrefs } from '@/lib/prefs/store'
import { isMac } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/use-now'
import { openCommandPalette, setNavSheetOpen, setShortcutsOpen } from './command-palette-store'
import { AccountMenuItems } from './account-menu'
import { PersonaSwitcher } from './persona-switcher'
import { isEntryActive } from './rail'

function Breadcrumbs() {
  const { entries } = useNavigation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const title = useMatches({
    select: (matches) =>
      [...matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  })
  const entry = entries.find((e) => isEntryActive(e, pathname))
  const group = NAV_GROUPS.find((g) => g.id === entry?.group)
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap text-fg-3 max-md:hidden"
    >
      {group && (
        <>
          <span>{group.label}</span>
          <Icon icon={ChevronRight} size={12} />
        </>
      )}
      <span aria-current="page" className="max-w-[32ch] truncate font-medium text-fg">
        {title ?? entry?.label ?? 'Hangar'}
      </span>
    </nav>
  )
}

function SyncIndicator() {
  const canRead = useCan('appointments.read')
  const { data, isError } = useQuery({
    queryKey: ['appointments', 'sync-state'],
    queryFn: ({ signal }) => api.get<SyncState>('/appointments/sync-state', { signal }),
    enabled: canRead,
    refetchInterval: 60_000,
    retry: false,
    meta: { errorToast: false },
  })
  const now = useNow(60_000)
  if (!canRead || isError || !data) return null
  const last = data.lastIncrementalSyncAt ?? data.lastFullSyncAt
  const stale = last ? now - Date.parse(last) > 2 * 3_600_000 : true
  // DESIGN §3.4: synced → "Synced 09:12" (quiet); stale (> 2 h) → "Sync overdue" (caution, with
  // an icon and words at every width — never colour alone).
  const text = data.running
    ? 'Syncing appointments…'
    : !last
      ? 'Appointments never synced'
      : stale
        ? `Sync overdue · last ${formatTime(last)}`
        : `Appointments synced ${formatTime(last)}`
  return (
    <Tooltip
      content={last ? `Last appointment sync ${formatRelative(last)}` : 'Appointments never synced'}
    >
      <Link
        to="/field/tour-planner"
        search={{ panel: 'sync' } as never}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs whitespace-nowrap hover:bg-hover',
          stale && !data.running ? 'font-medium text-tone-caution-fg' : 'text-fg-3',
        )}
      >
        <Icon
          icon={data.running ? LoaderCircle : stale ? TriangleAlert : RefreshCw}
          size={14}
          className={cn(data.running && 'animate-spin motion-reduce:animate-none')}
        />
        {/* short label below 1440 px; the full sentence stays available to screen readers */}
        <span className="max-[1439px]:sr-only">{text}</span>
        <span aria-hidden className="min-[1440px]:hidden">
          {data.running ? 'Syncing…' : stale ? 'Sync overdue' : last ? formatTime(last) : 'Never'}
        </span>
      </Link>
    </Tooltip>
  )
}

function JobsIndicator() {
  const { data } = useQuery(coreQueries.runningJobs())
  const enums = useEnums()
  const jobs = data?.data ?? []
  if (jobs.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${jobs.length} running jobs`}
        className="flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs text-tone-outreach-fg hover:bg-hover"
      >
        <Icon icon={LoaderCircle} size={14} className="animate-spin" />
        {jobs.length}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="px-2 pt-1 pb-1.5 text-2xs font-medium text-fg-3">Running jobs</p>
        <ul className="grid gap-1">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-2 rounded-xs px-2 py-1"
            >
              <span>{enumLabel(enums, 'jobKind', job.kind)}</span>
              <span className="font-mono text-xs text-fg-3">
                {job.progress.percent !== null
                  ? `${Math.round(job.progress.percent)} %`
                  : job.status}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu() {
  const me = useMe()
  const enums = useEnums()
  if (!me) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${me.displayName}: account menu`}
        className="grid size-7 place-items-center rounded-sm text-fg-2 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:size-11"
      >
        <Icon icon={CircleUserRound} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="grid gap-0.5 px-2 py-1.5">
          <span className="font-medium">{me.displayName}</span>
          <span className="text-xs text-fg-3">{me.email}</span>
          <span className="text-xs text-fg-3">
            {enumLabel(enums, 'role', me.role)}
            {me.homeSite ? ` · ${me.homeSite.name}` : ''}
          </span>
        </div>
        <DropdownMenuSeparator />
        <AccountMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Top bar (DESIGN.md §9.1, SCREENS.md §1.1): breadcrumbs · ⌘K trigger (styled as a search field,
 * it is not an input) · appointment sync · running jobs · demo badge (+ Mailpit) · theme ·
 * shortcuts · persona switcher · user menu. Phones: menu button + search + persona.
 */
export function TopBar() {
  const config = useAppConfig()
  const theme = usePrefs((prefs) => prefs.theme)
  const showingLight =
    theme === 'light' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: light)').matches)
  return (
    <header className="flex h-topbar min-w-0 items-center gap-3 border-b border-line bg-canvas pr-3 pl-4 max-md:gap-1.5 max-md:px-2">
      <IconButton
        icon={Menu}
        label="Open navigation"
        className="md:hidden"
        onClick={() => setNavSheetOpen(true)}
      />
      <Breadcrumbs />
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label={`Search or scan (${isMac ? '⌘K' : 'Ctrl+K'})`}
        className="ml-3 flex h-7 w-[340px] max-w-[34vw] items-center gap-2 rounded-sm border border-line bg-sunken pr-1 pl-2 text-left text-fg-3 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-focus max-[1439px]:w-[280px] max-md:ml-0 max-md:w-auto max-md:max-w-none max-md:flex-1"
      >
        <Icon icon={Search} size={14} />
        <span className="min-w-0 flex-1 truncate">Search or scan…</span>
        <Kbd keys="mod+k" className="max-md:hidden" />
      </button>
      <div className="flex-1 max-md:hidden" />
      <div className="flex items-center gap-1 max-md:hidden">
        <SyncIndicator />
        <JobsIndicator />
        {config?.demoMode && (
          <span className="flex items-center gap-1.5 rounded-xs px-1.5 text-2xs whitespace-nowrap text-fg-3 max-xl:hidden">
            Demo data · fake integrations
            {config.mailpitUrl && (
              <a
                href={config.mailpitUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-accent-text hover:underline"
              >
                Mailpit <Icon icon={ExternalLink} size={12} />
              </a>
            )}
          </span>
        )}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <IconButton
          icon={theme === 'system' ? Monitor : showingLight ? Moon : Sun}
          label={showingLight ? 'Dark theme' : 'Light theme'}
          shortcut="t"
          onClick={toggleTheme}
        />
        <IconButton
          icon={Keyboard}
          label="Keyboard shortcuts"
          shortcut="?"
          onClick={() => setShortcutsOpen(true)}
        />
      </div>
      {/* the demo's persona pill carries the account menu; no second account button */}
      {config?.demoMode ? <PersonaSwitcher /> : <UserMenu />}
    </header>
  )
}
