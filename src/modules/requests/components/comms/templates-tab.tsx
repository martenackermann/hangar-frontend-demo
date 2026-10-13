import { useQuery } from '@tanstack/react-query'
import { Eye, FileText, Search, X } from 'lucide-react'
import { useState } from 'react'
import type { SearchPatch } from '@/components/data-table/filter-bar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState, FlagBadge, SkeletonRows } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type { LeaseReturnListItem, Page } from '@/lib/api/types'
import { formatNumber } from '@/lib/format'
import {
  srByNumber,
  templatePreviewQuery,
  templatesQuery,
  type NotificationTemplateInfoExt,
} from '@/modules/requests/api'
import type { CommsSearch } from '@/modules/requests/search'
import { MailBody } from '../mail-preview'

const OWNER_LABELS: Record<string, string> = {
  h1: 'Requests & Comms',
  h2: 'Import',
  h3: 'Warehouse',
  h4: 'Field service',
  h5: 'Stock',
  core: 'Platform',
}

interface PreviewEntity {
  type: 'service_request' | 'lease_return'
  id: number
  label: string
}

function entityTypeOf(template: NotificationTemplateInfoExt): PreviewEntity['type'] | null {
  if (template.entityType) return template.entityType
  if (template.id.startsWith('sr.')) return 'service_request'
  if (template.id.startsWith('lease.')) return 'lease_return'
  return null
}

async function resolveEntity(type: PreviewEntity['type'], value: string): Promise<PreviewEntity> {
  const needle = value.trim()
  if (type === 'service_request') {
    const sr = await srByNumber(needle.toUpperCase())
    return { type, id: sr.id, label: sr.number }
  }
  const page = await api.get<Page<LeaseReturnListItem>>('/lease-returns', {
    query: { q: needle, includeClosed: true, vip: 'include', perPage: 1 },
  })
  const lease = page.data[0]
  if (!lease) throw new Error(`No lease return matches “${needle}”.`)
  return { type, id: lease.id, label: lease.assetTag }
}

function TemplatePreview({ template }: { template: NotificationTemplateInfoExt }) {
  const type = entityTypeOf(template)
  const [entity, setEntity] = useState<PreviewEntity | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const preview = useQuery(templatePreviewQuery(template.id, entity))

  const resolve = () => {
    if (!type || !value.trim()) return
    setResolving(true)
    setError(null)
    resolveEntity(type, value)
      .then(setEntity)
      .catch((e: unknown) =>
        setError(
          isApiError(e)
            ? (e.detail ?? e.title)
            : e instanceof Error
              ? e.message
              : 'Could not find that record.',
        ),
      )
      .finally(() => setResolving(false))
  }

  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-3">Trigger</dt>
        <dd>{template.trigger}</dd>
        <dt className="text-fg-3">Recipients</dt>
        <dd>{template.recipients}</dd>
        <dt className="text-fg-3">Subject</dt>
        <dd className="font-mono text-xs">{template.subjectTemplate}</dd>
      </dl>
      {type && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            resolve()
          }}
        >
          <Field
            className="flex-1"
            label={type === 'service_request' ? 'Preview with SR…' : 'Preview with lease return…'}
            error={error ?? undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={type === 'service_request' ? 'SR0012345' : 'Asset tag, e.g. GX100044'}
                className="font-mono"
              />
            )}
          </Field>
          <Button type="submit" icon={Search} loading={resolving} disabled={!value.trim()}>
            Render
          </Button>
          {entity && (
            <Button
              variant="ghost"
              icon={X}
              onClick={() => {
                setEntity(null)
                setValue('')
              }}
            >
              Sample
            </Button>
          )}
        </form>
      )}
      <p className="text-xs text-fg-3">
        {entity ? `Rendered with ${entity.label}. ` : 'Rendered with sample data. '}
        Previews never send a mail.
      </p>
      {preview.isError ? (
        <p className="text-sm text-tone-critical-fg">
          {isApiError(preview.error)
            ? (preview.error.detail ?? preview.error.title)
            : 'The preview could not be rendered.'}
        </p>
      ) : !preview.data ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="grid gap-2">
          <p className="font-medium">{preview.data.subject}</p>
          <MailBody
            html={preview.data.html}
            text={preview.data.text}
            title={preview.data.subject}
            height={460}
          />
        </div>
      )}
    </div>
  )
}

export function TemplatesTab({
  search,
  onSearch,
}: {
  search: CommsSearch
  onSearch: (patch: SearchPatch, replace?: boolean) => void
}) {
  const query = useQuery(templatesQuery)
  const templates = query.data?.data ?? []
  const open = templates.find((t) => t.id === search.template)
  const groups = Object.entries(
    templates.reduce<Record<string, NotificationTemplateInfoExt[]>>((acc, template) => {
      ;(acc[template.owner] ??= []).push(template)
      return acc
    }, {}),
  ).sort(([a], [b]) => (a === 'h1' ? -1 : b === 'h1' ? 1 : a.localeCompare(b)))

  if (query.isPending)
    return (
      <div className="p-4">
        <SkeletonRows rows={8} />
      </div>
    )
  if (templates.length === 0) return <EmptyState icon={FileText} title="No templates registered." />

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 max-md:px-3">
      {groups.map(([owner, items]) => (
        <section key={owner} aria-label={OWNER_LABELS[owner] ?? owner} className="mt-3">
          <h2 className="mb-2 text-xs font-semibold text-fg-2">{OWNER_LABELS[owner] ?? owner}</h2>
          <ul className="divide-y divide-line-subtle rounded-sm border border-line bg-surface">
            {items.map((template) => (
              <li
                key={template.id}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_72px_auto] items-center gap-3 px-3 py-2 max-lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{template.name}</p>
                  <p className="truncate font-mono text-xs text-fg-3">{template.id}</p>
                </div>
                <p
                  className="truncate text-xs text-fg-2 max-lg:hidden"
                  title={template.subjectTemplate}
                >
                  {template.subjectTemplate}
                </p>
                <p
                  className="truncate text-xs text-fg-3 max-lg:hidden"
                  title={`${template.trigger} · ${template.recipients}`}
                >
                  {template.trigger}
                </p>
                <p
                  className="text-right font-mono text-xs max-lg:hidden"
                  title="Sent in the last 7 days"
                >
                  {template.sentLast7Days > 0 ? (
                    formatNumber(template.sentLast7Days)
                  ) : (
                    <span className="text-fg-3">0</span>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Eye}
                  onClick={() => onSearch({ template: template.id })}
                >
                  Preview
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Dialog
        open={Boolean(open)}
        onOpenChange={(next) => !next && onSearch({ template: undefined }, true)}
      >
        {open && (
          <DialogContent
            title={open.name}
            description={
              <span className="flex items-center gap-2">
                <span className="font-mono">{open.id}</span>
                <FlagBadge>{formatNumber(open.sentLast7Days)} sent in 7 days</FlagBadge>
              </span>
            }
            className="w-[min(720px,calc(100vw-24px))]"
          >
            <TemplatePreview key={open.id} template={open} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
