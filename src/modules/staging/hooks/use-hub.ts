import { useHubs } from '@/lib/api/core'
import { useMe } from '@/lib/auth/store'

/**
 * Warehouse screens share a hub selector (SCREENS.md §5): `siteId` from the URL, else the
 * user's home site when it is a hub, else Riverton (the first hub).
 */
export function useHubId(siteId: number | undefined): number | undefined {
  const hubs = useHubs()
  const me = useMe()
  if (siteId !== undefined && hubs.some((hub) => hub.id === siteId)) return siteId
  const home = me?.homeSite ? hubs.find((hub) => hub.id === me.homeSite?.id) : undefined
  return (home ?? hubs.find((hub) => hub.code === 'RIV') ?? hubs[0])?.id
}
