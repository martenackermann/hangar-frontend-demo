import type { ActionDialogDescriptor } from '@/lib/registry'
import { MarkMissing } from '../components/asset-action-dialogs'

/** Asset `mark_missing` (H5, bulk ✓): optional reason. */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'mark_missing',
  primary: true,
  order: 10,
  component: MarkMissing,
}
export default dialog
