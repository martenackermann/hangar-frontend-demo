import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from '@/lib/enums/catalog'
import { filterNavEntries, getAllNavEntries, groupNavEntries } from './registry'

const all = getAllNavEntries()

function groupsFor(role: keyof typeof ROLE_PERMISSIONS) {
  return groupNavEntries(filterNavEntries(all, ROLE_PERMISSIONS[role]), role)
}

describe('navigation (SCREENS.md §1.2, SPEC_RESOLUTIONS #36)', () => {
  it('collects every module nav.ts with unique ids and shortcuts', () => {
    const ids = all.map((e) => e.id)
    const shortcuts = all.flatMap((e) => (e.shortcut ? [e.shortcut] : []))
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
    expect(all.map((e) => e.to)).toEqual(
      expect.arrayContaining(['/pipeline', '/service-requests', '/stock/matrix', '/admin/users']),
    )
  })

  it('shows the Admin group only with master.manage or users.manage', () => {
    expect(groupsFor('admin').map((g) => g.id)).toContain('admin')
    for (const role of ['viewer', 'technician', 'dispatcher'] as const) {
      expect(groupsFor(role).map((g) => g.id)).not.toContain('admin')
    }
  })

  it('filters entries by permission per role', () => {
    const labels = (role: keyof typeof ROLE_PERMISSIONS) =>
      groupsFor(role).flatMap((g) => g.entries.map((e) => e.label))
    expect(labels('viewer')).toEqual(
      expect.arrayContaining(['Pipeline', 'Service requests', 'Personalization', 'Imports']),
    )
    expect(labels('viewer')).not.toContain('My tour')
    expect(labels('viewer')).not.toContain('Installation places')
    expect(labels('technician')).toEqual(expect.arrayContaining(['My tour', 'Installation places']))
    expect(labels('technician')).not.toContain('Imports')
    expect(labels('technician')).not.toContain('Communications')
    expect(labels('dispatcher')).toContain('Deactivation import')
    expect(labels('admin')).toContain('Users')
  })

  it('puts Field first for technicians', () => {
    expect(groupsFor('technician')[0]?.id).toBe('field')
    expect(groupsFor('dispatcher')[0]?.id).toBe('overview')
  })
})
