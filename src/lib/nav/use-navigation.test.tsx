import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { signIn, signOut } from '@/lib/auth/store'
import { useNavigation } from './use-navigation'

const baseUser = {
  id: 'u1',
  email: 'tom.technician@example.com',
  name: 'Tom Technician',
  roles: ['technician'],
}

describe('useNavigation', () => {
  it('collects nav.ts of every module and filters entries by permission', () => {
    const { result } = renderHook(() => useNavigation())

    // Signed out: only entries without a required permission.
    expect(result.current.entries.every((entry) => entry.permission === undefined)).toBe(true)

    act(() => signIn('t1', { ...baseUser, permissions: ['field:read'] }))
    const ids = result.current.entries.map((entry) => entry.id)
    expect(ids).toContain('field.index')
    expect(ids).not.toContain('requests.index')
    expect(result.current.groups.map((group) => group.id)).toEqual(['overview', 'field'])

    act(() => signIn('t1', { ...baseUser, permissions: ['*'] }))
    expect(result.current.entries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'requests.index',
        'imports.index',
        'staging.index',
        'field.index',
        'stock.index',
      ]),
    )

    act(() => signOut())
    expect(result.current.entries.some((entry) => entry.id === 'field.index')).toBe(false)
  })

  it('declares unique ids and keyboard shortcuts across modules', () => {
    act(() => signIn('t1', { ...baseUser, permissions: ['*'] }))
    const { result } = renderHook(() => useNavigation())
    const { entries } = result.current
    const shortcuts = entries.flatMap((entry) => (entry.shortcut ? [entry.shortcut] : []))
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
  })
})
