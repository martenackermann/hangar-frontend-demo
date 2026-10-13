import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { lazyNamed } from '@/lib/registry/lazy'

const CommentsTab = lazyNamed(
  () => import('@/modules/requests/components/lease-comments-tab'),
  'CommentsTab',
)

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'comments',
  label: 'Comments',
  order: 20,
  count: (lease) => lease.commentCount,
  component: CommentsTab,
}
export default tab
