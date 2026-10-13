import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { templatesQuery } from '../api'
import { startDispatch } from '../dispatch'

/** Template id → display name (from `/notification-templates`). */
export function useTemplateNames(): (id: string) => string {
  const { data } = useQuery(templatesQuery)
  return useMemo(() => {
    const names = new Map((data?.data ?? []).map((t) => [t.id, t.name]))
    return (id: string) => names.get(id) ?? id
  }, [data])
}

export function useStartDispatch() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  return {
    pending,
    start: () => {
      setPending(true)
      return startDispatch(queryClient).finally(() => setPending(false))
    },
  }
}
