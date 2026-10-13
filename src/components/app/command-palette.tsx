import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Command } from 'cmdk'
import {
  CalendarClock,
  Clock,
  CornerDownLeft,
  Keyboard,
  Laptop,
  LogOut,
  MapPin,
  Moon,
  RotateCcw,
  Rows3,
  Search,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IdInk } from '@/components/domain/status'
import { statusIcon } from '@/components/domain/status-meta'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { coreQueries, useAppConfig } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { JobAccepted, SearchHit, SearchKind, SearchResponse } from '@/lib/api/types'
import { homePathFor } from '@/lib/auth/guards'
import { logout, personaLogin } from '@/lib/auth/session'
import { useCan, useMe, usePermissions } from '@/lib/auth/store'
import { hasPermission } from '@/lib/auth/permissions'
import { trackJob } from '@/lib/jobs'
import { useNavigation } from '@/lib/nav/use-navigation'
import { toggleDensity, toggleTheme } from '@/lib/prefs/store'
import { MODULE_COMMANDS } from '@/lib/registry'
import { cn } from '@/lib/utils'
import {
  readRecent,
  setPaletteOpen,
  setShortcutsOpen,
  useShellState,
} from './command-palette-store'

const KIND_ICONS: Record<SearchKind, LucideIcon> = {
  service_request: statusIcon('serviceRequestStatus', 'imported'),
  lease_return: CalendarClock,
  asset: Laptop,
  contact: UserRound,
  installation_place: MapPin,
}

/** Codes a person (or a barcode scanner) types to jump straight to a record. */
const CODE_PATTERN =
  /^(SR\d{7}|TASK\d{7}|[A-Z]{2}\d{6}|[A-Z]{1,2}\d{1,2}-\d{1,3}|E\d{6}|[A-Z0-9]{8,})$/

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}

const itemClass =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 outline-none data-[selected=true]:bg-accent-wash [&[data-selected=true]>svg:first-child]:text-accent-text'
const groupClass =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3'

/**
 * Command palette (SCREENS.md §1.3, DESIGN.md §10): ⌘K / Ctrl K. Exact match first (typing or
 * scanning `SR0012345`, a task number, an asset tag, a serial or a place + Enter opens it),
 * search results from `GET /search` (debounced 150 ms, ≥ 2 chars), Go to (nav with g-chords),
 * Actions (slice commands), Recent, System.
 */
export function CommandPalette() {
  const { paletteOpen } = useShellState()
  const [query, setQuery] = useState('')
  const close = () => {
    setPaletteOpen(false)
    setQuery('')
  }
  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={(open) => (open ? setPaletteOpen(true) : close())}
      label="Command palette"
      loop
      className="flex min-h-0 flex-1 flex-col"
      overlayClassName="fixed inset-0 z-[60] bg-scrim animate-fade-in"
      contentClassName="fixed top-[14vh] left-1/2 z-[61] flex max-h-[70vh] w-[640px] max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line bg-overlay text-fg shadow-dialog outline-none animate-pop-in"
    >
      <PaletteBody query={query} setQuery={setQuery} close={close} />
    </Command.Dialog>
  )
}

