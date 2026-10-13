import { Link, useMatches, useNavigate, useRouterState } from '@tanstack/react-router'
import { Activity, CalendarCheck, Menu, ScanLine, X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { useMediaQuery } from '@/lib/use-media-query'
import { DrawerHost } from '@/components/drawer/drawer-host'
import { Icon } from '@/components/ui/icon'
import { Kbd } from '@/components/ui/kbd'
import { useMe } from '@/lib/auth/store'
import { useNavigation } from '@/lib/nav/use-navigation'
import { setPrefs, toggleDensity, toggleTheme, usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'
import {
  openCommandPalette,
  setNavSheetOpen,
  setShortcutsOpen,
  shellStore,
  useShellState,
} from './command-palette-store'
import { Logo } from './logo'
import { Rail, isEntryActive } from './rail'
import { ShortcutHelp } from './shortcut-help'
import { TopBar } from './top-bar'

/** Global keys (SCREENS.md §1.4): ⌘K, ?, T, D, [, g-chords for every visible nav entry. */
function GlobalShortcuts({ onToggleRail }: { onToggleRail: () => void }) {
  const { entries } = useNavigation()
  const navigate = useNavigate()
  useShortcut('mod+k', () => shellStore.setState((s) => ({ ...s, paletteOpen: !s.paletteOpen })), {
    description: 'Command palette',
    group: 'Global',
    allowInInput: true,
    allowInDialog: true,
  })
  useShortcut('?', () => setShortcutsOpen(true), {
    description: 'Keyboard shortcuts',
    group: 'Global',
  })
  useShortcut('t', toggleTheme, { description: 'Toggle theme', group: 'Global' })
  useShortcut('d', toggleDensity, { description: 'Toggle density', group: 'Global' })
  useShortcut('[', onToggleRail, { description: 'Collapse / expand navigation', group: 'Global' })
  return (
    <>
      {entries
        .filter((entry) => entry.shortcut)
        .map((entry) => (
          <NavShortcut
            key={entry.id}
            keys={entry.shortcut ?? ''}
            label={entry.label}
            go={() => void navigate({ to: entry.to })}
          />
        ))}
    </>
  )
}

function NavShortcut({ keys, label, go }: { keys: string; label: string; go: () => void }) {
  useShortcut(keys, go, { description: label, group: 'Navigation' })
  return null
}

/** Status bar (DESIGN.md §9.1): live · URL view state · keyboard hints. Hidden below 768 px. */
function StatusBar() {
  const search = useRouterState({ select: (state) => state.location.searchStr })
  return (
    <footer className="flex h-[26px] min-w-0 items-center justify-between gap-4 border-t border-line bg-canvas px-3 text-2xs text-fg-3 max-md:hidden">
      <div className="flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <Icon icon={Activity} size={12} className="text-tone-done" /> Live
        </span>
        {search && <span className="truncate font-mono">{decodeURIComponent(search)}</span>}
      </div>
      <div className="flex items-center gap-3.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>X</Kbd> select
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>⏎</Kbd> open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd keys="mod+k" /> jump
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>?</Kbd> all shortcuts
        </span>
      </div>
    </footer>
  )
}

/** Phone navigation sheet (opened from the top-left menu button). */
function NavSheet() {
  const { navSheetOpen } = useShellState()
  const { groups } = useNavigation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <RadixDialog.Root open={navSheetOpen} onOpenChange={setNavSheetOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] animate-slide-up overflow-y-auto rounded-t-lg bg-rail pb-[env(safe-area-inset-bottom)] text-rail-fg-2 shadow-dialog"
        >
          <div className="flex items-center gap-2.5 border-b border-rail-line px-4 py-3">
            <Logo />
            <RadixDialog.Title className="flex-1 font-semibold text-rail-fg">
              Hangar
            </RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Close navigation"
              className="grid size-11 place-items-center rounded-sm hover:bg-rail-hover"
            >
              <Icon icon={X} size={20} />
            </RadixDialog.Close>
          </div>
          {groups.map((group) => (
            <div key={group.id} className="py-1">
              <p className="px-5 pt-2 pb-1 text-2xs font-medium text-rail-fg-3">{group.label}</p>
              {group.entries.map((entry) => {
                const active = isEntryActive(entry, pathname)
                return (
                  <Link
                    key={entry.id}
                    to={entry.to}
                    onClick={() => setNavSheetOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'mx-2 flex h-11 items-center gap-3 rounded-sm px-3',
                      active ? 'bg-rail-active text-rail-fg' : 'hover:bg-rail-hover',
                    )}
                  >
                    <Icon
                      icon={entry.icon}
                      size={20}
                      className={active ? 'text-accent' : 'text-rail-fg-3'}
                    />
                    {entry.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/**
 * Screens with their own bottom bar: a stop's Complete deployment footer and the scan stations'
 * dock (Undo · Camera scan · Finish). One bottom bar, one amber button at a time.
 */
const OWN_DOCK =
  /^\/(field\/tours\/\d+\/stops\/\d+|stock\/inventory\/\d+|warehouse\/installation-places)/

/**
 * Technician bottom dock on phones (SCREENS.md §6.2): My tour · Scan (⌘K "scan anything") ·
 * Inventory · Menu. 64 px + safe area; Scan is the 56 px amber button. Hidden on a stop, whose
 * own footer holds the primary action (one bottom bar at a time).
 */
function TechnicianDock() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  if (OWN_DOCK.test(pathname)) return null
  const item = 'flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-2xs text-fg-2'
  const onTour = pathname.startsWith('/field')
  const onInventory = pathname.startsWith('/stock/inventory')
  return (
    <nav
      aria-label="Technician"
      className="flex h-16 shrink-0 items-center border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] shadow-bar md:hidden"
    >
      <Link
        to="/field/my-tour"
        aria-current={onTour ? 'page' : undefined}
        className={cn(item, onTour && 'text-accent-text')}
      >
        <Icon icon={CalendarCheck} size={20} /> My tour
      </Link>
      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-2 grid size-14 shrink-0 place-items-center rounded-md bg-accent text-fg-on-accent shadow-bar focus-visible:shadow-[0_0_0_1px_var(--hg-canvas)] focus-visible:outline-offset-2"
        aria-label="Scan anything"
      >
        <Icon icon={ScanLine} size={24} />
      </button>
      <Link
        to="/stock/inventory"
        aria-current={onInventory ? 'page' : undefined}
        className={cn(item, onInventory && 'text-accent-text')}
      >
        <Icon icon={ScanLine} size={20} /> Inventory
      </Link>
      <button type="button" className={item} onClick={() => setNavSheetOpen(true)}>
        <Icon icon={Menu} size={20} /> Menu
      </button>
    </nav>
  )
}

/** `<title>` from the route's `staticData.title` ("My tour · Hangar"); a PageHeader refines it. */
function RouteTitle() {
  const title = useMatches({
    select: (matches) =>
      [...matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  })
  useDocumentTitle(title)
  return null
}

/** WCAG 2.4.1: first tab stop jumps past the rail and the top bar. */
function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}
      className="sr-only rounded-sm bg-overlay px-3 py-2 font-medium text-fg shadow-popover focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80]"
    >
      Skip to content
    </a>
  )
}

/**
 * App shell (DESIGN.md §9.1): graphite rail | top bar · content (+ docked drawer) · status bar.
 * Rail collapsed by default below 1440 px (`[` toggles, remembered); phones get a nav sheet and,
 * for technicians, the bottom dock.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe()
  const railPref = usePrefs((prefs) => prefs.railCollapsed)
  const wide = useMediaQuery('(min-width: 1440px)')
  // DESIGN §9.1: collapsed by default below 1440 px and on the pipeline board (it needs the width)
  const onBoard = useRouterState({ select: (state) => state.location.pathname === '/pipeline' })
  const collapsed = railPref ?? (!wide || onBoard)
  const toggleRail = () => setPrefs({ railCollapsed: !collapsed })

  return (
    <div className="grid h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)]">
      <SkipLink />
      <RouteTitle />
      <div className="flex min-h-0 max-md:hidden">
        <Rail collapsed={collapsed} onToggle={toggleRail} />
      </div>
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <TopBar />
        <div className="relative flex min-h-0 min-w-0">
          <main
            id="main"
            tabIndex={-1}
            className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
          >
            {children}
          </main>
          <DrawerHost />
        </div>
        {me?.role === 'technician' ? <TechnicianDock /> : null}
        <StatusBar />
      </div>
      <GlobalShortcuts onToggleRail={toggleRail} />
      <CommandPalette />
      <ShortcutHelp />
      <NavSheet />
    </div>
  )
}
