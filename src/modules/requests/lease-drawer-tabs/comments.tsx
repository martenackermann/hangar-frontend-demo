import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState, SkeletonRows } from '@/components/ui/feedback'
import { Textarea } from '@/components/ui/input'
import { isApiError } from '@/lib/api/errors'
import type { LeaseReturnDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/store'
import { formatFullDateTime } from '@/lib/format'
import type { DrawerTabDescriptor } from '@/lib/registry'
import { useShortcut } from '@/lib/shortcuts'
import { leaseCommentsQuery, useAddLeaseComment } from '../api'

function CommentsTab({ entity: lease }: { entity: LeaseReturnDetail }) {
  const canAdd = useCan('lease.manage')
  const query = useQuery(leaseCommentsQuery(lease.id))
  const add = useAddLeaseComment(lease.id)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const text = body.trim()
    if (!text) {
      setError('Write a comment first.')
      return
    }
    add.mutate(text, {
      onSuccess: () => {
        setBody('')
        setError(null)
      },
      onError: (e) =>
        setError(
          isApiError(e)
            ? (e.fieldErrors.body?.join(' ') ?? e.detail ?? e.title)
            : 'Could not save.',
        ),
    })
  }
  useShortcut('mod+enter', submit, {
    enabled: canAdd && body.trim().length > 0,
    allowInInput: true,
    description: 'Add comment',
    group: 'Drawer',
  })
  const comments = query.data?.data ?? []
  return (
    <div className="grid gap-4">
      {canAdd && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label htmlFor="lease-comment" className="text-xs text-fg-3">
            Add a comment (visible to the team, cannot be edited later)
          </label>
          <Textarea
            id="lease-comment"
            rows={3}
            maxLength={2000}
            value={body}
            aria-invalid={Boolean(error)}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Called the user, device is a spare…"
          />
          {error && (
            <p role="alert" className="text-xs text-tone-critical-fg">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-3">{body.length}/2000</span>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              shortcut="mod+enter"
              loading={add.isPending}
            >
              Add comment
            </Button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <SkeletonRows rows={3} />
      ) : comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet." />
      ) : (
        <ol className="grid gap-3" aria-label="Comments">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-sm border border-line bg-surface px-3 py-2">
              <p className="text-xs text-fg-3">
                {comment.author.displayName} · {formatFullDateTime(comment.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const tab: DrawerTabDescriptor<LeaseReturnDetail> = {
  id: 'comments',
  label: 'Comments',
  order: 20,
  count: (lease) => lease.commentCount,
  component: CommentsTab,
}
export default tab
