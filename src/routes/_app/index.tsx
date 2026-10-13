import { createFileRoute, redirect } from '@tanstack/react-router'
import { homePathFor } from '@/lib/auth/guards'
import { getMe } from '@/lib/auth/store'

/** `/` → technicians to My tour, everyone else to the Pipeline (SCREENS.md §1.2). */
export const Route = createFileRoute('/_app/')({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect
    throw redirect({ to: homePathFor(getMe()), replace: true })
  },
})
