import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, Send } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { SkeletonRows } from '@/components/ui/feedback'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { notify } from '@/components/ui/toast'
import type { ServiceRequestDetail } from '@/lib/api/types'
import { formatDate } from '@/lib/format'
import { dispatchSettingsQuery, templatePreviewQuery } from '../api'
import { dueText, srChainHint } from './chain'
import { EntityMails } from './entity-mails'
import { MailBody } from './mail-preview'

const NEXT_TEMPLATE: Record<string, string> = {
  send_invitation: 'sr.invitation',
  send_campus_info: 'sr.campus_info',
  send_reminder_1: 'sr.reminder_1',
  send_reminder_2: 'sr.reminder_2',
  escalate: 'sr.escalation',
}

function NextMailPreview({ templateId, srId }: { templateId: string; srId: number }) {
  const { data, isError } = useQuery(
    templatePreviewQuery(templateId, { type: 'service_request', id: srId }),
  )
  if (isError) return <p className="text-xs text-fg-3">The preview could not be rendered.</p>
  if (!data) return <SkeletonRows rows={3} />
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{data.subject}</p>
      <MailBody html={data.html} text={data.text} title={data.subject} height={360} />
    </div>
  )
}

export function CommunicationTab({ entity: sr }: { entity: ServiceRequestDetail }) {
  const settings = useQuery(dispatchSettingsQuery).data
  const hint = srChainHint(sr, settings)
  const next = useWorkflowAction('serviceRequest', sr, sr.number)
  const [preview, setPreview] = useState(false)
  const template = hint ? NEXT_TEMPLATE[hint.action] : undefined
  const canSendNext = sr.availableActions.includes('send_next_mail')
  const blocked = sr.blockedActions.find((b) => b.action === 'send_next_mail')

  return (
    <div>
      <SectionHeading
        actions={
          <>
            {template && (
              <Button size="sm" variant="ghost" icon={Eye} onClick={() => setPreview((v) => !v)}>
                {preview ? 'Hide preview' : 'Preview next mail'}
              </Button>
            )}
            {(canSendNext || blocked) && (
              <Button
                size="sm"
                variant="secondary"
                icon={Send}
                disabled={!canSendNext}
                title={blocked?.reason}
                loading={next.isPending}
                onClick={() => next.mutate({ action: 'send_next_mail' })}
              >
                Send next mail
              </Button>
            )}
          </>
        }
      >
        Chain
      </SectionHeading>
      <KeyValues>
        <KeyValue label="Last mail">
          {sr.communicationDate ? formatDate(sr.communicationDate) : null}
        </KeyValue>
        <KeyValue label="Next step">
          {hint
            ? `${hint.label} · ${hint.manualOnly ? 'chain switched off' : dueText(hint.dueDate)}`
            : null}
        </KeyValue>
        <KeyValue label="Booking link" full>
          {sr.bookingLink ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs">{sr.bookingLink}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                aria-label="Copy booking link"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(sr.bookingLink ?? '')
                    .then(() => notify.success('Booking link copied', { duration: 2000 }))
                }
              />
            </span>
          ) : sr.isCampus ? (
            'Campus: a technician calls the employee'
          ) : (
            'No booking link — the region is unresolved'
          )}
        </KeyValue>
      </KeyValues>
      {preview && template && (
        <div className="mt-3">
          <NextMailPreview templateId={template} srId={sr.id} />
        </div>
      )}
      <SectionHeading>Mails</SectionHeading>
      <EntityMails entityType="service_request" entityId={sr.id} revision={sr.version} />
    </div>
  )
}
