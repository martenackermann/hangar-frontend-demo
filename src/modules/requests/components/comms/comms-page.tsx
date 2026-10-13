import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { FileText, History, Mail, MailCheck, Send, Settings2 } from 'lucide-react'
import type { SearchPatch } from '@/components/data-table/filter-bar'
import { useDrawerSearch } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Page, PageHeader } from '@/components/ui/page'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCan } from '@/lib/auth/store'
import { formatDateTime } from '@/lib/format'
import { dispatchSettingsQuery } from '@/modules/requests/api'
import type { CommsSearch } from '@/modules/requests/search'
import { DispatchDialog, useStartDispatch } from '../dispatch-dialog'
import { MailLogTab } from './mail-log-tab'
import { RunDrawer, RunsTab } from './runs-tab'
import { TemplatesTab } from './templates-tab'

type View = NonNullable<CommsSearch['view']>

function Switches() {
  const settings = useQuery(dispatchSettingsQuery).data
  if (!settings) return null
  const off = [
    !settings.srMailsEnabled && 'SR mails off',
    !settings.leaseMailsEnabled && 'lease mails off',
  ].filter(Boolean)
  return (
    <>
      Next run {formatDateTime(settings.nextScheduledRunAt)}
      {' · '}
      {off.length ? <span className="text-tone-caution-fg">{off.join(', ')}</span> : 'all chains on'}
    </>
  )
}

/**
 * Communications (SCREENS.md §4.3): mail log, dispatch runs (+ run drawer), templates; header
 * shows the next scheduled run and the master switches, with Dry run / Run now.
 */
export function CommsPage({
  search,
  onSearch,
}: {
  search: CommsSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const view: View = search.view ?? 'mail-log'
  const canDispatch = useCan('comms.dispatch')
  const drawers = useDrawerSearch()
  const dispatch = useStartDispatch()
  const [confirmRun, setConfirmRun] = useState(false)
  const coreDrawerOpen = Boolean(drawers.sr ?? drawers.lr ?? drawers.asset ?? drawers.mail)

  const setView = (next: string) =>
    onSearch(
      {
        view: next === 'mail-log' ? undefined : next,
        page: undefined,
        sort: undefined,
        run: undefined,
        template: undefined,
      },
      true,
    )

  return (
    <Page>
      <PageHeader
        title="Communications"
        meta={<Switches />}
        actions={
          <>
            <Button variant="ghost" icon={Settings2} asChild>
              <Link to="/admin/dispatch-settings">Dispatch settings</Link>
            </Button>
            {canDispatch && (
              <>
                <Button icon={MailCheck} onClick={() => onSearch({ preview: true })}>
                  Dry run
                </Button>
                <Button variant="primary" icon={Send} loading={dispatch.pending} onClick={() => setConfirmRun(true)}>
                  Run now
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Tabs value={view} onValueChange={setView} className="shrink-0 px-4 max-md:px-3">
            <TabsList aria-label="Communications views">
              <TabsTrigger value="mail-log" icon={Mail}>
                Mail log
              </TabsTrigger>
              <TabsTrigger value="dispatch-runs" icon={History}>
                Dispatch runs
              </TabsTrigger>
              <TabsTrigger value="templates" icon={FileText}>
                Templates
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'mail-log' && <MailLogTab search={search} onSearch={onSearch} />}
          {view === 'dispatch-runs' && <RunsTab search={search} onSearch={onSearch} />}
          {view === 'templates' && <TemplatesTab search={search} onSearch={onSearch} />}
        </div>
        {view === 'dispatch-runs' && search.run && !coreDrawerOpen && (
          <RunDrawer key={search.run} id={search.run} onClose={() => onSearch({ run: undefined })} />
        )}
      </div>
      <DispatchDialog
        open={Boolean(search.preview)}
        onOpenChange={(open) => !open && onSearch({ preview: undefined }, true)}
      />
      <ConfirmDialog
        open={confirmRun}
        onOpenChange={setConfirmRun}
        title="Send all due mails now?"
        description="The daily dispatch runs now instead of waiting for 07:00. Each record gets at most one mail per run; paused and VIP records are skipped."
        confirmLabel="Send due mails"
        pending={dispatch.pending}
        onConfirm={() => {
          setConfirmRun(false)
          void dispatch.start()
        }}
      />
    </Page>
  )
}
