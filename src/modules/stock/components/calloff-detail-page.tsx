import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  FileSpreadsheet,
  FileText,
  Mail,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { CopyableId, IdInk, StatusBadge } from '@/components/domain/status'
import { Button, IconButton } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner, EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field, Input, Textarea } from '@/components/ui/input'
import { KeyValue, KeyValues, Page, PageHeader, Panel } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'
import { downloadGet } from '@/lib/api/downloads'
import { isApiError } from '@/lib/api/errors'
import type { CallOffLine, CallOffOrder, CallOffOrderPatch } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { stockQueries, useCallOffAction, usePatchCallOff } from '../api'
import { ScreenLink } from './links'

const WARNING_TEXT: Record<string, string> = {
  zero_lines: 'No line has a quantity above zero.',
  delivery_date_past: 'The delivery date is in the past.',
  below_min: 'Some lines leave the hub below its minimum stock.',
  above_max: 'Some lines push the hub above its maximum stock.',
}

function errorText(error: unknown): string {
  if (!isApiError(error)) return 'The change could not be saved.'
  const fields = Object.values(error.fieldErrors).flat()
  return fields.length ? fields.join(' ') : (error.guard?.message ?? error.detail ?? error.title)
}

function QuantityInput({
  line,
  onCommit,
  disabled,
}: {
  line: CallOffLine
  onCommit: (qty: number) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const value = Number(draft)
    setDraft(null)
    if (Number.isInteger(value) && value >= 0 && value !== line.quantity) onCommit(value)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={`Quantity ${line.article.name}`}
      disabled={disabled}
      value={draft ?? String(line.quantity)}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className="h-7 w-16 rounded-xs border border-line-strong bg-sunken px-1.5 text-right font-mono font-semibold outline-none focus:border-focus focus:shadow-[0_0_0_1px_var(--hg-focus)]"
    />
  )
}

function LineWarnings({ line }: { line: CallOffLine }) {
  return (
    <span className="inline-flex gap-1">
      {line.warnings.includes('below_min') && (
        <Tooltip content={`Stock + quantity stays below the minimum (${line.minQty}).`}>
          <button type="button" aria-label="Below minimum" className="grid place-items-center">
            <Icon icon={ArrowDownToLine} size={14} className="text-tone-caution" />
          </button>
        </Tooltip>
      )}
      {line.warnings.includes('above_max') && (
        <Tooltip content={`Stock + quantity exceeds the maximum (${line.maxQty}).`}>
          <button type="button" aria-label="Above maximum" className="grid place-items-center">
            <Icon icon={ArrowUpToLine} size={14} className="text-tone-outreach" />
          </button>
        </Tooltip>
      )}
    </span>
  )
}

function DraftFacts({
  order,
  patch,
}: {
  order: CallOffOrder
  patch: (body: CallOffOrderPatch) => Promise<boolean>
}) {
  const [note, setNote] = useState(order.note ?? '')
  const [recipient, setRecipient] = useState(order.recipientEmail)
  const [noteDirty, setNoteDirty] = useState(false)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
      <div className="grid content-start gap-3">
        <Field label="Requested delivery date" required>
          {() => (
            <DatePicker
              label="Requested delivery date"
              value={order.deliveryDate}
              onChange={(date) =>
                date && void patch({ version: order.version, deliveryDate: date })
              }
            />
          )}
        </Field>
        <Field label="Recipient" help="Initech Logistics order desk; the team mailbox gets a copy.">
          {({ id }) => (
            <Input
              id={id}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              onBlur={() => {
                if (recipient.trim() && recipient !== order.recipientEmail)
                  void patch({ version: order.version, recipientEmail: recipient.trim() }).then(
                    (ok) => {
                      if (!ok) setRecipient(order.recipientEmail)
                    },
                  )
              }}
            />
          )}
        </Field>
      </div>
      <Field label="Note for Initech Logistics">
        {({ id }) => (
          <div className="grid gap-2">
            <Textarea
              id={id}
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                setNoteDirty(true)
              }}
            />
            {noteDirty && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void patch({ version: order.version, note: note.trim() || null }).then(
                      (ok) => ok && setNoteDirty(false),
                    )
                  }
                >
                  Save note
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNote(order.note ?? '')
                    setNoteDirty(false)
                  }}
                >
                  Discard
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>
    </div>
  )
}

