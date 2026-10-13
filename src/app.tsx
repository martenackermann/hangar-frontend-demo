import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { persistOptions } from '@/lib/query/persist'
import { queryClient, router } from './router'

export function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  )
}
