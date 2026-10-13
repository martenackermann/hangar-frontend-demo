import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Lock, LockOpen, MapPin, Search, Volume2, VolumeX, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ScanInput, type ScanInputHandle } from '@/components/scan/scan-input'
import { ScanList } from '@/components/scan/scan-list'
import { useOnline } from '@/components/scan/scan-station'
import { useScanSession } from '@/components/scan/use-scan-session'
import { VerdictBanner } from '@/components/scan/verdict-banner'
import { Button, IconButton } from '@/components/ui/button'
import { Banner, EmptyState, FlagBadge, Skeleton } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { SearchInput } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Page, PageHeader } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import { useHubs } from '@/lib/api/core'
import type { AssetSummary, ScanResult } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { setPrefs, usePrefs } from '@/lib/prefs/store'
import { boolParam, idParam, stringParam } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { scanInstallationPlace, stagingQueries } from '@/modules/staging/api'
import { HubSelect } from '@/modules/staging/components/hub-select'
import { useHubId } from '@/modules/staging/hooks/use-hub'
import { placeOf, SCAN_PAIR } from '@/modules/staging/scan-values'

/**
 * Installation places (SCREENS.md §5.1, SPEC §6.16): scan station with a two-value flow. The
 * single field tells places (`B4-12`, optional `LOC:` prefix) from serials; once both are known
 * exactly one `POST /scan/installation-place` is sent. A sticky place (`L`, or `Alt+L` while the
 * field holds the focus) stays set for every following serial.
 */
const searchSchema = z.object({
  siteId: idParam(),
  lock: stringParam(),
  sound: boolParam(),
})

export const Route = createFileRoute('/_app/warehouse/installation-places')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('staging.scan'),
  staticData: { title: 'Installation places' },
  component: InstallationPlacesPage,
})

function InstallationPlacesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const hubs = useHubs()
  const siteId = useHubId(search.siteId)
  const site = hubs.find((hub) => hub.id === siteId)
  const online = useOnline()
  const sound = usePrefs((prefs) => prefs.sound)
  const inputRef = useRef<ScanInputHandle>(null)
  const [pendingSerial, setPendingSerial] = useState<string | null>(null)
  const [pendingPlace, setPendingPlace] = useState<string | null>(null)
  const locked = search.lock ? placeOf(search.lock) : null

  const patch = (values: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...values }), replace: true })

  useEffect(() => {
    if (search.sound === false) setPrefs({ sound: false })
  }, [search.sound])

  const session = useScanSession<AssetSummary>({
    submit: (value) => {
      const [serial = '', place = ''] = value.split(SCAN_PAIR)
      if (siteId === undefined) return Promise.reject(new Error('Choose a hub first.'))
      return scanInstallationPlace({ siteId, serial, place })
    },
  })

  const send = (serial: string, place: string) => {
    session.scan(`${serial}${SCAN_PAIR}${place}`)
    setPendingSerial(null)
    if (!locked) setPendingPlace(null)
  }

  const onValue = (value: string) => {
    const place = placeOf(value)
    if (place) {
      if (locked) {
        patch({ lock: place })
        notify.info(`Locked place changed to ${place}`)
      } else if (pendingSerial) send(pendingSerial, place)
      else setPendingPlace(place)
      return
    }
    const target = locked ?? pendingPlace
    if (target) send(value, target)
    else setPendingSerial(value)
  }

  const lastPlace = session.latest?.result?.entity?.installationPlace ?? null
  const toggleLock = () => {
    if (locked) {
      patch({ lock: undefined })
      return
    }
    const place = pendingPlace ?? lastPlace
    if (!place) {
      notify.info('Scan a place first, then lock it.')
      return
    }
    patch({ lock: place })
    setPendingPlace(null)
  }

  useShortcut('l', toggleLock, { description: 'Lock / unlock the place', group: 'Scan station' })
  useShortcut('alt+l', toggleLock, { allowInInput: true, group: 'Scan station' })
  useShortcut('mod+z', () => session.undoLast(), {
    description: 'Undo last scan',
    group: 'Scan station',
    allowInInput: true,
  })
  useShortcut('f2', () => setPrefs({ sound: !sound }), {
    description: 'Sound on/off',
    group: 'Scan station',
    allowInInput: true,
  })

  const latest = session.latest
  const expecting = locked
    ? `Locked: ${locked} — scan serials`
    : pendingSerial
      ? `Serial ${pendingSerial} — now scan a place`
      : pendingPlace
        ? `Place ${pendingPlace} — now scan a serial`
        : 'Scan serial or place'

  return (
    <Page>
      <PageHeader
        title="Installation places"
        meta={site ? `${site.name} · staging` : undefined}
        actions={
          <HubSelect
            value={siteId}
            onChange={(next) => {
              patch({ siteId: next })
              inputRef.current?.focus()
            }}
          />
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] border-t border-line max-xl:grid-cols-1">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="grid gap-3 p-6 max-md:p-3">
            {!online && (
              <Banner
                tone="caution"
                icon={WifiOff}
                title="Offline — scanning needs a connection."
              />
            )}
            <ScanInput
              ref={inputRef}
              label="Scan serial or place"
              onSubmit={onValue}
              disabled={!online || siteId === undefined}
              disabledReason="Offline — scanning needs a connection."
              tools={
                <IconButton
                  icon={sound ? Volume2 : VolumeX}
                  label={sound ? 'Sound on' : 'Sound off'}
                  shortcut="f2"
                  size="sm"
                  onClick={() => setPrefs({ sound: !sound })}
                />
              }
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2" aria-live="polite">
              <span
                className={cn(
                  'inline-flex h-badge items-center gap-1.5 rounded-xs px-2 font-medium',
                  (pendingSerial ?? pendingPlace ?? locked)
                    ? 'bg-accent-wash text-accent-text'
                    : 'bg-pressed text-fg-2',
                )}
                data-testid="scan-expecting"
              >
                {expecting}
              </span>
              {site && <FlagBadge icon={MapPin}>{site.name} · staging</FlagBadge>}
              <Button
                size="sm"
                variant={locked ? 'secondary' : 'ghost'}
                icon={locked ? Lock : LockOpen}
                onClick={toggleLock}
                aria-pressed={Boolean(locked)}
              >
                {locked ? `Locked: ${locked}` : 'Lock place'}
              </Button>
              <span className="text-xs text-fg-3 max-md:hidden">
                <Kbd>L</Kbd> · <Kbd>Alt</Kbd> <Kbd>L</Kbd> sticky place
              </span>
              {(pendingSerial ?? pendingPlace) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPendingSerial(null)
                    setPendingPlace(null)
                  }}
                >
                  Clear
                </Button>
              )}
              {session.pending > 0 && (
                <span className="ml-auto text-xs text-fg-3">
                  {session.pending} scan{session.pending === 1 ? '' : 's'} being checked
                </span>
              )}
            </div>
            {latest?.state === 'failed' ? (
              <Banner tone="critical" icon={MapPin} title={`Scan #${latest.sequence} not checked`}>
                {latest.error} {latest.value}
              </Banner>
            ) : latest?.result ? (
              <VerdictBanner
                result={latest.result}
                sequence={latest.sequence}
                at={latest.at}
                details={<AssetLine result={latest.result} />}
                onUndo={
                  latest.result.undo && latest.result.applied && !latest.undone
                    ? () => void session.undo(latest)
                    : undefined
                }
                undoPending={session.undoingId === latest.id}
              />
            ) : null}
          </div>
          <div className="flex min-h-[240px] flex-1 flex-col border-t border-line bg-surface">
            <ScanList
              entries={session.entries}
              describe={(result) => <AssetLine result={result} />}
              onUndo={(entry) => void session.undo(entry)}
              empty="Scan a device serial and a shelf place to store it."
            />
          </div>
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface max-xl:border-t max-xl:border-l-0">
          <PlaceLookup siteId={siteId} />
          <Counters counters={session.counters} />
        </aside>
      </div>
    </Page>
  )
}

