import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Import (SCREENS.md). Owner: H2 (Import & Master data).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/data/imports/$importId')({
  beforeLoad: requirePermission('imports.read'),
  staticData: { title: 'Import' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Import"
      owner="H2"
      purpose="One import job: progress, counts, issues and the error report."
    />
  )
}
