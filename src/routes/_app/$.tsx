import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/app/error-pages'

/** 404 catch-all inside the shell (SCREENS.md §2.2). */
export const Route = createFileRoute('/_app/$')({
  staticData: { title: 'Not found' },
  component: NotFoundPage,
})
