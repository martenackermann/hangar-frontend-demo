import { createFileRoute } from '@tanstack/react-router'
import { RoutePlaceholder } from '@/components/app/route-placeholder'
import { requirePermission } from '@/lib/auth/guards'

/**
 * Imports (SCREENS.md). Owner: H2 (Import & Master data).
 * PLACEHOLDER created by the foundation: the owning slice replaces this file
 * (keep the path, the permission guard and `staticData.title`).
 */
export const Route = createFileRoute('/_app/data/imports/')({
  beforeLoad: requirePermission('imports.read'),
  staticData: { title: 'Imports' },
  component: Placeholder,
})

function Placeholder() {
  return (
    <RoutePlaceholder
      title="Imports"
      owner="H2"
      purpose="Upload ITSM and partner exports; the type is detected from the header row."
    />
  )
}
