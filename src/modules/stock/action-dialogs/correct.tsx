import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const Correct = lazyNamed(
  () => import('@/modules/stock/components/asset-action-dialogs'),
  'Correct',
)

/** Asset `correct` (H5, bulk ✓): status/location/place + required reason. */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'correct',
  primary: true,
  order: 30,
  component: Correct,
}
export default dialog
