import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  BookmarkPlus,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { Field, Input } from '@/components/ui/input'
import { TabCount, tabClassName } from '@/components/ui/tabs'
import { notify } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { coreKeys, coreQueries } from '@/lib/api/core'
import { isApiError } from '@/lib/api/errors'
import type { SavedView, SavedViewCreate } from '@/lib/api/types'
import { useMe } from '@/lib/auth/store'
import { formatNumber } from '@/lib/format'
import {
  builtInViewId,
  canonicalViewSearch,
  parseViewId,
  savedViewId,
  searchForView,
  viewSearchEquals,
  type SearchObject,
  type ViewId,
} from '@/lib/search/saved-views'
import { cn } from '@/lib/utils'

/**
 * Saved views (SCREENS.md §0, DESIGN.md §10 SavedViews): tabs above the filter bar — built-in
 * views (defined in code per screen) + personal + shared views from `/saved-views`. Selecting a
 * view replaces the search params; editing filters afterwards shows
 * "Modified · Save / Save as new / Reset".
 */
export interface BuiltInView {
  /** Stable key, becomes `?view=builtin:<key>`. */
  key: string
  name: string
  search: SearchObject
  icon?: LucideIcon
}

export interface ViewDefinition {
  id: ViewId
  name: string
  search: SearchObject
  icon?: LucideIcon | undefined
  builtIn: boolean
  savedView?: SavedView
}

export function useSavedViews({
  route,
  builtIns,
  search,
  defaults = {},
}: {
  route: string
  builtIns: readonly BuiltInView[]
  search: SearchObject
  defaults?: SearchObject
}) {
  const queryClient = useQueryClient()
  const { data } = useQuery(coreQueries.savedViews(route))
  const views = useMemo<ViewDefinition[]>(
    () => [
      ...builtIns.map((view) => ({
        id: builtInViewId(view.key),
        name: view.name,
        search: view.search,
        icon: view.icon,
        builtIn: true,
      })),
      ...(data?.data ?? []).map((view) => ({
        id: savedViewId(view.id),
        name: view.name,
        search: view.search,
        icon: view.isShared ? Users : Bookmark,
        builtIn: false,
        savedView: view,
      })),
    ],
    [builtIns, data],
  )

  const viewParam = typeof search.view === 'string' ? search.view : undefined
  const explicit = parseViewId(viewParam) ? views.find((view) => view.id === viewParam) : undefined
  // Without ?view=, the first view whose filters match the URL is active (usually the default).
  const active = explicit ?? views.find((view) => viewSearchEquals(view.search, search, defaults))
  const modified = Boolean(active && !viewSearchEquals(active.search, search, defaults))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: coreKeys.savedViews(route) })

  const create = useMutation({
    mutationFn: (body: SavedViewCreate) => api.post<SavedView>('/saved-views', body),
    meta: { errorToast: false },
    onSuccess: async () => {
      await invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<SavedViewCreate> & { id: number }) =>
      api.patch<SavedView>(`/saved-views/${id}`, body),
    onSuccess: async () => {
      await invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/saved-views/${id}`),
    onSuccess: async () => {
      await invalidate()
    },
  })

  return {
    route,
    views,
    active,
    modified,
    currentSearch: canonicalViewSearch(search, defaults),
    searchFor: (view: ViewDefinition) => searchForView(view.id, view.search),
    create,
    update,
    remove,
  }
}

export function SavedViewTabs({
  views: state,
  onApply,
  counts,
  className,
}: {
  views: ReturnType<typeof useSavedViews>
  /** Navigate with the given search (replaces the current search). */
  onApply: (search: SearchObject) => void
  /** Optional counts per view id ("Escalated 23"). */
  counts?: Partial<Record<string, number>>
  className?: string
}) {
  const me = useMe()
  const [dialog, setDialog] = useState<'save' | null>(null)
  const { views, active, modified } = state
  const canShare = me?.role === 'dispatcher' || me?.role === 'admin'

  return (
    <div className={cn('hg-no-scrollbar flex items-stretch gap-1 overflow-x-auto px-3', className)}>
      <nav aria-label="Saved views" className="flex items-stretch gap-1">
        {views.map((view) => {
          const isActive = active?.id === view.id
          const count = counts?.[view.id]
          return (
            <button
              key={view.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onApply(state.searchFor(view))}
              className={tabClassName('px-2.5')}
            >
              {view.icon && (
                <Icon
                  icon={view.icon}
                  size={14}
                  className={isActive ? 'text-accent-text' : 'text-fg-3'}
                />
              )}
              {view.name}
              {count !== undefined && <TabCount>{formatNumber(count)}</TabCount>}
            </button>
          )
        })}
      </nav>
      <div className="flex items-center gap-1 pl-2 text-xs">
        {modified && active ? (
          <>
            <span className="text-fg-3">Modified ·</span>
            {active.savedView?.isOwn ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  active.savedView &&
                  state.update.mutate(
                    { id: active.savedView.id, search: state.currentSearch },
                    { onSuccess: () => notify.success(`View “${active.name}” saved`) },
                  )
                }
              >
                Save
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" icon={BookmarkPlus} onClick={() => setDialog('save')}>
              Save as new
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => onApply(state.searchFor(active))}
            >
              Reset
            </Button>
          </>
        ) : !active ? (
          <Button variant="ghost" size="sm" icon={BookmarkPlus} onClick={() => setDialog('save')}>
            Save view
          </Button>
        ) : null}
        {active?.savedView?.isOwn && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More for view ${active.name}`}
              className="grid size-6 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            >
              <Icon icon={MoreHorizontal} size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                icon={Trash2}
                destructive
                onSelect={() =>
                  active.savedView &&
                  state.remove.mutate(active.savedView.id, {
                    onSuccess: () => {
                      notify.success(`View “${active.name}” deleted`)
                      onApply({})
                    },
                  })
                }
              >
                Delete view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SaveViewDialog
        open={dialog === 'save'}
        onOpenChange={(open) => setDialog(open ? 'save' : null)}
        canShare={canShare}
        pending={state.create.isPending}
        onSave={async (name, isShared) => {
          try {
            const view = await state.create.mutateAsync({
              route: state.route,
              name,
              search: state.currentSearch,
              isShared,
            })
            notify.success(`View “${view.name}” saved`)
            setDialog(null)
            onApply(searchForView(savedViewId(view.id), view.search))
            return undefined
          } catch (error) {
            return isApiError(error) && error.code === 'duplicate'
              ? 'You already have a view with this name.'
              : isApiError(error)
                ? (error.detail ?? error.title)
                : 'The view could not be saved.'
          }
        }}
      />
    </div>
  )
}

function SaveViewDialog({
  open,
  onOpenChange,
  canShare,
  pending,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canShare: boolean
  pending: boolean
  /** Resolves to an error message or undefined on success. */
  onSave: (name: string, isShared: boolean) => Promise<string | undefined>
}) {
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const submit = async () => {
    if (!name.trim()) {
      setError('Name the view.')
      return
    }
    const message = await onSave(name.trim(), shared)
    setError(message)
    if (!message) {
      setName('')
      setShared(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Save view"
        description="Saves the current filters, sort and columns as a tab on this screen."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={() => void submit()}>
              Save view
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
          <Field label="Name" error={error}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                data-autofocus
              />
            )}
          </Field>
          {canShare && (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox id="saved-view-shared" checked={shared} onCheckedChange={setShared} />
              <label htmlFor="saved-view-shared">
                Share with everyone (shown after personal views)
              </label>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
