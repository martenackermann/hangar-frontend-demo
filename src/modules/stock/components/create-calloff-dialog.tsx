import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { notify } from '@/components/ui/toast'
import { useHubs } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import { addWorkingDays, businessToday, formatDate } from '@/lib/format'
import { useShortcut } from '@/lib/shortcuts'
import { useCreateCallOff } from '../api'

/** "Create call-off order…" (SCREENS.md §7.1/§7.2): hub, delivery date (next working day + 2), note. */
export function CreateCallOffDialog({
  open,
  onOpenChange,
  siteId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselected hub (matrix column menu). */
  siteId?: number | undefined
}) {
  const hubs = useHubs()
  const navigate = useNavigate()
  const mutation = useCreateCallOff()
  const [hub, setHub] = useState<string | undefined>(siteId ? String(siteId) : undefined)
  const [date, setDate] = useState<string | undefined>(addWorkingDays(businessToday(), 3))
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async () => {
    const local: Record<string, string> = {}
    if (!hub) local.siteId = 'Choose a hub.'
    if (!date) local.deliveryDate = 'Choose a delivery date.'
    setErrors(local)
    if (Object.keys(local).length) return
    try {
      const order = await mutation.mutateAsync({
        siteId: Number(hub),
        deliveryDate: date!,
        note: note.trim() || null,
      })
      notify.success(`Draft ${order.number} created`, {
        description: `${order.lineCount} lines · ${order.totalQuantity} devices`,
      })
      onOpenChange(false)
      void navigate({
        to: '/stock/call-off-orders/$orderId',
        params: { orderId: String(order.id) },
      })
    } catch (error) {
      if (isApiError(error) && Object.keys(error.fieldErrors).length) {
        setErrors(
          Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v.join(' ')])),
        )
      } else
        notify.error(isApiError(error) ? error.title : 'Could not create the order', {
          description: isApiError(error) ? error.detail : undefined,
        })
    }
  }

  useShortcut('mod+s', () => void submit(), {
    enabled: open,
    allowInDialog: true,
    allowInInput: true,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create call-off order"
        description="Lines are suggested from the stock matrix: demand + buffer − stock per article. You can edit them before sending."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={mutation.isPending} onClick={() => void submit()}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Hub" required error={errors.siteId}>
            {({ id }) => (
              <Select
                id={id}
                label="Hub"
                value={hub}
                onValueChange={setHub}
                placeholder="Choose a hub"
                options={hubs.map((h) => ({ value: String(h.id), label: h.name }))}
              />
            )}
          </Field>
          <Field
            label="Requested delivery date"
            required
            error={errors.deliveryDate}
            help={
              date ? `Initech Logistics delivers to the hub on ${formatDate(date)}.` : undefined
            }
          >
            {() => <DatePicker label="Requested delivery date" value={date} onChange={setDate} />}
          </Field>
          <Field label="Note for Initech Logistics" error={errors.note}>
            {({ id }) => (
              <Textarea
                id={id}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Delivery window, ramp, priorities…"
              />
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
