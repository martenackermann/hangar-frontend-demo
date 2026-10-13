import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CircleAlert, Lock, MailCheck, RefreshCw, Save } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Banner, SkeletonRows } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { Page, PageHeader, Panel } from '@/components/ui/page'
import type { DispatchSettings, DispatchSettingsInput } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { formatFullDateTime } from '@/lib/format'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'
import { dispatchSettingsQuery, useSaveDispatchSettings } from '@/modules/requests/api'

/** SPEC §5.2 ranges (mirrors the backend CHECK constraints). */
const RANGES = {
  leaseInfoDaysBeforeRetirement: [1, 365],
  leaseReminder1AfterDays: [1, 60],
  leaseReminder2AfterDays: [1, 60],
  leaseEscalationAfterDays: [1, 60],
  srInviteAfterImportDays: [0, 30],
  srReminder1AfterDays: [1, 60],
  srReminder2AfterDays: [1, 60],
  srEscalationAfterDays: [1, 60],
  maxMailsPerRun: [1, 5000],
} as const

type NumberKey = keyof typeof RANGES

function days(key: NumberKey) {
  const [min, max] = RANGES[key]
  return z
    .number({ error: 'Enter a whole number.' })
    .int('Enter a whole number.')
    .min(min, `Between ${min} and ${max}.`)
    .max(max, `Between ${min} and ${max}.`)
}

const schema = z.object({
  leaseMailsEnabled: z.boolean(),
  leaseInfoDaysBeforeRetirement: days('leaseInfoDaysBeforeRetirement'),
  leaseReminder1AfterDays: days('leaseReminder1AfterDays'),
  leaseReminder2AfterDays: days('leaseReminder2AfterDays'),
  leaseEscalationAfterDays: days('leaseEscalationAfterDays'),
  srMailsEnabled: z.boolean(),
  srInviteAfterImportDays: days('srInviteAfterImportDays'),
  srReminder1AfterDays: days('srReminder1AfterDays'),
  srReminder2AfterDays: days('srReminder2AfterDays'),
  srEscalationAfterDays: days('srEscalationAfterDays'),
  hardwareUnavailableMailEnabled: z.boolean(),
  rescheduleMailEnabled: z.boolean(),
  maxMailsPerRun: days('maxMailsPerRun'),
}) satisfies z.ZodType<DispatchSettingsInput>

type Values = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape) as (keyof Values)[]

function toValues(settings: DispatchSettings): Values {
  return Object.fromEntries(FIELDS.map((key) => [key, settings[key]])) as Values
}

function NumberField({
  control,
  name,
  label,
  unit,
  help,
  disabled,
}: {
  control: Control<Values>
  name: NumberKey
  label: string
  unit: string
  help?: string
  disabled: boolean
}) {
  const [min, max] = RANGES[name]
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          label={label}
          help={help ?? `${min}–${max} ${unit}`}
          error={fieldState.error?.message}
        >
          {({ id, describedBy, invalid }) => (
            <div className="flex items-center gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={1}
                disabled={disabled}
                invalid={invalid}
                frameClassName="w-24"
                className="font-mono"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={Number.isNaN(field.value) ? '' : field.value}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === '' ? Number.NaN : event.target.valueAsNumber,
                  )
                }
              />
              <span className="text-xs text-fg-3">
                {name === 'maxMailsPerRun' ? 'mails' : 'days'}
              </span>
            </div>
          )}
        </Field>
      )}
    />
  )
}

function SwitchField({
  control,
  name,
  label,
  disabled,
}: {
  control: Control<Values>
  name:
    | 'leaseMailsEnabled'
    | 'srMailsEnabled'
    | 'hardwareUnavailableMailEnabled'
    | 'rescheduleMailEnabled'
  label: string
  disabled: boolean
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Switch
          checked={field.value}
          onCheckedChange={field.onChange}
          label={label}
          disabled={disabled}
        />
      )}
    />
  )
}

function n(value: number): string {
  return Number.isFinite(value) ? String(value) : '?'
}

/** "Info 42 d before retirement → Reminder 1 +7 d → …" */
function Timeline({ steps, off }: { steps: { label: string; when: string }[]; off: boolean }) {
  return (
    <ol
      aria-label="Timeline preview"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-sm bg-sunken px-3 py-2 text-xs text-fg-2"
    >
      {off && <li className="mr-1 font-medium text-tone-caution-fg">Off — manual sends only:</li>}
      {steps.map((step, index) => (
        <li key={step.label} className="inline-flex items-center gap-1.5">
          {index > 0 && <ArrowRight size={12} className="text-fg-3" aria-hidden />}
          <span className="font-medium text-fg">{step.label}</span>
          <span className="text-fg-3">{step.when}</span>
        </li>
      ))}
    </ol>
  )
}

function LeaseTimeline({ control }: { control: Control<Values> }) {
  const [on, info, r1, r2, esc] = useWatch({
    control,
    name: [
      'leaseMailsEnabled',
      'leaseInfoDaysBeforeRetirement',
      'leaseReminder1AfterDays',
      'leaseReminder2AfterDays',
      'leaseEscalationAfterDays',
    ],
  })
  return (
    <Timeline
      off={!on}
      steps={[
        { label: 'Info', when: `${n(info)} d before retirement` },
        { label: 'Reminder 1', when: `+${n(r1)} d` },
        { label: 'Reminder 2', when: `+${n(r2)} d` },
        { label: 'Escalation', when: `+${n(esc)} d` },
      ]}
    />
  )
}

