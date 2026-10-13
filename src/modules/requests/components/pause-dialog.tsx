import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { businessToday } from '@/lib/format'
import { applyServerErrors } from '@/lib/forms/server-errors'
import { useShortcut } from '@/lib/shortcuts'

/**
 * Pause communication (SPEC §4.1.1 #11, API.md §3.8 `{ reason, resumeDate? }`): with a date the
 * chain resumes then, without one it stays paused until "Resume communication".
 */
const schema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.').max(500, 'At most 500 characters.'),
  resumeDate: z
    .string()
    .optional()
    .refine((value) => !value || value > businessToday(), 'The resume date must be in the future.'),
})

export type PauseValues = z.infer<typeof schema>

export function PauseDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Throws an ApiError on failure (422 is mapped onto the fields). */
  onSubmit: (values: { reason: string; resumeDate: string | null }) => Promise<unknown>
}) {
  const form = useForm<PauseValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', resumeDate: undefined },
  })
  const { reset } = form
  useEffect(() => {
    if (open) reset({ reason: '', resumeDate: undefined })
  }, [open, reset])

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({ reason: values.reason.trim(), resumeDate: values.resumeDate ?? null })
      onOpenChange(false)
    } catch (error) {
      applyServerErrors(error, form.setError, ['reason', 'resumeDate'])
    }
  })
  useShortcut('mod+s', () => void submit(), {
    enabled: open,
    allowInInput: true,
    allowInDialog: true,
    description: 'Save',
    group: 'Forms',
  })

  const errors = form.formState.errors
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={
          description ??
          'No chain mails go out while communication is paused. Manual sends stay possible.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={form.formState.isSubmitting}
              onClick={() => void submit()}
              shortcut="mod+s"
            >
              Pause
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Reason" required error={errors.reason?.message}>
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                rows={3}
                data-autofocus
                placeholder="On parental leave, travelling, waiting for the cost centre…"
                {...form.register('reason')}
              />
            )}
          </Field>
          <Field
            label="Resume on"
            help="Optional. Leave empty to pause until someone resumes it."
            error={errors.resumeDate?.message}
          >
            {() => (
              <Controller
                control={form.control}
                name="resumeDate"
                render={({ field }) => (
                  <DatePicker
                    label="Resume on"
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    placeholder="No date"
                  />
                )}
              />
            )}
          </Field>
          {errors.root?.server && (
            <p role="alert" className="text-xs text-tone-critical-fg">
              {errors.root.server.message}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
