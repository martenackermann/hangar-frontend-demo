import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { Devtools } from '@/components/app/devtools'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { RouterContext } from '@/router'

/**
 * Root: providers only. The authenticated shell is the pathless `_app` layout
 * (SCREENS.md §11); `/login` renders without it.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
})

function Root() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
      <Devtools />
    </TooltipProvider>
  )
}
