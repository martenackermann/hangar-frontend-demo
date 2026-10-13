import { useQuery } from '@tanstack/react-query'
import { Download, Paperclip } from 'lucide-react'
import { StatusBadge } from '@/components/domain/status'
import { DrawerFrame } from '@/components/drawer/drawer-frame'
import { DrawerError, DrawerLoading } from '@/components/drawer/drawer-states'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { openDownload } from '@/lib/api/downloads'
import type { EntityRef, MailLogDetail } from '@/lib/api/types'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatBytes, formatFullDateTime } from '@/lib/format'
import type { ParamDrawerDescriptor } from '@/lib/registry'
import { notify } from '@/components/ui/toast'
import { mailDetailQuery } from '../api'
import { MailBody } from '../components/mail-preview'

const TRIGGERS: Record<MailLogDetail['trigger'], string> = {
  user: 'Sent by a user',
  job: 'Daily dispatch',
  import: 'ITSM import',
  sync: 'Booking sync',
  system: 'System',
}

function EntityLink({ entity }: { entity: EntityRef }) {
  const drawer = useDrawerNavigation()
  const param =
    entity.type === 'service_request'
      ? 'sr'
      : entity.type === 'lease_return'
        ? 'lr'
        : entity.type === 'asset'
          ? 'asset'
          : null
  if (!param) return <span>{entity.label}</span>
  return (
    <button
      type="button"
      className="text-accent-fg font-mono underline-offset-2 hover:underline"
      onClick={() => drawer.open(param, entity.id)}
    >
      {entity.label}
    </button>
  )
}

function MailHead({ mail }: { mail: MailLogDetail }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg leading-6 font-semibold">
          {mail.subject ?? mail.templateName}
        </h2>
        <StatusBadge entity="mailStatus" state={mail.status} variant="wash" />
      </div>
      <p className="text-xs text-fg-3">
        {mail.templateName} · <span className="font-mono">{mail.templateId}</span>
      </p>
    </>
  )
}

function MailDrawer({ id }: { id: number }) {
  const drawer = useDrawerNavigation()
  const enums = useEnums()
  const query = useQuery(mailDetailQuery(id))
  const mail = query.data
  if (query.isError)
    return (
      <DrawerFrame label="Mail" onClose={drawer.close}>
        <DrawerError error={query.error} onRetry={() => void query.refetch()} />
      </DrawerFrame>
    )
  if (!mail)
    return (
      <DrawerFrame label="Mail" onClose={drawer.close}>
        <DrawerLoading />
      </DrawerFrame>
    )
  return (
    <DrawerFrame
      label={`Mail ${mail.subject ?? mail.templateName}`}
      onClose={drawer.close}
      head={<MailHead mail={mail} />}
    >
      <div className="px-4 pb-6">
        <KeyValues>
          <KeyValue label="To" full>
            {mail.to.join(', ')}
          </KeyValue>
          {mail.cc.length > 0 && (
            <KeyValue label="Cc" full>
              {mail.cc.join(', ')}
            </KeyValue>
          )}
          <KeyValue label="Queued">{formatFullDateTime(mail.queuedAt)}</KeyValue>
          <KeyValue label="Sent">
            {mail.sentAt
              ? formatFullDateTime(mail.sentAt)
              : enumLabel(enums, 'mailStatus', mail.status)}
          </KeyValue>
          <KeyValue label="Trigger">
            {mail.triggeredBy?.displayName ?? TRIGGERS[mail.trigger]}
          </KeyValue>
          <KeyValue label="Record">
            {mail.entity ? <EntityLink entity={mail.entity} /> : null}
          </KeyValue>
          {mail.error && (
            <KeyValue label="Error" full>
              <span className="text-tone-critical-fg">{mail.error}</span>
            </KeyValue>
          )}
        </KeyValues>
        {mail.attachments.length > 0 && (
          <>
            <SectionHeading>Attachments</SectionHeading>
            <ul className="grid gap-1" aria-label="Attachments">
              {mail.attachments.map((file) => (
                <li key={file.fileId} className="flex items-center gap-2">
                  <Icon icon={Paperclip} size={14} className="text-fg-3" />
                  <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                  <span className="text-xs text-fg-3">{formatBytes(file.sizeBytes)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    aria-label={`Download ${file.filename}`}
                    onClick={() =>
                      void openDownload(file.download).catch(() =>
                        notify.error('Download failed', {
                          description: 'The link may have expired — reopen the mail.',
                        }),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        <SectionHeading>Message</SectionHeading>
        <MailBody
          html={mail.bodyHtml}
          text={mail.bodyText}
          title={mail.subject ?? mail.templateName}
          height={520}
        />
      </div>
    </DrawerFrame>
  )
}

const descriptor: ParamDrawerDescriptor = {
  param: 'mail',
  permission: 'comms.read',
  component: MailDrawer,
}
export default descriptor