function SrTimeline({ control }: { control: Control<Values> }) {
  const [on, invite, r1, r2, esc] = useWatch({
    control,
    name: [
      'srMailsEnabled',
      'srInviteAfterImportDays',
      'srReminder1AfterDays',
      'srReminder2AfterDays',
      'srEscalationAfterDays',
    ],
  })
  return (
    <Timeline
      off={!on}
      steps={[
        {
          label: 'Invitation',
          when: invite === 0 ? 'on import day' : `${n(invite)} d after import`,
        },
        { label: 'Reminder 1', when: `+${n(r1)} d` },
        { label: 'Reminder 2', when: `+${n(r2)} d` },
        { label: 'Escalation', when: `+${n(esc)} d` },
      ]}
    />
  )
}

function SettingsForm({ settings }: { settings: DispatchSettings }) {
  const canEdit = useCan('comms.settings')
  const canDispatch = useCan('comms.dispatch')
  const save = useSaveDispatchSettings()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(settings),
    mode: 'onTouched',
  })
  const { control, formState } = form
  const disabled = !canEdit

  useEffect(() => {
    form.reset(toValues(settings))
  }, [settings, form])

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values)
    } catch (error) {
      applyServerErrors(error, form.setError, FIELDS)
    }
  })
  useShortcut('mod+s', () => void submit(), {
    enabled: canEdit,
    allowInInput: true,
    description: 'Save dispatch settings',
    group: 'Forms',
  })

  return (
    <form
      className="grid max-w-[880px] gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {!canEdit && (
        <Banner tone="intake" icon={Lock} title="Read only">
          Changing the dispatch settings needs the “dispatch settings” permission.
        </Banner>
      )}
      {formState.errors.root?.server && (
        <Banner tone="critical" icon={CircleAlert} title="Not saved">
          {formState.errors.root.server.message}
        </Banner>
      )}
      <Panel
        title="Lease returns"
        actions={
          <SwitchField
            control={control}
            name="leaseMailsEnabled"
            label="Automatic mails"
            disabled={disabled}
          />
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            <NumberField
              control={control}
              name="leaseInfoDaysBeforeRetirement"
              label="Info mail"
              unit="days before retirement"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="leaseReminder1AfterDays"
              label="Reminder 1"
              unit="days after info"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="leaseReminder2AfterDays"
              label="Reminder 2"
              unit="days after reminder 1"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="leaseEscalationAfterDays"
              label="Escalation"
              unit="days after reminder 2"
              disabled={disabled}
            />
          </div>
          <LeaseTimeline control={control} />
        </div>
      </Panel>
      <Panel
        title="Service requests"
        actions={
          <SwitchField
            control={control}
            name="srMailsEnabled"
            label="Automatic mails"
            disabled={disabled}
          />
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            <NumberField
              control={control}
              name="srInviteAfterImportDays"
              label="Invitation"
              unit="days after import"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="srReminder1AfterDays"
              label="Reminder 1"
              unit="days after invitation"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="srReminder2AfterDays"
              label="Reminder 2"
              unit="days after reminder 1"
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="srEscalationAfterDays"
              label="Escalation"
              unit="days after reminder 2"
              disabled={disabled}
            />
          </div>
          <SrTimeline control={control} />
        </div>
      </Panel>
      <Panel title="Other">
        <div className="grid gap-3">
          <SwitchField
            control={control}
            name="hardwareUnavailableMailEnabled"
            label="Mail the employee when their hardware is unavailable (once per order)"
            disabled={disabled}
          />
          <SwitchField
            control={control}
            name="rescheduleMailEnabled"
            label="Mail a new booking link when an appointment has to be rescheduled"
            disabled={disabled}
          />
          <NumberField
            control={control}
            name="maxMailsPerRun"
            label="Max mails per run"
            unit="mails"
            help="1–5000 · the rest waits for the next run"
            disabled={disabled}
          />
        </div>
      </Panel>
      <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <p className="text-xs text-fg-3">
          Next scheduled run {formatFullDateTime(settings.nextScheduledRunAt)}
          <br />
          Last changed {formatFullDateTime(settings.updatedAt)}
          {settings.updatedBy && ` by ${settings.updatedBy.displayName}`}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {canDispatch && (
            <Button variant="ghost" icon={MailCheck} asChild>
              <Link to="/communications" search={{ view: 'dispatch-runs', preview: true }}>
                Dry run now
              </Link>
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant="ghost"
                disabled={!formState.isDirty}
                onClick={() => form.reset(toValues(settings))}
              >
                Discard
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={Save}
                shortcut="mod+s"
                loading={save.isPending}
                disabled={!formState.isDirty}
              >
                Save
              </Button>
            </>
          )}
        </div>
      </footer>
    </form>
  )
}

/** Admin › Dispatch settings (SCREENS.md §9.5). */
export function DispatchSettingsPage() {
  const query = useQuery(dispatchSettingsQuery)
  return (
    <Page>
      <PageHeader
        title="Dispatch settings"
        meta="Timing and switches of the automatic mail chains"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 max-md:px-3">
        {query.isError ? (
          <Banner
            tone="critical"
            icon={CircleAlert}
            title="The settings could not be loaded"
            actions={
              <Button size="sm" icon={RefreshCw} onClick={() => void query.refetch()}>
                Retry
              </Button>
            }
          />
        ) : query.data ? (
          <SettingsForm settings={query.data} />
        ) : (
          <SkeletonRows rows={8} />
        )}
      </div>
    </Page>
  )
}
