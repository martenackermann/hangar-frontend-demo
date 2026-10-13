import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Mail, Paperclip, SearchX } from 'lucide-react'
import { useMemo } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { DensityToggle, FilterBar, type FilterDef, type SearchPatch } from '@/components/data-table/filter-bar'
import { useDrawerNavigation, useDrawerSearch, useDrawerSiblings } from '@/components/drawer/drawer-state'
import { StatusBadge } from '@/components/domain/status'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import type { EntityRef, MailLogEntry } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime, formatTime } from '@/lib/format'
import { apiQuery, mailLogQuery } from '@/modules/requests/api'
import { MAIL_STATUSES, TRIGGERS, type CommsSearch } from '@/modules/requests/search'
import { useTemplateNames } from '../dispatch-dialog'

const ENTITY_TYPES = [
  { value: 'service_request', label: 'Service request' },
  { value: 'lease_return', label: 'Lease return' },
  { value: 'calloff_order', label: 'Call-off order' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'import_job', label: 'Import' },
  { value: 'tour', label: 'Tour' },
]

/** Related record: SR/lease/asset open their drawer; call-offs, inventories, imports link to their page. */
function Related({ entity }: { entity: EntityRef }) {
  const drawer = useDrawerNavigation()
  const param =
    entity.type === 'service_request' ? 'sr' : entity.type === 'lease_return' ? 'lr' : entity.type === 'asset' ? 'asset' : null
  const className = 'truncate font-mono text-xs text-accent-fg underline-offset-2 hover:underline'
  if (param)
    return (
      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.stopPropagation()
          drawer.open(param, entity.id)
        }}
      >
        {entity.label}
      </button>
    )
  const id = String(entity.id)
  const stop = (event: React.MouseEvent) => event.stopPropagation()
  switch (entity.type) {
    case 'calloff_order':
      return (
        <Link to="/stock/call-off-orders/$orderId" params={{ orderId: id }} className={className} onClick={stop}>
          {entity.label}
        </Link>
      )
    case 'inventory':
      return (
        <Link to="/stock/inventory/$inventoryId" params={{ inventoryId: id }} className={className} onClick={stop}>
          {entity.label}
        </Link>
      )
    case 'import_job':
      return (
        <Link to="/data/imports/$importId" params={{ importId: id }} className={className} onClick={stop}>
          {entity.label}
        </Link>
      )
    case 'tour':
      return (
        <Link to="/field/tour-planner" className={className} onClick={stop}>
          {entity.label}
        </Link>
      )
    default:
      return <span className="truncate text-xs">{entity.label}</span>
  }
}

