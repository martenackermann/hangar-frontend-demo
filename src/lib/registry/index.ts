import type { QueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { AssetDetail, LeaseReturnDetail, ServiceRequestDetail } from '@/lib/api/types'
import type { WorkflowResourceKey } from '@/lib/api/keys'
import type { Permission } from '@/lib/auth/permissions'

/**
 * Slice extension points (SPEC §2.3/§2.4, SPEC_RESOLUTIONS #15, #19, #38). Slices contribute by
 * creating files — never by editing shared code. Collected with `import.meta.glob` over
 * `src/modules/{requests,imports,staging,field,stock}/…`:
 *
 *   sr-drawer-tabs/*.tsx     default export DrawerTabDescriptor<ServiceRequestDetail>
 *   lease-drawer-tabs/*.tsx  default export DrawerTabDescriptor<LeaseReturnDetail>
 *   asset-drawer-tabs/*.tsx  default export DrawerTabDescriptor<AssetDetail>
 *   action-dialogs/*.tsx     default export ActionDialogDescriptor
 *   drawers/*.tsx            default export ParamDrawerDescriptor (e.g. the mail-log content)
 *   commands.ts              export const commands: CommandDescriptor[]
 */

// ---- drawer tabs ---------------------------------------------------------------------------

export interface DrawerTabProps<E> {
  entity: E
}

export interface DrawerTabDescriptor<E> {
  /** Tab id in the URL (`?tab=items`). */
  id: string
  label: string
  /** Sort order (SCREENS.md §1.5 table). */
  order: number
  /** Hidden without this permission. */
  permission?: Permission
  /** Hidden unless true for the entity (e.g. Shipping only for parcel delivery). */
  isVisible?: (entity: E) => boolean
  /** Optional count pill. */
  count?: (entity: E) => number | null | undefined
  component: ComponentType<DrawerTabProps<E>>
}

interface TabModule<E> {
  default: DrawerTabDescriptor<E>
}

function collect<T>(modules: Record<string, { default: T }>): T[] {
  return Object.keys(modules)
    .sort()
    .map((path) => modules[path]?.default)
    .filter((value): value is T => value !== undefined)
}

const srTabModules = import.meta.glob<TabModule<ServiceRequestDetail>>(
  '/src/modules/{requests,imports,staging,field,stock}/sr-drawer-tabs/*.tsx',
  { eager: true },
)
const leaseTabModules = import.meta.glob<TabModule<LeaseReturnDetail>>(
  '/src/modules/{requests,imports,staging,field,stock}/lease-drawer-tabs/*.tsx',
  { eager: true },
)
const assetTabModules = import.meta.glob<TabModule<AssetDetail>>(
  '/src/modules/{requests,imports,staging,field,stock}/asset-drawer-tabs/*.tsx',
  { eager: true },
)

function byOrder<T extends { order: number; id?: string }>(a: T, b: T): number {
  return a.order - b.order || (a.id ?? '').localeCompare(b.id ?? '')
}

export const SR_DRAWER_TABS: readonly DrawerTabDescriptor<ServiceRequestDetail>[] =
  collect(srTabModules).sort(byOrder)
export const LEASE_DRAWER_TABS: readonly DrawerTabDescriptor<LeaseReturnDetail>[] =
  collect(leaseTabModules).sort(byOrder)
export const ASSET_DRAWER_TABS: readonly DrawerTabDescriptor<AssetDetail>[] =
  collect(assetTabModules).sort(byOrder)

// ---- action dialogs (SPEC_RESOLUTIONS #15) --------------------------------------------------

export interface ActionDialogProps<E = unknown> {
  entity: E
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Call after a successful action with the updated detail resource. */
  onDone: (updated?: E) => void
}

export interface ActionDialogDescriptor {
  resource: WorkflowResourceKey
  /** Action name (`pause_communication`, `book_appointment`, `ship`, …). */
  action: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entity type depends on `resource`
  component: ComponentType<ActionDialogProps<any>>
  /** Shown as one of the (max 3) primary buttons in the drawer action bar. */
  primary?: boolean
  /** Order in the action bar / overflow menu (lower first). */
  order: number
}

const actionDialogModules = import.meta.glob<{ default: ActionDialogDescriptor }>(
  '/src/modules/{requests,imports,staging,field,stock}/action-dialogs/*.tsx',
  { eager: true },
)

export const ACTION_DIALOGS: readonly ActionDialogDescriptor[] = collect(actionDialogModules).sort(
  (a, b) => a.order - b.order,
)

export function findActionDialog(
  resource: WorkflowResourceKey,
  action: string,
): ActionDialogDescriptor | undefined {
  return ACTION_DIALOGS.find((dialog) => dialog.resource === resource && dialog.action === action)
}

// ---- param drawers (mail log, …) -------------------------------------------------------------

export interface ParamDrawerDescriptor {
  /** Search param that opens the drawer (`mail`). */
  param: 'mail'
  permission?: Permission
  component: ComponentType<{ id: number }>
}

const paramDrawerModules = import.meta.glob<{ default: ParamDrawerDescriptor }>(
  '/src/modules/{requests,imports,staging,field,stock}/drawers/*.tsx',
  { eager: true },
)

export const PARAM_DRAWERS: readonly ParamDrawerDescriptor[] = collect(paramDrawerModules)

// ---- ⌘K commands ---------------------------------------------------------------------------

export interface CommandContext {
  navigate: (to: string) => void
  queryClient: QueryClient
  close: () => void
}

export interface CommandDescriptor {
  id: string
  label: string
  icon?: LucideIcon
  permission?: Permission
  keywords?: readonly string[]
  /** Shortcut hint shown in the palette (the slice registers the key itself). */
  shortcut?: string
  /** Section in the palette (default "Actions"). */
  group?: 'Actions' | 'System'
  run: (ctx: CommandContext) => void | Promise<void>
}

const commandModules = import.meta.glob<readonly CommandDescriptor[]>(
  '/src/modules/{requests,imports,staging,field,stock}/commands.ts',
  { eager: true, import: 'commands' },
)

export const MODULE_COMMANDS: readonly CommandDescriptor[] = Object.keys(commandModules)
  .sort()
  .flatMap((path) => commandModules[path] ?? [])
