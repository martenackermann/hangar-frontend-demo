import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/utils'
import { Button } from './button'
import { Combobox } from './combobox'
import { DatePicker } from './date-picker'
import { ariaKeyshortcuts } from './kbd'
import { pickerName } from './popover'
import { SegmentedControl } from './segmented-control'

// cmdk scrolls the active option into view; jsdom has no layout.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('SegmentedControl', () => {
  function Harness({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState<'all' | 'error' | 'warning'>('all')
    return (
      <SegmentedControl
        label="Rows"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'error', label: 'Errors' },
          { value: 'warning', label: 'Warnings' },
        ]}
      />
    )
  }

  it('is a radio group whose arrows move and select', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: 'Rows' })
    expect(within(group).getByRole('radio', { name: 'All' })).toBeChecked()

    await user.tab()
    expect(within(group).getByRole('radio', { name: 'All' })).toHaveFocus()
    // Hold the key like a person does: Radix moves focus on the next tick and selects the
    // segment that receives focus while an arrow key is down.
    await user.keyboard('{ArrowRight>}')
    const errors = within(group).getByRole('radio', { name: 'Errors' })
    await vi.waitFor(() => expect(errors).toHaveFocus())
    await user.keyboard('{/ArrowRight}')
    expect(errors).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith('error')

    await user.keyboard('{ArrowLeft>}')
    const all = within(group).getByRole('radio', { name: 'All' })
    await vi.waitFor(() => expect(all).toHaveFocus())
    await user.keyboard('{/ArrowLeft}')
    expect(all).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith('all')
  })

  it('keeps a single tab stop on the selected segment', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Harness />
        <button type="button">After</button>
      </>,
    )
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
  })
})

describe('Button asChild', () => {
  it('renders icon, label, count and key cap inside the child link', () => {
    const errors = vi.spyOn(console, 'error')
    renderWithProviders(
      <Button asChild variant="primary" icon={Plus} shortcut="n" count={3}>
        <a href="/service-requests/new">New request</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: /^New request/ })
    expect(link).toHaveAttribute('href', '/service-requests/new')
    expect(link).toHaveAttribute('aria-keyshortcuts', 'N')
    expect(link.querySelector('svg')).not.toBeNull()
    expect(link.querySelector('kbd')).toHaveTextContent('N')
    // icon first, then the link's own text, then count and key cap
    expect(link.textContent).toBe('New request3N')
    expect(link.className).toContain('hg-focus-on-accent')
    expect(screen.queryByRole('button')).toBeNull()
    expect(errors).not.toHaveBeenCalled()
  })

  it('keeps key caps out of a plain button name', () => {
    renderWithProviders(
      <Button shortcut="mod+z" icon={Plus}>
        Undo
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Undo' })
    expect(button.getAttribute('aria-keyshortcuts')).toMatch(/^(Control|Meta)\+Z$/)
  })
})

describe('ariaKeyshortcuts', () => {
  it('maps the shortcut syntax to ARIA key names', () => {
    expect(ariaKeyshortcuts('shift+x')).toBe('Shift+X')
    expect(ariaKeyshortcuts('enter')).toBe('Enter')
    expect(ariaKeyshortcuts('mod+enter')).toMatch(/^(Control|Meta)\+Enter$/)
    expect(ariaKeyshortcuts('g p')).toBeUndefined()
    expect(ariaKeyshortcuts(undefined)).toBeUndefined()
  })
})

describe('picker trigger names', () => {
  it('adds what the trigger shows unless it already starts with the label', () => {
    expect(pickerName('Region', 'Riverton, Hillford')).toBe('Region: Riverton, Hillford')
    expect(pickerName('Created', 'Any date')).toBe('Created: Any date')
    expect(pickerName('Add article', 'Add article…')).toBe('Add article')
  })

  const options = [
    { value: 'riv', label: 'Riverton' },
    { value: 'hil', label: 'Hillford' },
    { value: 'eas', label: 'Eastgate' },
  ]

  it('Combobox keeps its value in the accessible name and marks chosen options', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState<string[]>(['hil'])
      return (
        <Combobox
          multiple
          label="Region"
          options={options}
          value={value}
          onValueChange={setValue}
        />
      )
    }
    renderWithProviders(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Region: Hillford' })
    await user.click(trigger)
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'Hillford' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(listbox).getByRole('option', { name: 'Riverton' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await user.click(within(listbox).getByRole('option', { name: 'Riverton' }))
    expect(screen.getByRole('button', { name: 'Region: Riverton, Hillford' })).toBeInTheDocument()
  })

  it('Combobox without a value says "Any"', () => {
    renderWithProviders(
      <Combobox label="Region" options={options} value={undefined} onValueChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Region: Any' })).toBeInTheDocument()
  })

  it('DatePicker names its value and flags a typed date it cannot read', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DatePicker label="Resume on" value={undefined} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Resume on: Pick a date' }))
    const field = await screen.findByRole('textbox', { name: 'Type a date' })
    await user.type(field, 'someday{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Can't read “someday”/)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/Can't read/)
    await user.type(field, 'x')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(field).not.toHaveAttribute('aria-invalid')
  })
})
