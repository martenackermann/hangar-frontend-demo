import type { ActionDialogDescriptor } from '@/lib/registry'
import { SkipPreparationDialog } from '@/modules/staging/components/skip-preparation-dialog'

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'skip_preparation',
  order: 22,
  component: SkipPreparationDialog,
}

export default dialog
