import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import type { LeaseReturnDetail } from '@/lib/api/types'
import { applyServerErrors } from '@/lib/forms/server-errors'
import type { ActionDialogProps } from '@/lib/registry'

/** Lease action #8 `link_service_request { serviceRequestNumber }` (SPEC §4.2, §6.4). */
const schema = z.object({
  serviceRequestNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SR\d{7}$/, 'Enter a service request number like SR0012345.'),
})
type Values = z.infer<typeof schema>

export function LinkDialog({
  entity,
  open,
  onOpenChange,
  onDone,
}: ActionDialogProps<LeaseReturnDetail>) {
  const mutation = useWorkflowAction('leaseReturn', entity, entity.assetTag)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { serviceRequestNumber: '' },
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      const updated = await mutation.mutateAsync({
        action: 'link_service_request',
        body: { serviceRequestNumber: values.serviceRequestNumber },
      })
      onDone(updated)
    } catch (error) {
      applyServerErrors(error, form.setError, ['serviceRequestNumber'])
    }
  })
  const error =
    form.formState.errors.serviceRequestNumber?.message ??
    form.formState.errors.root?.server?.message
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Link service request · ${entity.assetTag}`}
        description="The lease return moves to Replacement ordered and leaves the reminder chain."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={form.formState.isSubmitting}
              onClick={() => void submit()}
            >
              Link
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Service request number" required error={error}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                data-autofocus
                autoComplete="off"
                placeholder="SR0012345"
                className="font-mono uppercase"
                {...form.register('serviceRequestNumber')}
              />
            )}
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
