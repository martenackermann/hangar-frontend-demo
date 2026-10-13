import { createContext } from 'react'
import type { EnumsResponse } from '@/lib/api/types'

/** Provided by `EnumsProvider` (root route and test utils); `null` outside it. */
export const EnumsContext = createContext<EnumsResponse | null>(null)
