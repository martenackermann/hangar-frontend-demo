import type { CommandDescriptor } from '@/lib/registry'

/**
 * ⌘K actions contributed by H2 (SCREENS.md §1.3), shown only with `permission`.
 * Example:
 *   { id: 'imports.example', label: 'Do something', permission: 'sr.read', run: ({ navigate }) => navigate('/pipeline') }
 */
export const commands: CommandDescriptor[] = []
