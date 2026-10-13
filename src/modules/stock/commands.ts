import type { CommandDescriptor } from '@/lib/registry'

/**
 * ⌘K actions contributed by H5 (SCREENS.md §1.3), shown only with `permission`.
 * Example:
 *   { id: 'stock.example', label: 'Do something', permission: 'sr.read', run: ({ navigate }) => navigate('/pipeline') }
 */
export const commands: CommandDescriptor[] = []
