import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { ProgressMeter } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import type { LeaseReturnDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { businessToday, formatDate, formatFullDateTime, plural } from '@/lib/format'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { dispatchSettingsQuery, usePatchLeaseReturn } from '../api'
import { dueText, leaseChainHint } from './chain'
import { EntityMails } from './entity-mails'

const schema = z.object({
  escalationEmail: z.union([z.literal(''), z.email('Enter a valid email address.')]),
})

function EscalationEmail({ lease }: { lease: LeaseReturnDetail }) {
  const canEdit = useCan('lease.manage') && lease.status !== 'closed'
  const [editing, setEditing] = useState(false)
  const patch = usePatchLeaseReturn(lease.id)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { escalationEmail: lease.escalationEmail ?? '' },
  })
  const submit = form.handleSubmit(async ({ escalationEmail }) => {
    try {
      await patch.mutateAsync({ version: lease.version, escalationEmail: escalationEmail || null })
      setEditing(false)
    } catch (error) {
      applyServerErrors(error, form.setError, ['escalationEmail'])
    }
  })
  if (!editing)
    return (
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate">{lease.escalationEmail ?? '—'}</span>
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            aria-label="Edit escalation email"
            onClick={() => setEditing(true)}
          />
        )}
      </span>
    )
  const error =
    form.formState.errors.escalationEmail?.message ?? form.formState.errors.root?.server?.message
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Field
        label="Escalation email"
        error={error}
        help="Extra recipient of the escalation mail, e.g. the cost-centre manager."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            data-autofocus
            type="email"
            {...form.register('escalationEmail')}
          />
        )}
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" loading={patch.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Countdown({ lease }: { lease: LeaseReturnDetail }) {
  const days = lease.daysUntilRetirement
  const window = 42
  const passed = Math.max(0, Math.min(window, window - days))
  const tone = days < 0 ? 'critical' : days <= 14 ? 'caution' : 'outreach'
  return (
    <ProgressMeter
      label="Lease end"
      valueText={
        days < 0
          ? `${plural(-days, 'day')} overdue`
          : days === 0
            ? 'ends today'
            : `${plural(days, 'day')} left`
      }
      max={window}
      segments={[{ value: passed, tone }]}
    />
  )
}

export function OverviewTab({ entity: lease }: { entity: LeaseReturnDetail }) {
  const drawer = useDrawerNavigation()
  const canComms = useCan('comms.read')
  const settings = useQuery({ ...dispatchSettingsQuery, enabled: canComms }).data
  const hint = leaseChainHint(lease, settings)
  const asset = lease.asset
  return (
    <div>
      <SectionHeading>Retirement</SectionHeading>
      <div className="grid gap-2">
        <Countdown lease={lease} />
        <KeyValues>
          <KeyValue label="Retirement date">{formatDate(lease.retirementDate)}</KeyValue>
          <KeyValue label="Model">
            {lease.model}
            {lease.modelCategory && (
              <span className="block text-xs text-fg-3">{lease.modelCategory}</span>
            )}
          </KeyValue>
        </KeyValues>
      </div>

      <SectionHeading>Chain</SectionHeading>
      <KeyValues>
        <KeyValue label="Info mail">
          {lease.infoSentAt ? formatFullDateTime(lease.infoSentAt) : null}
        </KeyValue>
        <KeyValue label="Reminder 1">
          {lease.reminder1SentAt ? formatFullDateTime(lease.reminder1SentAt) : null}
        </KeyValue>
        <KeyValue label="Reminder 2">
          {lease.reminder2SentAt ? formatFullDateTime(lease.reminder2SentAt) : null}
        </KeyValue>
        <KeyValue label="Escalation">
          {lease.escalationSentAt ? formatFullDateTime(lease.escalationSentAt) : null}
        </KeyValue>
        <KeyValue label="Next step">
          {hint
            ? `${hint.label} · ${hint.manualOnly ? 'chain switched off' : dueText(hint.dueDate)}`
            : lease.status === 'imported_vip'
              ? 'VIP: no automatic mails'
              : null}
        </KeyValue>
        <KeyValue label="Paused">
          {lease.communicationPaused
            ? 'Until resumed'
            : lease.communicationResumeDate && lease.communicationResumeDate > businessToday()
              ? `Until ${formatDate(lease.communicationResumeDate)}`
              : null}
          {lease.communicationPauseReason && (
            <span className="block text-xs text-fg-3">{lease.communicationPauseReason}</span>
          )}
        </KeyValue>
        <KeyValue label="Escalation email" full>
          <EscalationEmail key={lease.version} lease={lease} />
        </KeyValue>
      </KeyValues>

      <SectionHeading>Replacement</SectionHeading>
      {lease.serviceRequest ? (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xs px-1 py-1 text-left hover:bg-hover"
          onClick={() => lease.serviceRequest && drawer.open('sr', lease.serviceRequest.id)}
        >
          <IdInk value={lease.serviceRequest.number} />
          <StatusBadge
            entity="serviceRequestStatus"
            state={lease.serviceRequest.status}
            size="sm"
          />
          <span className="ml-auto text-xs text-fg-3">
            linked {lease.linkedAt ? formatDate(lease.linkedAt) : ''}
          </span>
        </button>
      ) : (
        <p className="text-xs text-fg-3">No replacement order linked yet.</p>
      )}
      {lease.closedAt && (
        <KeyValues>
          <KeyValue label="Closed">{formatFullDateTime(lease.closedAt)}</KeyValue>
          <KeyValue label="Reason">{lease.closeReason}</KeyValue>
        </KeyValues>
      )}

      <SectionHeading>Device</SectionHeading>
      {asset ? (
        <KeyValues>
          <KeyValue label="Serial">
            <IdInk value={asset.serialNumber} whole />
          </KeyValue>
          <KeyValue label="Status">
            <StatusBadge entity="assetStatus" state={asset.status} size="sm" />
          </KeyValue>
          <KeyValue label="Location">{asset.location.name}</KeyValue>
          <KeyValue label="Article">{asset.article?.name ?? asset.model}</KeyValue>
        </KeyValues>
      ) : (
        <p className="text-xs text-fg-3">No asset with this tag is known.</p>
      )}
      <KeyValues>
        <KeyValue label="CI name">{lease.ciName}</KeyValue>
        <KeyValue label="Install status">{lease.installStatus}</KeyValue>
        <KeyValue label="Cost centre">{lease.costCenter}</KeyValue>
        <KeyValue label="Last seen in import">{formatFullDateTime(lease.lastSeenAt)}</KeyValue>
      </KeyValues>

      {canComms && (
        <>
          <SectionHeading>Mails</SectionHeading>
          <EntityMails entityType="lease_return" entityId={lease.id} revision={lease.version} />
        </>
      )}
    </div>
  )
}
