import { CheckCircle2, CalendarClock, OctagonX } from 'lucide-react'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Banner } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { DeviationCode, DeviationOutcome, ServiceRequestDetail } from '@/lib/api/types'
import { useDeviationCodes } from '@/lib/api/core'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'

/**
 * On-site action forms (SCREENS.md §6.3 "Finish", SPEC §6.11): complete with recipient name,
 * handover confirmation, optional `complete` deviation and protocol mail; reschedule / cancel
 * with a deviation of the matching outcome (comment when the code requires it).
 */

function codesFor(codes: readonly DeviationCode[], outcome: DeviationOutcome) {
  return codes.filter((code) => code.outcome === outcome && code.isActive)
}

export function DeviationSelect({
  codes,
  value,
  onChange,
  placeholder,
  id,
  label,
}: {
  codes: readonly DeviationCode[]
  value: number | null
  onChange: (value: number | null) => void
  placeholder: string
  id?: string
  label?: string
}) {
  const NONE = '0'
  return (
    <Select<string>
      id={id}
      label={label}
      value={value ? String(value) : NONE}
      onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
      placeholder={placeholder}
      className="h-12 w-full"
      options={[
        { value: NONE, label: placeholder },
        ...codes.map((code) => ({
          value: String(code.id),
          label: `${code.code} · ${code.label}`,
          textValue: `${code.code} ${code.label}`,
        })),
      ]}
    />
  )
}

interface CompleteValues {
  recipientName: string
  handoverConfirmed: boolean
  deviationCodeId: number | null
  deviationComment: string
  sendProtocol: boolean
  protocolEmail: string
}

/** The Finish tab / complete dialog. `onDone` receives the completed SR detail. */
export function CompleteForm({
  sr,
  codes: codesProp,
  onDone,
  compact,
}: {
  sr: ServiceRequestDetail
  codes?: readonly DeviationCode[]
  onDone: (updated: ServiceRequestDetail) => void
  compact?: boolean
}) {
  const allCodes = useDeviationCodes()
  const codes = codesFor(codesProp ?? allCodes, 'complete')
  const mutation = useWorkflowAction('serviceRequest', sr, sr.number)
  const form = useForm<CompleteValues>({
    defaultValues: {
      recipientName: sr.contact.displayName,
      handoverConfirmed: false,
      deviationCodeId: null,
      deviationComment: '',
      sendProtocol: true,
      protocolEmail: sr.contact.email ?? '',
    },
  })
  const deviationId = useWatch({ control: form.control, name: 'deviationCodeId' })
  const sendProtocol = useWatch({ control: form.control, name: 'sendProtocol' })
  const handoverId = useId()
  const chosen = codes.find((code) => code.id === deviationId)
  const available = sr.availableActions.includes('complete_deployment')
  const blocked = sr.blockedActions.find((b) => b.action === 'complete_deployment')
  const unlockedByDeviation = blocked?.guard === 'deployment_scans_complete' && Boolean(chosen)
  const canSubmit = available || unlockedByDeviation
  const reason = !canSubmit
    ? (blocked?.reason ?? 'Completing is not possible in this status.')
    : null

  const submit = form.handleSubmit(async (values) => {
    try {
      const updated = await mutation.mutateAsync({
        action: 'complete_deployment',
        body: {
          recipientName: values.recipientName.trim(),
          handoverConfirmed: values.handoverConfirmed,
          deviationCodeId: values.deviationCodeId,
          deviationComment: values.deviationComment.trim() || null,
          sendProtocol: values.sendProtocol,
          protocolEmail: values.sendProtocol ? values.protocolEmail.trim() || null : null,
        },
      })
      onDone(updated)
    } catch (error) {
      applyServerErrors(error, form.setError, [
        'recipientName',
        'handoverConfirmed',
        'deviationCodeId',
        'deviationComment',
        'protocolEmail',
      ])
    }
  })
  useShortcut('mod+enter', () => void submit(), {
    enabled: canSubmit,
    allowInInput: true,
    description: 'Complete deployment',
    group: 'Deployment',
  })

  const errors = form.formState.errors
  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      <Field label="Recipient name" required error={errors.recipientName?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoComplete="off"
            className={compact ? undefined : 'h-12 text-md'}
            {...form.register('recipientName', { required: 'Enter the recipient name.' })}
          />
        )}
      </Field>
      <Controller
        control={form.control}
        name="handoverConfirmed"
        render={({ field }) => (
          <div className="flex min-h-12 items-center gap-3 rounded-md border border-line bg-surface px-3">
            <Checkbox
              id={handoverId}
              large
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <label htmlFor={handoverId} className="flex-1 py-3">
              Recipient confirmed the handover
            </label>
          </div>
        )}
      />
      {errors.handoverConfirmed?.message && (
        <p className="text-xs text-tone-critical-fg">{errors.handoverConfirmed.message}</p>
      )}
      <Field
        label="Deviation (optional)"
        help="Choose one when not every device could be scanned."
        error={errors.deviationCodeId?.message}
      >
        {({ id }) => (
          <Controller
            control={form.control}
            name="deviationCodeId"
            render={({ field }) => (
              <DeviationSelect
                id={id}
                codes={codes}
                value={field.value}
                onChange={field.onChange}
                placeholder="No deviation"
              />
            )}
          />
        )}
      </Field>
      {chosen && (
        <Field
          label="Deviation comment"
          required={chosen.requiresComment}
          error={errors.deviationComment?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              rows={3}
              {...form.register('deviationComment')}
            />
          )}
        </Field>
      )}
      <Controller
        control={form.control}
        name="sendProtocol"
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            label="Email protocol to"
          />
        )}
      />
      {sendProtocol && (
        <Field label="Protocol email" error={errors.protocolEmail?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...form.register('protocolEmail')}
            />
          )}
        </Field>
      )}
      {errors.root?.server?.message && (
        <Banner tone="critical" icon={OctagonX} title={errors.root.server.message} />
      )}
      {reason && <p className="text-sm text-fg-3">{reason}</p>}
      <Button
        type="submit"
        variant="primary"
        size={compact ? 'lg' : 'touch'}
        icon={CheckCircle2}
        disabled={!canSubmit}
        loading={mutation.isPending}
        title={reason ?? undefined}
        shortcut={compact ? undefined : 'mod+enter'}
      >
        Complete deployment
      </Button>
    </form>
  )
}