export function CallOffDetailPage({ orderId }: { orderId: number }) {
  const canManage = useCan('calloff.manage')
  const query = useQuery(stockQueries.calloff(orderId))
  const order = query.data
  const patchMutation = usePatchCallOff(orderId)
  const action = useCallOffAction(orderId)
  const [confirm, setConfirm] = useState<'send' | 'cancel' | null>(null)
  const [adding, setAdding] = useState<number | undefined>(undefined)
  const matrix = useQuery({
    ...stockQueries.matrix({ siteId: order ? [order.site.id] : [] }),
    enabled: order?.status === 'draft' && canManage,
  }).data

  const editable = order?.status === 'draft' && canManage

  const patch = async (body: CallOffOrderPatch): Promise<boolean> => {
    try {
      await patchMutation.mutateAsync(body)
      return true
    } catch (error) {
      if (isApiError(error) && error.isVersionConflict) {
        notify.error('This order changed. Reload', {
          action: { label: 'Reload', onClick: () => void query.refetch() },
        })
      } else notify.error('Not saved', { description: errorText(error) })
      return false
    }
  }

  const run = async (name: 'send' | 'cancel', comment?: string) => {
    if (!order) return
    try {
      const updated = await action.mutateAsync({
        action: name,
        body: name === 'send' ? { version: order.version } : { comment, version: order.version },
      })
      setConfirm(null)
      notify.success(
        name === 'send'
          ? `Sent ${updated.number} to Initech Logistics`
          : `${updated.number} cancelled`,
        {
          description:
            name === 'send'
              ? `${updated.totalQuantity} devices · delivery ${formatDate(updated.deliveryDate)}`
              : undefined,
        },
      )
    } catch (error) {
      notify.error(name === 'send' ? 'Not sent' : 'Not cancelled', {
        description: errorText(error),
      })
    }
  }

  useShortcut('mod+enter', () => order?.availableActions.includes('send') && setConfirm('send'), {
    enabled: Boolean(order?.availableActions.includes('send')),
    description: 'Send the order',
    group: 'Screen',
  })

  if (!order) {
    return (
      <Page>
        <PageHeader title="Call-off order" />
        {query.isError ? (
          <EmptyState
            icon={FileText}
            title="This call-off order could not be loaded."
            actions={<Button onClick={() => void query.refetch()}>Retry</Button>}
          />
        ) : (
          <SkeletonRows rows={8} />
        )}
      </Page>
    )
  }

  const sendBlocked = order.status === 'draft' && !order.availableActions.includes('send')
  const blockReason = order.warnings.includes('zero_lines')
    ? WARNING_TEXT.zero_lines
    : order.warnings.includes('delivery_date_past')
      ? WARNING_TEXT.delivery_date_past
      : undefined
  const candidates = (matrix?.rows ?? [])
    .filter(
      (row) => row.article.isActive && !order.lines.some((l) => l.article.id === row.article.id),
    )
    .map((row) => ({
      value: row.article.id,
      label: `${row.article.number} · ${row.article.name}`,
      hint: row.cells[0]?.orderQty
        ? `suggested +${row.cells[0].orderQty}`
        : row.article.internalDescription,
      keywords: [row.article.internalDescription, row.article.modelNumber],
    }))
  const total = order.lines.reduce((sum, l) => sum + l.quantity, 0)

  return (
    <Page className="overflow-y-auto">
      <PageHeader
        title={`Call-off order`}
        meta={
          <span className="inline-flex items-center gap-2">
            <CopyableId value={order.number} />
            <StatusBadge entity="callOffOrderStatus" state={order.status} variant="wash" />
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" icon={ArrowLeft}>
              <Link to="/stock/call-off-orders">All orders</Link>
            </Button>
            <Button
              icon={FileSpreadsheet}
              onClick={() => void downloadGet(`/calloff-orders/${order.id}/document?format=xlsx`)}
            >
              XLSX
            </Button>
            <Button
              icon={FileText}
              onClick={() => void downloadGet(`/calloff-orders/${order.id}/document?format=pdf`)}
            >
              PDF
            </Button>
            {order.availableActions.includes('cancel') && (
              <Button icon={XCircle} onClick={() => setConfirm('cancel')}>
                Cancel order
              </Button>
            )}
            {order.status === 'draft' && canManage && (
              <Tooltip content={sendBlocked ? blockReason : undefined}>
                <span>
                  <Button
                    variant="primary"
                    icon={Send}
                    shortcut="mod+enter"
                    disabled={sendBlocked}
                    onClick={() => setConfirm('send')}
                  >
                    Send to Initech Logistics
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        }
      />
      <div className="grid gap-4 px-4 pb-6">
        {order.warnings.length > 0 && order.status === 'draft' && (
          <Banner tone="caution" icon={TriangleAlert} title="Check before sending">
            {order.warnings.map((w) => WARNING_TEXT[w] ?? w).join(' ')}
          </Banner>
        )}
        <Panel>
          <KeyValues columns={3}>
            <KeyValue label="Hub">{order.site.name}</KeyValue>
            <KeyValue label="Delivery date">{formatDate(order.deliveryDate)}</KeyValue>
            <KeyValue label="Recipient">{order.recipientEmail}</KeyValue>
            <KeyValue label="Created">
              {formatDateTime(order.createdAt)} · {order.createdBy.displayName}
            </KeyValue>
            <KeyValue label="Sent">
              {order.sentAt
                ? `${formatDateTime(order.sentAt)} · ${order.sentBy?.displayName ?? ''}`
                : null}
            </KeyValue>
            <KeyValue label="Mail">
              {order.status === 'sent' ? (
                <ScreenLink
                  to="/communications"
                  search={{
                    view: 'mail-log',
                    entityType: order.mailLogEntityRef.type,
                    entityId: order.mailLogEntityRef.id,
                  }}
                  className="inline-flex items-center gap-1 text-accent-text"
                >
                  <Icon icon={Mail} size={14} /> Open in the mail log
                </ScreenLink>
              ) : null}
            </KeyValue>
            {!editable && order.note && (
              <KeyValue label="Note" full>
                <span className="whitespace-pre-line">{order.note}</span>
              </KeyValue>
            )}
          </KeyValues>
        </Panel>
        {editable && (
          <Panel title="Order details">
            <DraftFacts key={order.version} order={order} patch={patch} />
          </Panel>
        )}
        <Panel
          title={`Lines · ${order.lineCount} articles · ${formatNumber(total)} devices`}
          actions={
            editable && (
              <div className="flex items-center gap-2">
                <Combobox<number>
                  label="Add article"
                  placeholder="Add article…"
                  options={candidates}
                  value={adding}
                  onValueChange={(articleId) => {
                    setAdding(undefined)
                    if (!articleId) return
                    const row = matrix?.rows.find((r) => r.article.id === articleId)
                    const quantity = Math.max(1, row?.cells[0]?.orderQty ?? 1)
                    void patch({ version: order.version, lines: [{ articleId, quantity }] })
                  }}
                />
                <Icon icon={Plus} size={14} className="text-fg-3" />
              </div>
            )
          }
        >
          {order.lines.length === 0 ? (
            <EmptyState icon={FileText} title="No lines yet.">
              Add articles with the picker above.
            </EmptyState>
          ) : (
            <div className="-m-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-fg-3">
                    <th className="h-8 px-4 text-left font-medium">Article</th>
                    <th className="px-2 text-right font-medium">Demand</th>
                    <th className="px-2 text-right font-medium">Stock</th>
                    <th className="px-2 text-right font-medium">Buffer</th>
                    <th className="px-2 text-right font-medium">Suggested</th>
                    <th className="px-2 text-right font-medium">Quantity</th>
                    <th className="w-20 px-4" aria-label="Warnings and actions" />
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.id} className="border-b border-line-subtle last:border-0">
                      <td className="h-row px-4">
                        <IdInk value={line.article.number} className="mr-2 text-xs" />
                        {line.article.name}
                        <span className="ml-2 text-xs text-fg-3">{line.article.modelNumber}</span>
                      </td>
                      <td className="px-2 text-right font-mono tabular-nums">{line.demandQty}</td>
                      <td className="px-2 text-right font-mono tabular-nums">{line.stockQty}</td>
                      <td className="px-2 text-right font-mono tabular-nums">{line.bufferQty}</td>
                      <td className="px-2 text-right font-mono text-fg-2 tabular-nums">
                        {line.suggestedQty}
                      </td>
                      <td className="px-2 text-right">
                        {editable ? (
                          <QuantityInput
                            line={line}
                            disabled={patchMutation.isPending}
                            onCommit={(quantity) =>
                              void patch({
                                version: order.version,
                                lines: [{ articleId: line.article.id, quantity }],
                              })
                            }
                          />
                        ) : (
                          <span className={cn('font-mono font-semibold tabular-nums')}>
                            {line.quantity}
                          </span>
                        )}
                      </td>
                      <td className="px-4">
                        <span className="flex items-center justify-end gap-1">
                          <LineWarnings line={line} />
                          {editable && (
                            <IconButton
                              size="sm"
                              icon={Trash2}
                              label={`Remove ${line.article.name}`}
                              onClick={() =>
                                void patch({
                                  version: order.version,
                                  lines: [{ articleId: line.article.id, quantity: 0 }],
                                })
                              }
                            />
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={confirm === 'send'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Send ${order.number} to Initech Logistics?`}
        description={`${order.lineCount} articles · ${formatNumber(total)} devices · delivery to ${order.site.name} on ${formatDate(order.deliveryDate)}. The order goes to ${order.recipientEmail} with the spreadsheet and PDF attached; the team mailbox gets a copy.`}
        confirmLabel="Send order"
        pending={action.isPending}
        onConfirm={() => run('send')}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Cancel ${order.number}?`}
        description="The draft is kept for the record but can no longer be sent."
        confirmLabel="Cancel order"
        cancelLabel="Keep draft"
        destructive
        comment={{ label: 'Reason (optional)', placeholder: 'Why is the order cancelled?' }}
        pending={action.isPending}
        onConfirm={(comment) => run('cancel', comment)}
      />
    </Page>
  )
}