function AssetLine({ result }: { result: ScanResult<AssetSummary> }) {
  const asset = result.entity
  if (!asset) return null
  return (
    <span className="text-fg-2">
      <span className="hg-mono text-fg">{asset.assetTag ?? asset.serialNumber}</span>
      {' · '}
      {asset.article?.name ?? asset.model ?? 'Unknown model'}
      {asset.installationPlace && (
        <>
          {' · '}
          <span className="hg-mono">{asset.installationPlace}</span>
        </>
      )}
    </span>
  )
}

function PlaceLookup({ siteId }: { siteId: number | undefined }) {
  const [q, setQ] = useState('')
  const term = q.trim().toUpperCase()
  const query = useQuery({
    ...stagingQueries.installationPlaces({ siteId, q: term }),
    enabled: siteId !== undefined && term.length > 0,
  })
  const places = query.data?.data ?? []
  return (
    <section className="grid gap-3 border-b border-line p-4" aria-label="Place lookup">
      <h2 className="text-sm font-semibold">Place lookup</h2>
      <SearchInput
        value={q}
        onValueChange={setQ}
        placeholder="Place or row, e.g. B4"
        aria-label="Place prefix"
      />
      {term.length === 0 ? (
        <p className="text-xs text-fg-3">Type a place or row to see what is stored there.</p>
      ) : query.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="w-40" />
          <Skeleton className="w-56" />
        </div>
      ) : places.length === 0 ? (
        <EmptyState icon={Search} title={`Nothing stored on ${term}.`} className="py-4" />
      ) : (
        <ul className="grid gap-2" aria-label="Occupied places">
          {places.slice(0, 30).map((row) => (
            <li key={row.place} className="rounded-sm border border-line-subtle p-2">
              <p className="hg-mono text-sm font-semibold">{row.place}</p>
              <ul className="mt-1 grid gap-0.5 text-xs text-fg-2">
                {row.assets.map((asset) => (
                  <li key={asset.id} className="flex min-w-0 items-center gap-1.5">
                    <Icon icon={MapPin} size={12} className="shrink-0 text-fg-3" />
                    <span className="hg-mono">{asset.assetTag ?? asset.serialNumber}</span>
                    <span className="truncate">{asset.article?.name ?? asset.model}</span>
                    {asset.status !== 'available' && (
                      <span className="shrink-0 text-fg-3">
                        · {asset.serviceRequest?.number ?? asset.status}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const COUNTERS = [
  ['ok', 'OK', 'done'],
  ['warning', 'Warnings', 'caution'],
  ['error', 'Errors', 'critical'],
] as const

function Counters({ counters }: { counters: { ok: number; warning: number; error: number } }) {
  return (
    <section className="grid gap-2 p-4" aria-label="Session counters">
      <h2 className="text-sm font-semibold">This session</h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {COUNTERS.map(([key, label, tone]) => (
          <div key={key} className={`hg-tone-${tone} rounded-sm bg-(--t-wash) p-2`}>
            <dt className="text-xs text-fg-2">{label}</dt>
            <dd className="hg-mono text-lg font-semibold text-(--t-fg)">{counters[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