export function MailLogTab({
  search,
  onSearch,
}: {
  search: CommsSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const enums = useEnums()
  const templateName = useTemplateNames()
  const drawer = useDrawerNavigation()
  const { mail: openId } = useDrawerSearch()
  const query = useQuery(mailLogQuery(apiQuery({ ...search, dryRun: undefined })))
  const rows = query.data?.data ?? []
  useDrawerSiblings(
    'mail',
    rows.map((row) => row.id),
  )

  const columns = useMemo<DataColumn<MailLogEntry>[]>(
    () => [
      {
        id: 'queuedAt',
        header: 'Queued',
        sortField: 'queuedAt',
        width: 128,
        locked: true,
        cell: (mail) => <span className="whitespace-nowrap">{formatDateTime(mail.queuedAt)}</span>,
      },
      {
        id: 'template',
        header: 'Template',
        width: 190,
        title: (mail) => mail.templateId,
        cell: (mail) => <span className="truncate">{mail.templateName}</span>,
      },
      {
        id: 'to',
        header: 'To',
        width: 220,
        title: (mail) => [...mail.to, ...mail.cc.map((cc) => `cc ${cc}`)].join(', '),
        cell: (mail) => (
          <span className="truncate text-fg-2">
            {mail.to.join(', ')}
            {mail.cc.length > 0 && <span className="text-fg-3"> +{mail.cc.length} cc</span>}
          </span>
        ),
      },
      {
        id: 'subject',
        header: 'Subject',
        width: 320,
        title: (mail) => mail.subject,
        cell: (mail) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{mail.subject ?? '—'}</span>
            {mail.attachmentCount > 0 && (
              <span title={`${mail.attachmentCount} attachment(s)`}>
                <Icon icon={Paperclip} size={12} className="text-fg-3" />
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'related',
        header: 'Related',
        width: 130,
        cell: (mail) => (mail.entity ? <Related entity={mail.entity} /> : null),
      },
      {
        id: 'status',
        header: 'Status',
        width: 100,
        cell: (mail) =>
          mail.error ? (
            <Tooltip content={mail.error}>
              <span tabIndex={0}>
                <StatusBadge entity="mailStatus" state={mail.status} size="sm" />
              </span>
            </Tooltip>
          ) : (
            <StatusBadge entity="mailStatus" state={mail.status} size="sm" />
          ),
      },
      {
        id: 'trigger',
        header: 'Trigger',
        width: 150,
        title: (mail) => mail.triggeredBy?.displayName,
        cell: (mail) => (
          <span className="truncate text-fg-2">
            {mail.triggeredBy?.displayName ?? enumLabel(enums, 'trigger', mail.trigger)}
          </span>
        ),
      },
      {
        id: 'sentAt',
        header: 'Sent',
        sortField: 'sentAt',
        width: 80,
        cell: (mail) => (mail.sentAt ? formatTime(mail.sentAt) : null),
      },
    ],
    [enums],
  )

  const filters: FilterDef[] = useMemo(
    () => [
      {
        kind: 'multi',
        key: 'templateId',
        label: 'Template',
        options: commsTemplateIds.map((value) => ({ value, label: templateName(value) })),
      },
      {
        kind: 'multi',
        key: 'status',
        label: 'Status',
        options: MAIL_STATUSES.map((value) => ({ value, label: enumLabel(enums, 'mailStatus', value) })),
      },
      {
        kind: 'multi',
        key: 'trigger',
        label: 'Trigger',
        options: TRIGGERS.map((value) => ({ value, label: enumLabel(enums, 'trigger', value) })),
      },
      { kind: 'single', key: 'entityType', label: 'Related to', options: ENTITY_TYPES },
      { kind: 'dateRange', id: 'queued', label: 'Queued', fromKey: 'from', toKey: 'to' },
    ],
    [enums, templateName],
  )

  const filtered =
    Object.keys(apiQuery({ ...search, page: undefined, perPage: undefined, sort: undefined, dryRun: undefined })).length > 0

  return (
    <>
      <FilterBar
        search={search}
        onSearchChange={(patch) => onSearch(patch, true)}
        filters={filters}
        searchPlaceholder="Filter by recipient, subject or record…"
        resultCount={query.data?.meta.total}
        end={<DensityToggle />}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Mail log"
          columns={columns}
          rows={rows}
          getRowId={(row: MailLogEntry) => String(row.id)}
          total={query.data?.meta.total}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={search.sort ?? '-queuedAt'}
          onSortChange={(sort) => onSearch({ sort, page: undefined }, true)}
          activeId={openId ? String(openId) : null}
          onOpen={(row) => drawer.open('mail', row.id)}
          mobileRow={(mail) => (
            <div className="grid gap-0.5">
              <div className="flex items-center gap-2 text-xs text-fg-3">
                {formatDateTime(mail.queuedAt)}
                <span className="ml-auto">
                  <StatusBadge entity="mailStatus" state={mail.status} size="sm" />
                </span>
              </div>
              <div className="truncate font-medium">{mail.subject ?? mail.templateName}</div>
              <div className="truncate text-xs text-fg-3">{mail.to.join(', ')}</div>
            </div>
          )}
          pagination={{
            page: search.page,
            perPage: search.perPage,
            total: query.data?.meta.total ?? 0,
            onPageChange: (page) => onSearch({ page }),
            onPerPageChange: (perPage) => onSearch({ perPage, page: undefined }),
          }}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No mails match these filters."
                actions={
                  <Button
                    size="sm"
                    onClick={() =>
                      onSearch(
                        Object.fromEntries(
                          Object.keys(search)
                            .filter((key) => key !== 'view')
                            .map((key) => [key, undefined]),
                        ),
                      )
                    }
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Mail} title="No mails sent yet. The daily dispatch runs at 07:00." />
            )
          }
        />
      </div>
    </>
  )
}

/** Template ids offered in the filter (all owners; names come from `/notification-templates`). */
const commsTemplateIds = [
  'sr.invitation',
  'sr.campus_info',
  'sr.reminder_1',
  'sr.reminder_2',
  'sr.escalation',
  'sr.hardware_unavailable',
  'sr.reschedule',
  'sr.reschedule_campus',
  'sr.shipping_confirmation',
  'sr.protocol',
  'lease.info',
  'lease.info_campus',
  'lease.reminder_1',
  'lease.reminder_1_campus',
  'lease.reminder_2',
  'lease.reminder_2_campus',
  'lease.escalation',
  'lease.escalation_campus',
  'tour.assigned',
  'calloff.order',
  'inventory.report',
  'import.summary',
] as const
