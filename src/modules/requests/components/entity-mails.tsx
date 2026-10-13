import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/domain/status'
import { EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { formatDateTime } from '@/lib/format'
import { mailDetailQuery, mailLogQuery } from '../api'
import { MailBody } from './mail-preview'
import { Mail } from 'lucide-react'

function MailDetail({ id }: { id: number }) {
  const { data, isError } = useQuery(mailDetailQuery(id))
  if (isError) return <p className="px-3 pb-3 text-xs text-fg-3">The mail could not be loaded.</p>
  if (!data) return <SkeletonRows rows={3} />
  return (
    <div className="grid gap-2 px-3 pb-3">
      <p className="text-xs text-fg-3">
        To {data.to.join(', ')}
        {data.cc.length > 0 && ` · cc ${data.cc.join(', ')}`}
      </p>
      {data.error && <p className="text-xs text-tone-critical-fg">{data.error}</p>}
      <MailBody html={data.bodyHtml} text={data.bodyText} title={data.subject ?? data.templateName} height={360} />
    </div>
  )
}

/** Mail log of one SR / lease return, newest first, with inline previews. */
export function EntityMails({
  entityType,
  entityId,
}: {
  entityType: 'service_request' | 'lease_return'
  entityId: number
}) {
  const [open, setOpen] = useState<number | null>(null)
  const query = useQuery(mailLogQuery({ entityType, entityId, perPage: 100 }))
  const mails = query.data?.data ?? []
  if (query.isPending) return <SkeletonRows rows={3} />
  if (mails.length === 0)
    return (
      <EmptyState icon={Mail} title="No mails yet.">
        Chain mails appear here once they are sent.
      </EmptyState>
    )
  return (
    <ul className="divide-y divide-line-subtle rounded-sm border border-line" aria-label="Mails">
      {mails.map((mail) => {
        const expanded = open === mail.id
        return (
          <li key={mail.id}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : mail.id)}
              className="grid w-full grid-cols-[14px_1fr_auto] items-start gap-2 px-3 py-2 text-left hover:bg-hover"
            >
              <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} className="mt-0.5 text-fg-3" />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">{mail.subject ?? mail.templateName}</span>
                <span className="truncate text-xs text-fg-3">
                  {mail.templateName} · {formatDateTime(mail.sentAt ?? mail.queuedAt)}
                  {mail.triggeredBy ? ` · ${mail.triggeredBy.displayName}` : mail.trigger === 'job' ? ' · daily dispatch' : ''}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {mail.attachmentCount > 0 && <Icon icon={Paperclip} size={12} className="text-fg-3" />}
                <StatusBadge entity="mailStatus" state={mail.status} size="sm" />
              </span>
            </button>
            {expanded && <MailDetail id={mail.id} />}
          </li>
        )
      })}
    </ul>
  )
}
