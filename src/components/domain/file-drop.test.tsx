import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ImportCounts } from '@/lib/api/types'
import { renderWithProviders } from '@/test/utils'
import { ImportProgress } from './file-drop'

const counts = (processed: number): ImportCounts => ({
  total: 1000,
  processed,
  created: processed,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  errors: 0,
  warnings: 0,
})

describe('ImportProgress', () => {
  it('announces every 10 % and the finish, not every counter tick', () => {
    const { rerender } = renderWithProviders(
      <ImportProgress counts={counts(130)} percent={13} status="Importing" />,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Importing: 10 %.')
    rerender(<ImportProgress counts={counts(190)} percent={19} status="Importing" />)
    expect(status).toHaveTextContent('Importing: 10 %.')
    // the visible counter still moves
    expect(screen.getByText(/Importing 190/)).toBeInTheDocument()
    rerender(<ImportProgress counts={counts(210)} percent={21} status="Importing" />)
    expect(status).toHaveTextContent('Importing: 20 %.')
    rerender(<ImportProgress counts={counts(1000)} percent={100} status="Finished" />)
    expect(status).toHaveTextContent('Finished: 100 %, 1,000 rows processed.')
  })
})
