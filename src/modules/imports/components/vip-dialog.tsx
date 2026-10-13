import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field, Input, Textarea } from '@/components/ui/input'
import { api } from '@/lib/api/client'
import type { SearchResponse, VipEntry } from '@/lib/api/types'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'
import { useSaveVip } from '../api'

/**
 * Add / edit a VIP (SCREENS.md §9.4): user id with contact lookup, names, type (suggestions
 * Board / Executive / Assistant, free text), title, note.
 */
const VIP_TYPES = ['Board', 'Executive', 'Assistant'] as const

const schema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{3,16}$/, 'The ITSM user id, e.g. E104233.'),
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().min(1, 'Required.').max(80),
  vipType: z.string().trim().min(1, 'Required.').max(40),
  title: z.string().trim().max(120),
  note: z.string().trim().max(500),
})
type FormValues = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape) as (keyof FormValues)[]

export function VipDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` = add. */
  entry: VipEntry | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <VipForm entry={entry} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function VipForm({ entry, onClose }: { entry: VipEntry | null; onClose: () => void }) {
  const save = useSaveVip(entry?.id ?? null)
  const [contact, setContact] = useState<string | null>(entry?.contact?.displayName ?? null)
  const [lookedUp, setLookedUp] = useState(Boolean(entry))
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userId: entry?.userId ?? '',
      firstName: entry?.firstName ?? '',
      lastName: entry?.lastName ?? '',
      vipType: entry?.vipType ?? '',
      title: entry?.title ?? '',
      note: entry?.note ?? '',
    },
  })
  const {
    register,
    formState: { errors },
  } = form

  const lookup = async () => {
    const userId = form.getValues('userId').trim().toUpperCase()
    if (!/^[A-Z0-9]{3,16}$/.test(userId)) return
    try {
      const result = await api.get<SearchResponse>('/search', { query: { q: userId, limit: 5 } })
      const hit = result.exact?.kind === 'contact' ? result.exact : null
      setContact(hit?.title ?? null)
      setLookedUp(true)
      if (hit && !form.getValues('lastName')) {
        const parts = hit.title.split(' ')
        form.setValue('lastName', parts.slice(-1).join(' '))
        if (!form.getValues('firstName')) form.setValue('firstName', parts.slice(0, -1).join(' '))
      }
    } catch {
      setLookedUp(false)
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        userId: values.userId.trim().toUpperCase(),
        firstName: values.firstName || null,
        lastName: values.lastName,
        vipType: values.vipType,
        title: values.title || null,
        note: values.note || null,
      })
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, FIELDS)
    }
  })
  useShortcut('mod+s', () => void onSubmit(), {
    allowInInput: true,
    allowInDialog: true,
    description: 'Save',
    group: 'Form',
  })

  return (
    <DialogContent
      title={entry ? `Edit VIP ${entry.userId}` : 'Add VIP'}
      description="VIP requests and lease returns get no automatic mails and are hidden from default lists."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void onSubmit()}>
            {entry ? 'Save' : 'Add VIP'}
          </Button>
        </>
      }
    >
      <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)} noValidate>
        <Field
          label="User id"
          required
          error={errors.userId?.message}
          help={
            lookedUp
              ? contact
                ? `Contact: ${contact}`
                : 'No contact with this user id yet — the entry applies when they are imported.'
              : 'The ITSM user id (matched against contacts).'
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              readOnly={Boolean(entry)}
              className="font-mono uppercase"
              {...register('userId', { onBlur: () => void lookup() })}
            />
          )}
        </Field>
        {lookedUp && contact && !entry && (
          <p className="-mt-1 flex items-center gap-1 text-xs text-tone-done-fg">
            <Icon icon={CircleCheck} size={12} /> Known contact
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="First name" error={errors.firstName?.message}>
            {({ id }) => <Input id={id} {...register('firstName')} />}
          </Field>
          <Field label="Last name" required error={errors.lastName?.message}>
            {({ id, invalid }) => (
              <Input id={id} aria-invalid={invalid} {...register('lastName')} />
            )}
          </Field>
          <Field
            label="Type"
            required
            error={errors.vipType?.message}
            help="Board, Executive, Assistant or your own."
          >
            {({ id, invalid }) => (
              <>
                <Input id={id} list="vip-types" aria-invalid={invalid} {...register('vipType')} />
                <datalist id="vip-types">
                  {VIP_TYPES.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Title" error={errors.title?.message}>
            {({ id }) => (
              <Input id={id} placeholder="Chief Operating Officer" {...register('title')} />
            )}
          </Field>
        </div>
        <Field label="Note" error={errors.note?.message}>
          {({ id }) => <Textarea id={id} rows={2} {...register('note')} />}
        </Field>
        {errors.root?.server && (
          <Banner tone="critical" icon={CircleAlert} title="Not saved">
            {errors.root.server.message}
          </Banner>
        )}
        <button type="submit" hidden />
      </form>
    </DialogContent>
  )
}
