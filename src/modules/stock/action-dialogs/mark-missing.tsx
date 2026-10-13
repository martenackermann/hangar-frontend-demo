import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const MarkMissing = lazyNamed(
  () => import('@/modules/stock/components/asset-action-dialogs'),
  'MarkMissing',
)

/** Asset `mark_missing` (H5, bulk ✓): optional reason. */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'mark_missing',
  primary: true,
  order: 10,
  component: MarkMissing,
}
export default dialog
