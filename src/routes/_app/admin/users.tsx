import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { KeyRound, Lock, MoreHorizontal, Pencil, Plus, Power, PowerOff, Users } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { DataTable, type DataColumn } from '@/components/data-table/data-table'
import { FilterBar, type FilterDef } from '@/components/data-table/filter-bar'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, FlagBadge } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { Page, PageHeader } from '@/components/ui/page'
import type { Role, UserSummary } from '@/lib/api/types'
import { requirePermission } from '@/lib/auth/guards'
import { useMe } from '@/lib/auth/store'
import { enumLabel, useEnums } from '@/lib/enums'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { boolParam, listParam, stringParam } from '@/lib/search/params'
import { useShortcut } from '@/lib/shortcuts'
import { userQueries, useUserActive } from '@/modules/imports/api'
import { ResetPasswordDialog, UserDialog } from '@/modules/imports/components/user-dialogs'

/** Admin › Users (SCREENS.md §9.6, SPEC_RESOLUTIONS #22). Owner: H2 (Import & Master data). */
const ROLES = ['viewer', 'technician', 'dispatcher', 'admin'] as const satisfies readonly Role[]

const searchSchema = z.object({
  q: stringParam(),
  role: listParam(ROLES),
  /** `true` / `false`; absent = all users. */
  active: boolParam(),
})

export const Route = createFileRoute('/_app/admin/users')({
  validateSearch: searchSchema,
  beforeLoad: requirePermission('users.manage'),
  staticData: { title: 'Users' },
  component: UsersPage,
})

function UsersPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const enums = useEnums()
  const me = useMe()
  const toggle = useUserActive()
  const [editing, setEditing] = useState<UserSummary | null | 'new'>(null)
  const [resetting, setResetting] = useState<UserSummary | null>(null)
  const [deactivating, setDeactivating] = useState<UserSummary | null>(null)
  const query = useQuery(
    userQueries.list({
      q: search.q,
      role: search.role,
      active: search.active === undefined ? 'all' : search.active ? 'true' : 'false',
    }),
  )
  const rows = query.data?.data ?? []
  useShortcut('n', () => setEditing('new'), {
    enabled: editing === null,
    description: 'New user',
    group: 'Page',
  })

  const columns: DataColumn<UserSummary>[] = [
    {
      id: 'name',
      header: 'Name',
      width: 210,
      locked: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{row.displayName}</span>
          {row.isDemoPersona && (
            <Tooltip content="Demo persona — role and password are fixed">
              <span aria-label="Demo persona" className="inline-flex text-fg-3">
                <Icon icon={Lock} size={12} />
              </span>
            </Tooltip>
          )}
          {row.id === me?.id && <span className="text-2xs text-fg-3">you</span>}
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      width: 250,
      cell: (row) => <span className="truncate font-mono text-xs">{row.email}</span>,
    },
    { id: 'role', header: 'Role', width: 120, cell: (row) => enumLabel(enums, 'role', row.role) },
    { id: 'homeSite', header: 'Home site', width: 140, cell: (row) => row.homeSite?.name ?? '' },
    {
      id: 'active',
      header: 'Active',
      width: 90,
      cell: (row) => (row.isActive ? 'Active' : <FlagBadge>Deactivated</FlagBadge>),
    },
    {
      id: 'persona',
      header: 'Demo persona',
      width: 120,
      cell: (row) =>
        row.isDemoPersona ? (
          <span className="inline-flex items-center gap-1 text-fg-2">
            <Icon icon={Lock} size={12} /> Persona
          </span>
        ) : null,
    },
    {
      id: 'lastLogin',
      header: 'Last login',
      width: 140,
      title: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : null),
      cell: (row) =>
        row.lastLoginAt ? (
          formatRelative(row.lastLoginAt)
        ) : (
          <span className="text-fg-3">Never</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      width: 48,
      align: 'end',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={MoreHorizontal}
              size="sm"
              label={`Actions for ${row.displayName}`}
              onClick={(event) => event.stopPropagation()}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem icon={Pencil} onSelect={() => setEditing(row)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={KeyRound}
              disabled={row.isDemoPersona}
              hint={row.isDemoPersona ? 'Persona' : undefined}
              onSelect={() => setResetting(row)}
            >
              Reset password
            </DropdownMenuItem>
            {row.isActive ? (
              <DropdownMenuItem
                icon={PowerOff}
                destructive
                disabled={row.id === me?.id}
                hint={row.id === me?.id ? 'Your account' : undefined}
                onSelect={() => setDeactivating(row)}
              >
                Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                icon={Power}
                onSelect={() => void toggle.mutateAsync({ id: row.id, active: true })}
              >
                Activate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  const filters: FilterDef[] = [
    {
      kind: 'multi',
      key: 'role',
      label: 'Role',
      options: ROLES.map((value) => ({ value, label: enumLabel(enums, 'role', value) })),
    },
    {
      kind: 'boolean',
      key: 'active',
      label: 'Active',
      trueLabel: 'Active',
      falseLabel: 'Deactivated',
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Users"
        meta={`${formatNumber(rows.length)} users · roles decide what each person can do`}
        actions={
          <Button variant="primary" icon={Plus} shortcut="n" onClick={() => setEditing('new')}>
            New user
          </Button>
        }
      />
      <FilterBar
        search={search}
        onSearchChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
        filters={filters}
        searchPlaceholder="Filter by name or email…"
        resultCount={rows.length}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Users"
          columns={columns}
          rows={rows}
          getRowId={(row) => String(row.id)}
          total={rows.length}
          loading={query.isPending}
          fetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          onOpen={(row) => setEditing(row)}
          empty={<EmptyState icon={Users} title="No users match these filters" />}
        />
      </div>
      <UserDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        user={editing === 'new' ? null : editing}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate ${deactivating?.displayName ?? ''}?`}
        description={
          deactivating?.role === 'technician'
            ? 'They can no longer sign in. Their future planned tours go back to draft.'
            : 'They can no longer sign in. You can activate the account again later.'
        }
        confirmLabel="Deactivate"
        destructive
        pending={toggle.isPending}
        onConfirm={async () => {
          if (deactivating) await toggle.mutateAsync({ id: deactivating.id, active: false })
          setDeactivating(null)
        }}
      />
    </Page>
  )
}
