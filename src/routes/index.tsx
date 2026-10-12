import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/components/app/module-placeholder'

export const Route = createFileRoute('/')({
  staticData: { title: 'Home' },
  component: HomePage,
})

function HomePage() {
  return <ModulePlaceholder title="Hangar" owner="phase 2b (start page / dashboard)" />
}
