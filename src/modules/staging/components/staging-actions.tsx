import { useWorkflowAction } from '@/components/drawer/workflow-actions'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { BlockedAction } from '@/lib/api/types'
import { actionLabel, useEnums } from '@/lib/enums'

interface ActionEntity {
  id: number
  number: string
  version?: number
  availableActions: string[]
  blockedActions?: BlockedAction[]
}

/**
 * The H3 actions of one request as buttons (work panels): available ones post through the
 * generic action endpoint (or call `onAction` to open a confirmation first), blocked ones are
 * disabled with the guard reason as tooltip. The full action bar stays in the SR drawer.
 */
export function StagingActions({
  entity,
  actions,
  confirm = {},
  onDone,
}: {
  entity: ActionEntity
  /** Candidate actions in display order; the first available one is the primary button. */
  actions: readonly string[]
  /** Actions that need a confirmation first: called instead of posting. */
  confirm?: Partial<Record<string, () => void>>
  onDone?: () => void
}) {
  const enums = useEnums()
  const mutation = useWorkflowAction('serviceRequest', entity, entity.number)
  const blocked = entity.blockedActions ?? []
  const shown = actions.filter(
    (action) =>
      entity.availableActions.includes(action) || blocked.some((b) => b.action === action),
  )
  if (shown.length === 0) return null
  const primaryAction = shown.find((action) => entity.availableActions.includes(action))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((action) => {
        const reason = blocked.find((b) => b.action === action)?.reason
        const label = actionLabel(enums, 'serviceRequest', action)
        if (reason) {
          return (
            <Tooltip key={action} content={reason}>
              <span>
                <Button variant="secondary" disabled aria-description={reason}>
                  {label}
                </Button>
              </span>
            </Tooltip>
          )
        }
        const primary = action === primaryAction
        return (
          <Button
            key={action}
            variant={primary ? 'primary' : 'secondary'}
            loading={mutation.isPending && mutation.variables.action === action}
            onClick={() => {
              const ask = confirm[action]
              if (ask) ask()
              else mutation.mutate({ action }, { onSuccess: () => onDone?.() })
            }}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}
