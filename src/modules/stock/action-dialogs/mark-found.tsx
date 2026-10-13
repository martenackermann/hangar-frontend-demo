import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const MarkFound = lazyNamed(
  () => import('@/modules/stock/components/asset-action-dialogs'),
  'MarkFound',
)

/** Asset `mark_found` (H5): location picker (+ installation place in staging). */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'mark_found',
  primary: true,
  order: 20,
  component: MarkFound,
}
export default dialog
