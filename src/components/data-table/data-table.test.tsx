import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/utils'
import { DataTable, type DataColumn } from './data-table'

interface Row {
  id: number
  number: string
  name: string
  region: string
}

const rows: Row[] = [
  { id: 1, number: 'SR0012001', name: 'Mia Turner', region: 'Riverton' },
  { id: 2, number: 'SR0012002', name: 'Noah Hale', region: 'Hillford' },
  { id: 3, number: 'SR0012003', name: 'Lena Brooks', region: 'Eastgate' },
]

const columns: DataColumn<Row>[] = [
  {
    id: 'number',
    header: 'SR',
    cell: (r) => r.number,
    sortField: 'number',
    locked: true,
    pinned: true,
  },
  { id: 'name', header: 'Employee', cell: (r) => r.name },
  { id: 'region', header: 'Region', cell: (r) => r.region, sortField: 'region' },
]

// jsdom has no layout: give the virtualizer's scroll element a size (restoreMocks resets these after each test).
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 1200, height: 600 }),
  )
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200)
})

function Harness({
  onOpen,
  onSortChange,
  hidden = [],
}: {
  onOpen?: (row: Row) => void
  onSortChange?: (sort: string | undefined) => void
  hidden?: string[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState<string | undefined>()
  return (
    <>
      <output data-testid="selected">{selected.join(',')}</output>
      <DataTable
        label="Service requests"
        columns={columns}
        columnPrefs={{ hidden, order: columns.map((c) => c.id) }}
        rows={rows}
        getRowId={(r) => String(r.id)}
        total={rows.length}
        selectable
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          onSortChange?.(next)
        }}
        onOpen={onOpen}
        empty={<p>No requests match these filters.</p>}
      />
    </>
  )
}

describe('DataTable', () => {
  it('renders rows with aria row counts and hides columns from the prefs', () => {
    renderWithProviders(<Harness hidden={['region']} />)
    const table = screen.getByRole('table', { name: 'Service requests' })
    expect(table).toHaveAttribute('aria-rowcount', '4')
    expect(within(table).getByText('SR0012002')).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: /Region/ })).not.toBeInTheDocument()
  })

  it('cycles server-side sort asc → desc → none from the header', async () => {
    const onSortChange = vi.fn()
    renderWithProviders(<Harness onSortChange={onSortChange} />)
    const header = screen.getByRole('button', { name: 'Region' })
    await userEvent.click(header)
    await userEvent.click(screen.getByRole('button', { name: 'Region' }))
    await userEvent.click(screen.getByRole('button', { name: 'Region' }))
    expect(onSortChange.mock.calls).toEqual([['region'], ['-region'], [undefined]])
    expect(screen.getByRole('columnheader', { name: 'Region' })).not.toHaveAttribute('aria-sort')
  })

  it('selects rows with checkboxes, x and shift+x; opens with Enter', async () => {
    const onOpen = vi.fn()
    renderWithProviders(<Harness onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row 2' }))
    expect(screen.getByTestId('selected')).toHaveTextContent('2')
    await userEvent.keyboard('j') // cursor to row 1
    await userEvent.keyboard('x')
    expect(screen.getByTestId('selected')).toHaveTextContent('2,1')
    await userEvent.keyboard('{Shift>}X{/Shift}') // select all on page
    expect(screen.getByTestId('selected').textContent?.split(',').sort()).toEqual(['1', '2', '3'])
    // Enter on a focused control belongs to that control; with focus on the page it opens the row.
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledWith(rows[0])
  })

  it('opens a row on click but ignores clicks that bubble from a portal', async () => {
    const onOpen = vi.fn()
    const withMenu: DataColumn<Row>[] = [
      ...columns,
      {
        id: 'menu',
        header: 'Menu',
        // a menu rendered in a portal, like the kit's DropdownMenuContent
        cell: (r) =>
          createPortal(
            <div role="menuitem" tabIndex={-1}>
              Edit {r.number}
            </div>,
            document.body,
          ),
      },
    ]
    renderWithProviders(
      <DataTable
        label="Rows"
        columns={withMenu}
        rows={rows}
        getRowId={(r) => String(r.id)}
        onOpen={onOpen}
        empty={<p>None</p>}
      />,
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit SR0012002' }))
    expect(onOpen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Noah Hale'))
    expect(onOpen).toHaveBeenCalledWith(rows[1])
  })

  it('shows the empty state', () => {
    renderWithProviders(
      <DataTable
        label="Empty"
        columns={columns}
        rows={[]}
        getRowId={(r) => String(r.id)}
        empty={<p>No requests match these filters.</p>}
      />,
    )
    expect(screen.getByText('No requests match these filters.')).toBeInTheDocument()
  })
})
