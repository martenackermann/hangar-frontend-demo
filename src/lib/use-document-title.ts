import { useEffect } from 'react'

/** Sets `<title>` to "<page> · Hangar" while the component is mounted. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · Hangar`
    return () => {
      document.title = previous
    }
  }, [title])
}
