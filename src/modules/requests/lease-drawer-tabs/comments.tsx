import type { LeaseReturnDetail } from '@/lib/api/types'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { CommentsTab } from '../components/lease-comments-tab'

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'comments',
  label: 'Comments',
  order: 20,
  count: (lease) => lease.commentCount,
  component: CommentsTab,
}
export default tab