/** Reschedule / cancel on site with a deviation code of that outcome. */
export function DeviationActionForm({
  sr,
  action,
  codes: codesProp,
  onDone,
  onCancel,
  compact,
}: {
  sr: ServiceRequestDetail
  action: 'reschedule_on_site' | 'cancel_on_site'
  codes?: readonly DeviationCode[]
  onDone: (updated: ServiceRequestDetail) => void
  onCancel?: () => void
  compact?: boolean
}) {
  const outcome: DeviationOutcome = action === 'reschedule_on_site' ? 'reschedule' : 'cancel'
  const allCodes = useDeviationCodes()
  const codes = codesFor(codesProp ?? allCodes, outcome)
  const mutation = useWorkflowAction('serviceRequest', sr, sr.number)
  const [codeId, setCodeId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const chosen = codes.find((code) => code.id === codeId)
  const allowed = sr.availableActions.includes(action)
  const blocked = sr.blockedActions.find((b) => b.action === action)

  const run = async () => {
    const local: Record<string, string> = {}
    if (!chosen) local.deviationCodeId = 'Choose a deviation code.'
    if (chosen?.requiresComment && !comment.trim())
      local.deviationComment = `${chosen.code} requires a comment.`
    setErrors(local)
    if (Object.keys(local).length) return
    try {
      const updated = await mutation.mutateAsync({
        action,
        body: { deviationCodeId: codeId, deviationComment: comment.trim() || null },
      })
      onDone(updated)
    } catch (error) {
      const next: Record<string, string> = {}
      applyServerErrors(error, (path, value) => {
        next[String(path)] = value.message ?? 'Invalid value.'
      })
      setErrors(next)
    }
  }

  const label = action === 'reschedule_on_site' ? 'Reschedule' : 'Cancel on site'
  return (
    <div className="grid gap-4">
      <Field label="Deviation code" required error={errors.deviationCodeId}>
        {({ id }) => (
          <DeviationSelect
            id={id}
            codes={codes}
            value={codeId}
            onChange={setCodeId}
            placeholder="Choose a reason"
          />
        )}
      </Field>
      <Field
        label="Comment"
        required={chosen?.requiresComment}
        error={errors.deviationComment}
        help={chosen?.description ?? undefined}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        )}
      </Field>
      {errors['root.server'] && (
        <Banner tone="critical" icon={OctagonX} title={errors['root.server']} />
      )}
      {!allowed && (
        <p className="text-sm text-fg-3">
          {blocked?.reason ?? `${label} is not possible in this status.`}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size={compact ? 'md' : 'touch'} onClick={onCancel}>
            Back
          </Button>
        )}
        <Button
          variant={action === 'cancel_on_site' ? 'danger' : 'primary'}
          size={compact ? 'md' : 'touch'}
          icon={action === 'cancel_on_site' ? OctagonX : CalendarClock}
          disabled={!allowed}
          loading={mutation.isPending}
          onClick={() => (action === 'cancel_on_site' ? setConfirming(true) : void run())}
        >
          {label}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Cancel ${sr.number} on site?`}
        description="The request is cancelled and the new devices go back to stock. This cannot be undone from here."
        confirmLabel="Cancel on site"
        destructive
        pending={mutation.isPending}
        onConfirm={async () => {
          setConfirming(false)
          await run()
        }}
      />
    </div>
  )
}
