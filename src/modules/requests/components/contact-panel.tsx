import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Crown, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { IdInk, StatusBadge } from '@/components/domain/status'
import { useDrawerNavigation } from '@/components/drawer/drawer-state'
import { Button } from '@/components/ui/button'
import { Banner, SkeletonRows } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/input'
import { KeyValue, KeyValues, SectionHeading } from '@/components/ui/page'
import { Select } from '@/components/ui/select'
import type { ContactDetail, Gender } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'
import { contactQuery, usePatchContact } from '../api'

const GENDERS: readonly Gender[] = ['female', 'male', 'diverse', 'unspecified']

const schema = z.object({
  email: z.union([z.literal(''), z.email('Enter a valid email address.')]),
  phone: z.string().max(40),
  mobile: z.string().max(40),
  department: z.string().max(120),
  gender: z.enum(['female', 'male', 'diverse', 'unspecified']),
  street: z.string().max(160),
  zip: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\d{4,5}$/.test(v.replace(/\D/g, '')),
      'Enter a 4- or 5-digit zip code.',
    ),
  city: z.string().max(80),
  building: z.string().max(40),
  room: z.string().max(40),
})
type Values = z.infer<typeof schema>
const FIELDS = [
  'email',
  'phone',
  'mobile',
  'department',
  'gender',
  'street',
  'zip',
  'city',
  'building',
  'room',
] as const

function ContactForm({ contact, onClose }: { contact: ContactDetail; onClose: () => void }) {
  const enums = useEnums()
  const patch = usePatchContact(contact.id)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      mobile: contact.mobile ?? '',
      department: contact.department ?? '',
      gender: contact.gender,
      street: contact.address.street ?? '',
      zip: contact.address.zip ?? '',
      city: contact.address.city ?? '',
      building: contact.address.building ?? '',
      room: contact.address.room ?? '',
    },
  })
  const errors = form.formState.errors
  const submit = form.handleSubmit(async (values) => {
    const body: Record<string, string | null> = {}
    for (const key of FIELDS) {
      if (form.formState.dirtyFields[key]) {
        const value = values[key].trim()
        body[key] = key === 'gender' ? value : value || null
      }
    }
    try {
      await patch.mutateAsync(body)
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, FIELDS)
    }
  })
  useShortcut('mod+s', () => void submit(), {
    allowInInput: true,
    description: 'Save',
    group: 'Forms',
  })

  const text = (name: Exclude<(typeof FIELDS)[number], 'gender'>, label: string) => (
    <Field label={label} error={errors[name]?.message}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          {...form.register(name)}
        />
      )}
    </Field>
  )
  return (
    <form
      className="grid grid-cols-2 gap-3 max-md:grid-cols-1"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="col-span-full">{text('email', 'Email')}</div>
      {text('phone', 'Phone')}
      {text('mobile', 'Mobile')}
      {text('department', 'Department')}
      <Field label="Salutation">
        {() => (
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <Select
                label="Salutation"
                value={field.value}
                onValueChange={field.onChange}
                options={GENDERS.map((g) => ({ value: g, label: enumLabel(enums, 'gender', g) }))}
                className="w-full"
              />
            )}
          />
        )}
      </Field>
      <div className="col-span-full">{text('street', 'Street')}</div>
      {text('zip', 'Zip')}
      {text('city', 'City')}
      {text('building', 'Building')}
      {text('room', 'Room')}
      {errors.root?.server && (
        <p role="alert" className="col-span-full text-xs text-tone-critical-fg">
          {errors.root.server.message}
        </p>
      )}
      <div className="col-span-full flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={patch.isPending} shortcut="mod+s">
          Save
        </Button>
      </div>
    </form>
  )
}

/** Contact facts, VIP info, the user's other requests and lease returns, edit (contacts.update). */
export function ContactPanel({
  contactId,
  current,
}: {
  contactId: number
  /** The record the drawer shows (left out of "other" lists). */
  current: { kind: 'sr' | 'lr'; id: number }
}) {
  const enums = useEnums()
  const drawer = useDrawerNavigation()
  const canEdit = useCan('contacts.update')
  const [editing, setEditing] = useState(false)
  const query = useQuery(contactQuery(contactId))
  const contact = query.data
  if (!contact)
    return query.isError ? (
      <p className="text-sm text-fg-3">The contact could not be loaded.</p>
    ) : (
      <SkeletonRows rows={5} />
    )
  const otherSrs = contact.serviceRequests.filter(
    (s) => !(current.kind === 'sr' && s.id === current.id),
  )
  const otherLeases = contact.leaseReturns.filter(
    (l) => !(current.kind === 'lr' && l.id === current.id),
  )
  const address = contact.address

  return (
    <div>
      {contact.vip && (
        <Banner
          tone="outreach"
          icon={Crown}
          title={`VIP · ${contact.vip.vipType}`}
          className="mb-3"
        >
          {contact.vip.title ?? 'Handled personally; no automatic mails.'}
        </Banner>
      )}
      <SectionHeading
        actions={
          canEdit &&
          !editing && (
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        {contact.displayName}
      </SectionHeading>
      {editing ? (
        <ContactForm contact={contact} onClose={() => setEditing(false)} />
      ) : (
        <KeyValues>
          <KeyValue label="User id">
            <IdInk value={contact.userId} whole />
          </KeyValue>
          <KeyValue label="Email">
            {contact.email ? (
              <a className="text-accent-text hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            ) : (
              <span className="text-tone-caution-fg">Missing — no mails can be sent</span>
            )}
          </KeyValue>
          <KeyValue label="Phone">{contact.phone}</KeyValue>
          <KeyValue label="Mobile">{contact.mobile}</KeyValue>
          <KeyValue label="Department">{contact.department}</KeyValue>
          <KeyValue label="Salutation">{enumLabel(enums, 'gender', contact.gender)}</KeyValue>
          <KeyValue label="Address" full>
            {[address.street, [address.zip, address.city].filter(Boolean).join(' ')]
              .filter(Boolean)
              .join(', ') || null}
            {(address.building ?? address.room) && (
              <span className="block text-xs text-fg-3">
                {[
                  address.building && `Building ${address.building}`,
                  address.room && `Room ${address.room}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </KeyValue>
        </KeyValues>
      )}
      <SectionHeading>Other service requests</SectionHeading>
      {otherSrs.length === 0 ? (
        <p className="text-xs text-fg-3">None.</p>
      ) : (
        <ul className="grid gap-1">
          {otherSrs.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xs px-1 py-1 text-left hover:bg-hover"
                onClick={() => drawer.open('sr', s.id)}
              >
                <IdInk value={s.number} />
                <StatusBadge entity="serviceRequestStatus" state={s.status} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SectionHeading>Lease returns</SectionHeading>
      {otherLeases.length === 0 ? (
        <p className="text-xs text-fg-3">None.</p>
      ) : (
        <ul className="grid gap-1">
          {otherLeases.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xs px-1 py-1 text-left hover:bg-hover"
                onClick={() => drawer.open('lr', l.id)}
              >
                <IdInk value={l.assetTag} whole />
                <StatusBadge entity="leaseReturnStatus" state={l.status} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
