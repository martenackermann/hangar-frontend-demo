import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, Download, Mail, Navigation } from 'lucide-react'
import { useState } from 'react'
import { IdInk } from '@/components/domain/status'
import { notifyActionError } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { api } from '@/lib/api/client'
import { downloadFrom } from '@/lib/api/downloads'
import type { DownloadLink, ServiceRequestDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatFullDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fieldQueries, useSendProtocol } from '@/modules/field/api'

/** SR drawer › Deployment (SCREENS.md §1.5, H4): verification, deviation, protocol. */
export function DeploymentTab({ sr }: { sr: ServiceRequestDetail }) {
  const enums = useEnums()
  const canExecute = useCan('tours.execute_own')
  const stops = useQuery(fieldQueries.srTourStops(sr.id))
  const pending = stops.data?.data.find((s) => s.outcome === 'pending')
  const send = useSendProtocol()
  const [email, setEmail] = useState(sr.contact.email ?? '')
  const counted = sr.items.filter((i) => i.direction === 'collect' || i.asset !== null)

  return (
    <div className="grid gap-2">
      <SectionHeading
        actions={
          pending &&
          canExecute && (
            <Button asChild size="sm" icon={Navigation}>
              <Link
                to="/field/tours/$tourId/stops/$stopId"
                params={{ tourId: String(pending.tourId), stopId: String(pending.stopId) }}
              >
                Open deployment
              </Link>
            </Button>
          )
        }
      >
        Verification · {counted.filter((i) => i.verifiedAt).length} of {counted.length}
      </SectionHeading>
      <ul className="grid gap-1">
        {sr.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <Icon
              icon={CircleCheck}
              size={14}
              className={cn(item.verifiedAt ? 'text-tone-done' : 'text-fg-disabled')}
            />
            <span className="w-36 text-fg-2">{enumLabel(enums, 'itemSlot', item.slot)}</span>
            <IdInk value={item.asset?.assetTag ?? item.expectedAssetTag} />
            <span className="ml-auto text-xs text-fg-3">
              {item.verifiedAt
                ? `${item.verifiedBy?.displayName ?? ''} · ${formatFullDateTime(item.verifiedAt)}`
                : 'Not verified'}
            </span>
          </li>
        ))}
      </ul>
      <SectionHeading>Deviation</SectionHeading>
      {sr.deviation ? (
        <KeyValues columns={1}>
          <KeyValue label={sr.deviation.code.code}>{sr.deviation.code.label}</KeyValue>
          {sr.deviation.comment && <KeyValue label="Comment">{sr.deviation.comment}</KeyValue>}
        </KeyValues>
      ) : (
        <p className="text-sm text-fg-3">No deviation recorded.</p>
      )}
      {sr.status === 'completed' && (
        <>
          <SectionHeading>Handover protocol</SectionHeading>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={Download}
              onClick={() =>
                void downloadFrom(() =>
                  api.get<DownloadLink>(`/service-requests/${sr.id}/protocol`),
                )
              }
            >
              Download protocol
            </Button>
            {canExecute && (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  send.mutate(
                    { srId: sr.id, email: email.trim() || null },
                    { onError: (error) => notifyActionError(error) },
                  )
                }}
              >
                <Input
                  aria-label="Send the protocol to"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-56"
                />
                <Button type="submit" icon={Mail} loading={send.isPending}>
                  Send again
                </Button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
