import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api/client'
import type { DeploymentView, List, TourDetail } from '@/lib/api/types'
import { businessToday } from '@/lib/format'
import { anchorDay } from '@/modules/field/lib/time'
import { PERSONA_EMAILS, renderWithProviders, signInAs } from '@/test/utils'
import { CompleteForm, DeviationActionForm } from './on-site-forms'

// ResizeObserver (Radix checkbox / switch) is stubbed globally in src/test/setup.ts.

async function firstStopView(): Promise<DeploymentView> {
  await signInAs(PERSONA_EMAILS.technician)
  const tours = await api.get<List<TourDetail>>(`/my/tours?date=${anchorDay(businessToday())}`)
  const tour = tours.data[0]
  const stop = tour?.stops[0]
  if (!tour || !stop) throw new Error('no tour')
  return api.get<DeploymentView>(`/tours/${tour.id}/stops/${stop.id}/deployment`)
}

describe('CompleteForm', () => {
  it('stays disabled with the guard reason until the devices are verified', async () => {
    const view = await firstStopView()
    renderWithProviders(
      <CompleteForm sr={view.serviceRequest} codes={view.deviationCodes} onDone={vi.fn()} />,
    )
    const button = screen.getByRole('button', { name: /^Complete/ })
    expect(button).toBeDisabled()
    expect(screen.getByText(/devices are not verified yet/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue(
      view.serviceRequest.contact.displayName,
    )
  })
})

describe('DeviationActionForm', () => {
  it('requires a deviation code before rescheduling', async () => {
    const view = await firstStopView()
    const onDone = vi.fn()
    renderWithProviders(
      <DeviationActionForm
        sr={view.serviceRequest}
        action="reschedule_on_site"
        codes={view.deviationCodes}
        onDone={onDone}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
    await waitFor(() => expect(screen.getByText('Choose a deviation code.')).toBeInTheDocument())
    expect(onDone).not.toHaveBeenCalled()
  })
})
