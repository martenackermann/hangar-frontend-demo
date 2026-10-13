import type { ActionDialogDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const SkipPreparationDialog = lazyNamed(
  () => import('@/modules/staging/components/skip-preparation-dialog'),
  'SkipPreparationDialog',
)

const dialog: ActionDialogDescriptor = {
  resource: 'serviceRequest',
  action: 'skip_preparation',
  order: 22,
  component: SkipPreparationDialog,
}

export default dialog
