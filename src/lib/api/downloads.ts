import { notify } from '@/components/ui/toast'
import { env } from '@/lib/env'
import { api } from './client'
import { isApiError } from './errors'
import type { DownloadLink } from './types'

/**
 * Downloads (API.md §1.6): endpoints return a signed `DownloadLink`; the browser navigates to
 * `url` (same tab). In demo mode the mock API lives in a service worker that cannot answer
 * navigations, so the file is fetched and saved through a blob URL instead.
 */
export async function openDownload(link: DownloadLink): Promise<void> {
  if (env.demoMode) {
    const response = await fetch(link.url)
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = link.filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } else {
    window.location.assign(link.url)
  }
}

/**
 * Request a download link and open it, with toasts:
 *   await downloadFrom(() => api.post<DownloadLink>('/service-requests/export', {}, { query }))
 */
export async function downloadFrom(request: () => Promise<DownloadLink>): Promise<void> {
  try {
    const link = await request()
    await openDownload(link)
    notify.success('Download ready', { description: link.filename })
  } catch (error) {
    notify.error(isApiError(error) ? error.title : 'Download failed', {
      description: isApiError(error) ? error.detail : undefined,
    })
  }
}

/** Shorthand for `GET` endpoints returning a DownloadLink. */
export function downloadGet(path: string): Promise<void> {
  return downloadFrom(() => api.get<DownloadLink>(path))
}
