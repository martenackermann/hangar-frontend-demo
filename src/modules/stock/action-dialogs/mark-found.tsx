import type { ActionDialogDescriptor } from '@/lib/registry'
import { MarkFound } from '../components/asset-action-dialogs'

/** Asset `mark_found` (H5): location picker (+ installation place in staging). */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'mark_found',
  primary: true,
  order: 20,
  component: MarkFound,
}
export default dialog
