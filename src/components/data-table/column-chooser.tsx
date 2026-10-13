import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns3, GripVertical, Lock, RotateCcw } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import type { ColumnPrefs } from './column-prefs'

export interface ChooserColumn {
  id: string
  header: string
  locked?: boolean | undefined
}

/**
 * ColumnChooser (DESIGN.md §10): popover with a checkbox list (identifier column locked), drag
 * handles, `Alt+↑/↓` reorder, "Reset to default". The popover is portalled above drawers and
 * never clipped (fixes the comps); the trigger carries `aria-expanded`. Shortcut `c`.
 */
export function ColumnChooser({
  columns,
  prefs,
  onChange,
  onReset,
}: {
  columns: readonly ChooserColumn[]
  prefs: ColumnPrefs
  onChange: (prefs: ColumnPrefs) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  useShortcut('c', () => setOpen((v) => !v), { description: 'Columns', group: 'Lists' })
  const byId = new Map(columns.map((c) => [c.id, c]))
  const ordered = prefs.order
    .map((id) => byId.get(id))
    .filter((c): c is ChooserColumn => c !== undefined)
  const hidden = new Set(prefs.hidden)
  const visibleCount = ordered.filter((c) => !hidden.has(c.id)).length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const move = (id: string, delta: number) => {
    const index = prefs.order.indexOf(id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= prefs.order.length) return
    if (byId.get(prefs.order[target] ?? '')?.locked) return
    onChange({ ...prefs, order: arrayMove(prefs.order, index, target) })
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = prefs.order.indexOf(String(active.id))
    const to = prefs.order.indexOf(String(over.id))
    if (byId.get(String(over.id))?.locked) return
    onChange({ ...prefs, order: arrayMove(prefs.order, from, to) })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button icon={Columns3} size="control" shortcut="c">
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1" aria-label="Choose columns">
        <p className="px-2 pt-1.5 pb-1 text-2xs font-medium text-fg-3">
          {visibleCount} of {ordered.length} shown · drag or Alt+↑/↓ to reorder
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={prefs.order} strategy={verticalListSortingStrategy}>
            <ul className="grid">
              {ordered.map((column) => (
                <SortableColumn
                  key={column.id}
                  column={column}
                  visible={!hidden.has(column.id)}
                  onToggle={(visible) =>
                    onChange({
                      ...prefs,
                      hidden: visible
                        ? prefs.hidden.filter((id) => id !== column.id)
                        : [...prefs.hidden, column.id],
                    })
                  }
                  onMove={(delta) => move(column.id, delta)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <div className="-mx-1 my-1 h-px bg-line" />
        <button
          type="button"
          onClick={onReset}
          className="flex h-[30px] w-full items-center gap-2 rounded-xs px-2 text-left hover:bg-hover"
        >
          <Icon icon={RotateCcw} className="text-fg-3" /> Reset to default
        </button>
      </PopoverContent>
    </Popover>
  )
}

function SortableColumn({
  column,
  visible,
  onToggle,
  onMove,
}: {
  column: ChooserColumn
  visible: boolean
  onToggle: (visible: boolean) => void
  onMove: (delta: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: column.locked === true,
  })
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      onMove(event.key === 'ArrowUp' ? -1 : 1)
    }
  }
  return (
    // Alt+↑/↓ bubbles up from the row's checkbox or grip button; the <li> itself is not focusable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex h-7 items-center gap-2 rounded-xs px-2 hover:bg-hover',
        isDragging && 'z-10 bg-hover shadow-popover',
      )}
      onKeyDown={onKeyDown}
    >
      <Checkbox
        checked={visible || column.locked === true}
        disabled={column.locked}
        onCheckedChange={onToggle}
        aria-label={`Show ${column.header}`}
      />
      <span className="min-w-0 flex-1 truncate">{column.header}</span>
      {column.locked ? (
        <Icon icon={Lock} size={12} className="text-fg-3" aria-label="Always shown" />
      ) : (
        <button
          type="button"
          aria-label={`Reorder ${column.header}`}
          className="grid size-5 cursor-grab place-items-center rounded-2xs text-fg-3 hover:text-fg"
          {...attributes}
          {...listeners}
        >
          <Icon icon={GripVertical} size={14} />
        </button>
      )}
    </li>
  )
}
