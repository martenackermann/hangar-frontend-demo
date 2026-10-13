import { Mail } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { hasPermission } from '@/lib/auth/permissions'
import { usePermissions } from '@/lib/auth/store'
import { PARAM_DRAWERS } from '@/lib/registry'
import { AssetDrawer } from './asset-drawer'
import { Suspense } from 'react'
import { DrawerFrame } from './drawer-frame'
import { DrawerLoading } from './drawer-states'
import { useDrawerNavigation, useDrawerSearch } from './drawer-state'
import { LeaseDrawer } from './lease-drawer'
import { SrDrawer } from './sr-drawer'

function MailDrawer({ id }: { id: number }) {
  const drawer = useDrawerNavigation()
  const descriptor = PARAM_DRAWERS.find((d) => d.param === 'mail')
  if (descriptor)
    return (
      <Suspense
        fallback={
          <DrawerFrame label="Mail" onClose={drawer.close}>
            <DrawerLoading />
          </DrawerFrame>
        }
      >
        <descriptor.component id={id} />
      </Suspense>
    )
  return (
    <DrawerFrame label="Mail" onClose={drawer.close}>
      <EmptyState icon={Mail} title="Mail preview">
        This mail can't be shown.
      </EmptyState>
    </DrawerFrame>
  )
}

/**
 * Mounted once in the `_app` layout: shows the drawer for `?sr=` / `?lr=` / `?asset=` / `?mail=`
 * (SCREENS.md §1.5, SPEC_RESOLUTIONS #38). Frames are core; tab content comes from the slices'
 * registries. One drawer at a time; the record must be readable by the current role.
 */
export function DrawerHost() {
  const search = useDrawerSearch()
  const permissions = usePermissions()
  if (search.sr && hasPermission(permissions, 'sr.read'))
    return <SrDrawer key="sr" id={search.sr} />
  if (search.lr && hasPermission(permissions, 'lease.read'))
    return <LeaseDrawer key="lr" id={search.lr} />
  if (search.asset && hasPermission(permissions, 'stock.read'))
    return <AssetDrawer key="asset" id={search.asset} />
  if (search.mail && hasPermission(permissions, 'comms.read'))
    return <MailDrawer id={search.mail} />
  return null
}
