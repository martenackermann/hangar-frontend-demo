import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Lock } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Banner } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useSites } from '@/lib/api/core'
import type { Role, UserSummary } from '@/lib/api/types'
import { useMe } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'
import { useCreateUser, useResetPassword, useUpdateUser } from '../api'

/** User dialogs (SCREENS.md §9.6): create, edit (names, role, home site), reset password. */
const ROLES: Role[] = ['viewer', 'technician', 'dispatcher', 'admin']
const NO_SITE = 'none'

const editSchema = z.object({
  firstName: z.string().trim().min(1, 'Required.').max(80),
  lastName: z.string().trim().min(1, 'Required.').max(80),
  role: z.enum(['viewer', 'technician', 'dispatcher', 'admin']),
  homeSiteId: z.string(),
})
const createSchema = editSchema.extend({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z.string().min(8, 'At least 8 characters.').max(128),
})
type CreateValues = z.infer<typeof createSchema>

export function UserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` = new user. */
  user: UserSummary | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <UserForm user={user} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function UserForm({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const enums = useEnums()
  const sites = useSites()
  const me = useMe()
  const create = useCreateUser()
  const update = useUpdateUser(user?.id ?? 0)
  const roleLocked = user !== null && (user.isDemoPersona || user.id === me?.id)
  const form = useForm<CreateValues>({
    resolver: zodResolver(
      user ? editSchema.extend({ email: z.string(), password: z.string() }) : createSchema,
    ),
    defaultValues: {
      email: user?.email ?? '',
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      role: user?.role ?? 'dispatcher',
      homeSiteId: user?.homeSite ? String(user.homeSite.id) : NO_SITE,
      password: '',
    },
  })
  const {
    register,
    control,
    formState: { errors },
  } = form

  const onSubmit = form.handleSubmit(async (values) => {
    const homeSiteId = values.homeSiteId === NO_SITE ? null : Number(values.homeSiteId)
    try {
      if (user) {
        await update.mutateAsync({
          firstName: values.firstName,
          lastName: values.lastName,
          ...(roleLocked ? {} : { role: values.role }),
          homeSiteId,
        })
      } else {
        await create.mutateAsync({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role,
          homeSiteId,
          password: values.password,
        })
      }
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, [
        'email',
        'firstName',
        'lastName',
        'role',
        'homeSiteId',
        'password',
      ])
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
      title={user ? `Edit ${user.displayName}` : 'New user'}
      description={user ? user.email : 'The user signs in with this email and password.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            onClick={() => void onSubmit()}
          >
            {user ? 'Save' : 'Create user'}
          </Button>
        </>
      }
    >
      <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)} noValidate>
        {!user && (
          <Field label="Email" required error={errors.email?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                type="email"
                aria-invalid={invalid}
                autoComplete="off"
                {...register('email')}
              />
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="First name" required error={errors.firstName?.message}>
            {({ id, invalid }) => (
              <Input id={id} aria-invalid={invalid} {...register('firstName')} />
            )}
          </Field>
          <Field label="Last name" required error={errors.lastName?.message}>
            {({ id, invalid }) => (
              <Input id={id} aria-invalid={invalid} {...register('lastName')} />
            )}
          </Field>
          <Field
            label="Role"
            error={errors.role?.message}
            help={
              roleLocked
                ? user?.isDemoPersona
                  ? 'Demo personas keep their role.'
                  : 'You cannot change your own role.'
                : undefined
            }
          >
            {({ id }) => (
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select<Role>
                    id={id}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={roleLocked}
                    options={ROLES.map((value) => ({
                      value,
                      label: enumLabel(enums, 'role', value),
                    }))}
                  />
                )}
              />
            )}
          </Field>
          <Field label="Home site" error={errors.homeSiteId?.message}>
            {({ id }) => (
              <Controller
                control={control}
                name="homeSiteId"
                render={({ field }) => (
                  <Select<string>
                    id={id}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={[
                      { value: NO_SITE, label: 'None' },
                      ...sites.map((site) => ({ value: String(site.id), label: site.name })),
                    ]}
                  />
                )}
              />
            )}
          </Field>
        </div>
        {!user && (
          <Field
            label="Initial password"
            required
            error={errors.password?.message}
            help="At least 8 characters; share it securely."
          >
            {({ id, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-invalid={invalid}
                {...register('password')}
              />
            )}
          </Field>
        )}
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

// ---- reset password ------------------------------------------------------------------------------

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, 'At least 8 characters.').max(128),
    repeat: z.string(),
  })
  .refine((v) => v.newPassword === v.repeat, { path: ['repeat'], message: 'Does not match.' })
type PasswordValues = z.infer<typeof passwordSchema>

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: UserSummary | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      {user && <ResetForm user={user} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function ResetForm({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const reset = useResetPassword(user.id)
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', repeat: '' },
  })
  const {
    register,
    formState: { errors },
  } = form
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await reset.mutateAsync(values.newPassword)
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['newPassword'])
    }
  })

  return (
    <DialogContent
      title={`Reset password · ${user.displayName}`}
      description="The user signs in with the new password from now on."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={reset.isPending}
            disabled={user.isDemoPersona}
            onClick={() => void onSubmit()}
          >
            Set password
          </Button>
        </>
      }
    >
      {user.isDemoPersona ? (
        <p className="flex items-center gap-2 text-sm text-fg-2">
          <Icon icon={Lock} size={14} /> Demo personas always use the demo password.
        </p>
      ) : (
        <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)} noValidate>
          <Field label="New password" required error={errors.newPassword?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-invalid={invalid}
                {...register('newPassword')}
              />
            )}
          </Field>
          <Field label="Repeat" required error={errors.repeat?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-invalid={invalid}
                {...register('repeat')}
              />
            )}
          </Field>
          {errors.root?.server && (
            <Banner tone="critical" icon={CircleAlert} title="Not saved">
              {errors.root.server.message}
            </Banner>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </DialogContent>
  )
}
