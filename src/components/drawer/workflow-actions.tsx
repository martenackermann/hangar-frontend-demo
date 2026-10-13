import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { notify } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { RESOURCE_KEYS, RESOURCE_PATHS, type WorkflowResourceKey } from '@/lib/api/keys'
import type { BlockedAction, BulkResult } from '@/lib/api/types'
import { actionLabel, findTransition, useEnums } from '@/lib/enums'
import { findActionDialog } from '@/lib/registry'
import { useShortcut } from '@/lib/shortcuts'

/**
 * Workflow actions (API.md §1.5, SCREENS.md §0 "Actions", SPEC_RESOLUTIONS #15).
 *
 * - Buttons come from `availableActions`; `blockedActions` show disabled with the reason.
 * - An action with a registered dialog (`src/modules/<m>/action-dialogs/*.tsx`) opens it;
 *   otherwise it posts directly — through a ConfirmDialog when the transition is `destructive`
 *   or `requiresComment` (comment textarea).
 * - `ship` is never posted to the action endpoint (H3 registers a dialog that uses
 *   `POST /service-requests/{id}/shipments`).
 * - The drawer bar shows up to 3 actions flagged `primary` (else the first 3 by order) +
 *   an overflow menu with the rest and the blocked ones.
 */
export interface WorkflowEntity {
  id: number
  version?: number
  availableActions: string[]
  blockedActions?: BlockedAction[]
}

const NEVER_POSTED = new Set(['ship'])

export function useWorkflowAction<E extends { id: number; version?: number }>(
  resource: WorkflowResourceKey,
  entity: E,
  /** Business key for toasts ("SR0012345", "GX104233"). */
  label: string,
) {
  const queryClient = useQueryClient()
  const enums = useEnums()
  const keys = RESOURCE_KEYS[resource]
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body?: Record<string, unknown> }) =>
      api.post<E>(`${RESOURCE_PATHS[resource]}/${entity.id}/actions/${action}`, {
        ...body,
        ...(entity.version !== undefined ? { version: entity.version } : {}),
      }),
    meta: { errorToast: false },
    onSuccess: async (updated, { action }) => {
      queryClient.setQueryData(keys.detail(entity.id), updated)
      notify.success(`${actionLabel(enums, resource, action)} · ${label}`)
      await queryClient.invalidateQueries({ queryKey: keys.all })
    },
    onError: (error) =>
      notifyActionError(
        error,
        () => void queryClient.invalidateQueries({ queryKey: keys.detail(entity.id) }),
      ),
  })
}

export function notifyActionError(error: unknown, reload?: () => void): void {
  if (!isApiError(error)) {
    notify.error('The action failed')
    return
  }
  if (error.isVersionConflict) {
    notify.error('This record changed. Reload', {
      description: 'Someone else updated it while you were looking at it.',
      action: reload ? { label: 'Reload', onClick: reload } : undefined,
    })
  } else if (error.guard) {
    notify.error(error.guard.message, { description: error.title })
  } else {
    notify.error(error.title, { description: error.detail })
  }
}

/** Bulk action helper: `POST /<resource>/bulk/{action}` → "12 sent · 2 skipped" toast. */
export function useBulkAction(resource: WorkflowResourceKey) {
  const queryClient = useQueryClient()
  const enums = useEnums()
  return useMutation({
    mutationFn: ({
      action,
      ids,
      body,
    }: {
      action: string
      ids: number[]
      body?: Record<string, unknown>
    }) => api.post<BulkResult>(`${RESOURCE_PATHS[resource]}/bulk/${action}`, { ids, ...body }),
    meta: { errorToast: false },
    onSuccess: async (result) => {
      const label = actionLabel(enums, resource, result.action)
      const ok = result.succeeded.length
      const failed = result.failed.length
      const summary = `${label}: ${ok} done${failed ? ` · ${failed} skipped` : ''}`
      if (failed) {
        notify.warning(summary, {
          description: result.failed
            .slice(0, 3)
            .map((f) => `#${f.id}: ${f.message}`)
            .join(' · '),
        })
      } else notify.success(summary)
      await queryClient.invalidateQueries({ queryKey: RESOURCE_KEYS[resource].all })
    },
    onError: (error) => notifyActionError(error),
  })
}

