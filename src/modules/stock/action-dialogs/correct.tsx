import type { ActionDialogDescriptor } from '@/lib/registry'
import { Correct } from '../components/asset-action-dialogs'

/** Asset `correct` (H5, bulk ✓): status/location/place + required reason. */
const dialog: ActionDialogDescriptor = {
  resource: 'asset',
  action: 'correct',
  primary: true,
  order: 30,
  component: Correct,
}
export default dialog
