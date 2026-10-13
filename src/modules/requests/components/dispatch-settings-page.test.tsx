import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Router from '@tanstack/react-router'
import { api } from '@/lib/api/client'
import type { DispatchSettings } from '@/lib/api/types'
import { PERSONA_EMAILS, renderWithProviders, signInAs } from '@/test/utils'
import { DispatchSettingsPage } from './dispatch-settings-page'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/communications">{children}</a>,
}))

// jsdom has no ResizeObserver (Radix Switch measures its thumb).
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})

describe('DispatchSettingsPage', () => {
  it('validates ranges inline, previews the timeline and saves', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const user = userEvent.setup()
    renderWithProviders(<DispatchSettingsPage />)

    const reminders = await screen.findAllByLabelText('Reminder 1')
    const srReminder = reminders[1]
    if (!srReminder) throw new Error('missing SR reminder field')
    await user.clear(srReminder)
    await user.type(srReminder, '99')
    await user.tab()
    expect(await screen.findByText('Between 1 and 60.')).toBeInTheDocument()

    await user.clear(srReminder)
    await user.type(srReminder, '6')
    expect(await screen.findByText('+6 d')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Save/ }))

    await waitFor(async () => {
      const saved = await api.get<DispatchSettings>('/dispatch-settings')
      expect(saved.srReminder1AfterDays).toBe(6)
    })
  })

  it('is read-only without comms.settings', async () => {
    await signInAs(PERSONA_EMAILS.viewer)
    renderWithProviders(<DispatchSettingsPage />)
    expect(await screen.findByText('Read only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    for (const input of screen.getAllByRole('spinbutton')) expect(input).toBeDisabled()
  })
})