function PaletteBody({
  query,
  setQuery,
  close,
}: {
  query: string
  setQuery: (q: string) => void
  close: () => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const permissions = usePermissions()
  const config = useAppConfig()
  const { entries } = useNavigation()
  const canReset = useCan('demo.reset')
  const trimmed = query.trim()
  const debounced = useDebounced(trimmed, 150)
  const search = useQuery({ ...coreQueries.search(debounced), placeholderData: (prev) => prev })
  const results: SearchResponse | undefined = debounced.length >= 2 ? search.data : undefined
  const personas =
    useQuery({ ...coreQueries.personas(), enabled: Boolean(config?.demoMode) }).data?.data ?? []
  const recent = useMemo(() => readRecent(me?.id), [me?.id])
  const listRef = useRef<HTMLDivElement>(null)

  const go = (href: string, newTab = false) => {
    close()
    if (newTab) window.open(href, '_blank', 'noopener')
    else router.history.push(href)
  }

  const runExact = async (code: string, newTab: boolean) => {
    try {
      const response = await queryClient.fetchQuery(coreQueries.search(code))
      if (response.exact) go(response.exact.href, newTab)
      else
        notify.info(`Nothing found for ${code}`, {
          description: 'Check the number or search by name.',
        })
    } catch (error) {
      notify.error(isApiError(error) ? error.title : 'Search failed')
    }
  }

  const commands = MODULE_COMMANDS.filter((command) =>
    hasPermission(permissions, command.permission),
  )

  const system: {
    id: string
    label: string
    icon: LucideIcon
    shortcut?: string
    run: () => void
  }[] = [
    { id: 'theme', label: 'Toggle theme', icon: Moon, shortcut: 't', run: () => toggleTheme() },
    {
      id: 'density',
      label: 'Toggle density',
      icon: Rows3,
      shortcut: 'd',
      run: () => toggleDensity(),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      shortcut: '?',
      run: () => setShortcutsOpen(true),
    },
  ]
  if (config?.demoMode && canReset) {
    system.push({
      id: 'demo-reset',
      label: 'Reset demo data',
      icon: RotateCcw,
      run: () => {
        void api
          .post<JobAccepted>('/demo/reset', {})
          .then((accepted) =>
            trackJob(queryClient, accepted, {
              title: 'Demo data reset',
              onDone: () => {
                void queryClient.invalidateQueries()
              },
            }),
          )
          .catch((error: unknown) => notify.error(isApiError(error) ? error.title : 'Reset failed'))
      },
    })
  }
  system.push({
    id: 'logout',
    label: 'Log out',
    icon: LogOut,
    run: () => {
      void logout(queryClient).then(() => navigate({ to: '/login', search: {} }))
    },
  })

  return (
    <>
      <div className="flex h-[52px] items-center gap-2.5 border-b border-line px-4">
        <Icon icon={Search} size={18} className="text-fg-3" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to SR, asset tag, serial — or type a command"
          className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none"
          onKeyDown={(event) => {
            const code = trimmed.toUpperCase()
            if (event.key !== 'Enter' || !CODE_PATTERN.test(code)) return
            // cmdk highlights the first row only when the query changes, so the exact match that
            // arrives later is not highlighted: Enter on a code opens it unless the user has
            // moved to another row. A scanner is faster than the debounce: resolve it first.
            const highlighted = listRef.current?.querySelector('[cmdk-item][data-selected="true"]')
            if (highlighted && !highlighted.hasAttribute('data-exact')) return
            event.preventDefault()
            const newTab = event.metaKey || event.ctrlKey
            if (results?.exact) go(results.exact.href, newTab)
            else void runExact(code, newTab)
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-1 pb-2">
        <Command.Empty className="px-4 py-7 text-center text-fg-3">
          {trimmed.length >= 2 && search.isFetching
            ? 'Searching…'
            : `Nothing matches “${trimmed}”.`}
        </Command.Empty>

        {results?.exact && (
          <Command.Group heading="Exact match" forceMount className={groupClass}>
            <HitItem
              hit={results.exact}
              onSelect={(newTab) => go(results.exact?.href ?? '/', newTab)}
              exact
            />
          </Command.Group>
        )}

        {results?.groups
          .filter((group) => group.hits.length > 0)
          .map((group) => (
            <Command.Group key={group.kind} heading={group.label} forceMount className={groupClass}>
              {group.hits
                .filter((hit) => hit.href !== results.exact?.href)
                .map((hit) => (
                  <HitItem
                    key={`${hit.kind}-${hit.id ?? hit.title}`}
                    hit={hit}
                    onSelect={(newTab) => go(hit.href, newTab)}
                  />
                ))}
            </Command.Group>
          ))}

        {!trimmed && recent.length > 0 && (
          <Command.Group heading="Recent" className={groupClass}>
            {recent.map((entity) => (
              <Command.Item
                key={`${entity.kind}-${entity.id}`}
                value={`recent ${entity.title} ${entity.subtitle ?? ''}`}
                onSelect={() => go(entity.href)}
                className={itemClass}
              >
                <Icon icon={Clock} className="text-fg-3" />
                <IdInk value={entity.title} />
                {entity.subtitle && <span className="truncate text-fg-3">{entity.subtitle}</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Go to" className={groupClass}>
          {entries.map((entry) => (
            <Command.Item
              key={entry.id}
              value={`go ${entry.label} ${(entry.keywords ?? []).join(' ')}`}
              onSelect={() => go(entry.to)}
              className={itemClass}
            >
              <Icon icon={entry.icon} className="text-fg-3" />
              <span className="flex-1">{entry.label}</span>
              {entry.shortcut && <Kbd keys={entry.shortcut} />}
            </Command.Item>
          ))}
        </Command.Group>

        {commands.length > 0 && (
          <Command.Group heading="Actions" className={groupClass}>
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`action ${command.label} ${(command.keywords ?? []).join(' ')}`}
                onSelect={() => {
                  close()
                  void command.run({
                    navigate: (to) => router.history.push(to),
                    queryClient,
                    close,
                  })
                }}
                className={itemClass}
              >
                {command.icon ? (
                  <Icon icon={command.icon} className="text-fg-3" />
                ) : (
                  <span className="w-4" />
                )}
                <span className="flex-1">{command.label}</span>
                {command.shortcut && <Kbd keys={command.shortcut} />}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {config?.demoMode && personas.length > 0 && (
          <Command.Group heading="Switch persona (demo)" className={groupClass}>
            {personas
              .filter((persona) => persona.email !== me?.email)
              .map((persona) => (
                <Command.Item
                  key={persona.email}
                  value={`persona switch ${persona.displayName} ${persona.roleLabel}`}
                  onSelect={() => {
                    close()
                    void personaLogin(queryClient, persona.email).then((response) => {
                      void navigate({ to: homePathFor(response.user) })
                      notify.success(
                        `You are now ${response.user.displayName} (${response.user.role})`,
                      )
                    })
                  }}
                  className={itemClass}
                >
                  <Icon icon={Users} className="text-fg-3" />
                  <span className="flex-1">Switch to {persona.displayName}</span>
                  <span className="text-xs text-fg-3">{persona.roleLabel}</span>
                </Command.Item>
              ))}
          </Command.Group>
        )}

        <Command.Group heading="System" className={groupClass}>
          {system.map((item) => (
            <Command.Item
              key={item.id}
              value={`system ${item.label}`}
              onSelect={() => {
                close()
                item.run()
              }}
              className={itemClass}
            >
              <Icon icon={item.icon} className="text-fg-3" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <Kbd keys={item.shortcut} />}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line bg-surface px-3.5 py-2 text-xs text-fg-3 max-md:hidden">
        <FooterHint keys="arrowup arrowdown">move</FooterHint>
        <FooterHint keys="enter">open</FooterHint>
        <FooterHint keys="mod+enter">open in new tab</FooterHint>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Kbd>SR</Kbd>
          <Kbd>GX</Kbd> prefixes jump directly
        </span>
      </div>
    </>
  )
}

function FooterHint({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Kbd keys={keys} />
      {children}
    </span>
  )
}

function HitItem({
  hit,
  onSelect,
  exact,
}: {
  hit: SearchHit
  onSelect: (newTab: boolean) => void
  exact?: boolean
}) {
  return (
    <Command.Item
      value={`${exact ? 'exact' : 'hit'} ${hit.kind} ${hit.title} ${hit.subtitle ?? ''}`}
      data-exact={exact || undefined}
      forceMount
      onSelect={() => onSelect(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSelect(true)
      }}
      className={cn(itemClass, 'group')}
    >
      <Icon
        icon={KIND_ICONS[hit.kind]}
        className={hit.tone ? `hg-tone-${hit.tone} text-(--t)` : 'text-fg-3'}
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
        {exact && <span className="text-fg-3">Open</span>}
        <IdInk value={hit.title.split(' · ')[0] ?? hit.title} />
        <span className="truncate text-fg-3">
          {[hit.title.split(' · ').slice(1).join(' · '), hit.subtitle].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Icon
        icon={CornerDownLeft}
        size={14}
        className="text-fg-3 opacity-0 group-data-[selected=true]:opacity-100"
      />
    </Command.Item>
  )
}