export function WorkflowActionBar<E extends WorkflowEntity>({
  resource,
  entity,
  label,
  max = 3,
  onUpdated,
}: {
  resource: WorkflowResourceKey
  entity: E
  /** Business key for toasts. */
  label: string
  max?: number
  onUpdated?: (entity: E) => void
}) {
  const enums = useEnums()
  const mutation = useWorkflowAction(resource, entity, label)
  const [dialog, setDialog] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const transitions = enums.transitions[resource]
  const orderOf = (action: string) => {
    const registered = findActionDialog(resource, action)
    if (registered) return registered.order
    const index = transitions.findIndex((t) => t.action === action)
    return index < 0 ? 999 : index
  }
  const available = [...entity.availableActions]
    .filter((action) => !NEVER_POSTED.has(action) || findActionDialog(resource, action))
    .sort((a, b) => orderOf(a) - orderOf(b))
  const flagged = available.filter((action) => findActionDialog(resource, action)?.primary)
  const primary = (flagged.length ? flagged : available).slice(0, max)
  const overflow = available.filter((action) => !primary.includes(action))
  const blocked = entity.blockedActions ?? []

  const start = (action: string) => {
    if (findActionDialog(resource, action)) {
      setDialog(action)
      return
    }
    const def = findTransition(enums, resource, action)
    if (def?.destructive || def?.requiresComment) {
      setConfirm(action)
      return
    }
    mutation.mutate({ action }, { onSuccess: (updated) => onUpdated?.(updated) })
  }

  useShortcut('mod+enter', () => primary[0] && start(primary[0]), {
    enabled: primary.length > 0,
    description: 'Run the first action',
    group: 'Drawer',
  })

  const confirmDef = confirm ? findTransition(enums, resource, confirm) : undefined
  const ActiveDialog = dialog ? findActionDialog(resource, dialog)?.component : undefined

  if (available.length === 0 && blocked.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primary.map((action, index) => (
        <Button
          key={action}
          variant={index === 0 ? 'primary' : 'secondary'}
          size="md"
          shortcut={index === 0 ? 'mod+enter' : undefined}
          loading={mutation.isPending && mutation.variables.action === action}
          onClick={() => start(action)}
        >
          {actionLabel(enums, resource, action)}
        </Button>
      ))}
      {(overflow.length > 0 || blocked.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              icon={overflow.length ? MoreHorizontal : undefined}
              iconEnd={ChevronDown}
              aria-label="More actions"
            >
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {overflow.map((action) => (
              <DropdownMenuItem
                key={action}
                destructive={findTransition(enums, resource, action)?.destructive}
                onSelect={() => start(action)}
              >
                {actionLabel(enums, resource, action)}
              </DropdownMenuItem>
            ))}
            {blocked.map((item) => (
              <Tooltip key={item.action} content={item.reason} side="left">
                <DropdownMenuItem disabled hint={item.reason}>
                  {actionLabel(enums, resource, item.action)}
                </DropdownMenuItem>
              </Tooltip>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {confirm && confirmDef && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={`${confirmDef.label} · ${label}?`}
          description={
            confirmDef.destructive
              ? 'This cannot be undone from here.'
              : 'Add a comment for the history.'
          }
          confirmLabel={confirmDef.label}
          destructive={confirmDef.destructive}
          comment={confirmDef.requiresComment ? { required: true } : undefined}
          pending={mutation.isPending}
          onConfirm={(comment) =>
            mutation.mutate(
              { action: confirm, body: comment ? { comment } : {} },
              {
                onSuccess: (updated) => {
                  setConfirm(null)
                  onUpdated?.(updated)
                },
              },
            )
          }
        />
      )}
      {ActiveDialog && (
        <ActiveDialog
          entity={entity}
          open
          onOpenChange={(open: boolean) => !open && setDialog(null)}
          onDone={(updated?: E) => {
            setDialog(null)
            if (updated) onUpdated?.(updated)
          }}
        />
      )}
    </div>
  )
}
