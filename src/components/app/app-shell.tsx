import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { signOut, useCurrentUser } from '@/lib/auth/store'
import { useNavigation } from '@/lib/nav/use-navigation'

/**
 * PLACEHOLDER app shell (phase 2a): proves the module navigation wiring.
 * Phase 2b replaces it with the designed shell (sidebar, command palette, shortcuts).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { groups } = useNavigation()
  const user = useCurrentUser()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full">
      <nav aria-label="Main" className="w-56 shrink-0 border-r border-slate-200 p-4">
        <p className="mb-4 font-semibold">Hangar</p>
        {groups.map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-1 text-xs text-slate-500 uppercase">{group.label}</p>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={entry.to}
                    className="block rounded px-2 py-1 text-sm hover:bg-slate-100"
                    activeProps={{ className: 'bg-slate-100 font-medium' }}
                    activeOptions={{ exact: entry.to === '/' }}
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 px-4 py-2 text-sm">
          {import.meta.env.VITE_DEMO_MODE === 'true' && (
            <button
              type="button"
              className="rounded px-2 py-1 hover:bg-slate-100"
              onClick={async () => {
                const { resetDemoData } = await import('@/mocks/db')
                resetDemoData()
                window.location.reload()
              }}
            >
              Reset demo data
            </button>
          )}
          <span>{user?.name}</span>
          <button
            type="button"
            className="rounded px-2 py-1 hover:bg-slate-100"
            onClick={() => {
              signOut()
              void navigate({ to: '/login', search: {} })
            }}
          >
            Sign out
          </button>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
