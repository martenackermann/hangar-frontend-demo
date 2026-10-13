import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/auth/guards'
import { CallOffDetailPage } from '@/modules/stock/components/calloff-detail-page'

/** Call-off order detail (SCREENS.md §7.2). Owner: H5. Lines editable while draft. */
export const Route = createFileRoute('/_app/stock/call-off-orders/$orderId')({
  beforeLoad: requirePermission('stock.read'),
  staticData: { title: 'Call-off order' },
  component: CallOffOrderRoute,
})

function CallOffOrderRoute() {
  const { orderId } = Route.useParams()
  return <CallOffDetailPage key={orderId} orderId={Number(orderId)} />
}
