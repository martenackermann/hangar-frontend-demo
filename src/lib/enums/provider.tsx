import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { coreQueries } from '@/lib/api/core'
import { ENUM_CATALOG } from './catalog'
import { EnumsContext } from './context'

/**
 * One `/meta/enums` subscription for the whole app: badges, tracks and cards read the value
 * from context instead of each creating its own query observer (a board renders hundreds).
 */
export function EnumsProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({ ...coreQueries.enums(), placeholderData: ENUM_CATALOG })
  return <EnumsContext value={data ?? ENUM_CATALOG}>{children}</EnumsContext>
}
