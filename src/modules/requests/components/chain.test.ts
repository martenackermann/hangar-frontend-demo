import { describe, expect, it } from 'vitest'
import type { DispatchSettings, LeaseReturnDetail, ServiceRequestDetail } from '@/lib/api/types'
import { leaseChainHint, srChainHint } from './chain'

const settings = {
  leaseMailsEnabled: true,
  leaseInfoDaysBeforeRetirement: 42,
  leaseReminder1AfterDays: 7,
  leaseReminder2AfterDays: 7,
  leaseEscalationAfterDays: 7,
  srMailsEnabled: true,
  srInviteAfterImportDays: 1,
  srReminder1AfterDays: 5,
  srReminder2AfterDays: 5,
  srEscalationAfterDays: 5,
  hardwareUnavailableMailEnabled: true,
  rescheduleMailEnabled: true,
  maxMailsPerRun: 500,
} as DispatchSettings

function sr(patch: Partial<ServiceRequestDetail>): ServiceRequestDetail {
  return {
    status: 'imported',
    isCampus: false,
    importedAt: '2026-10-01T05:00:00Z',
    communicationDate: null,
    communicationResumeDate: null,
    ...patch,
  } as ServiceRequestDetail
}

function lease(patch: Partial<LeaseReturnDetail>): LeaseReturnDetail {
  return {
    status: 'imported',
    retirementDate: '2026-12-31',
    importedAt: '2026-10-01T05:00:00Z',
    communicationDate: null,
    communicationResumeDate: null,
    ...patch,
  } as LeaseReturnDetail
}

describe('chain hints (SPEC §6.3)', () => {
  it('invites N days after import; campus users get the campus info instead', () => {
    expect(srChainHint(sr({}), settings)).toMatchObject({
      action: 'send_invitation',
      dueDate: '2026-10-02',
      manualOnly: false,
    })
    expect(srChainHint(sr({ isCampus: true }), settings)?.action).toBe('send_campus_info')
  })

  it('counts reminders from the last mail and respects a later resume date', () => {
    expect(
      srChainHint(sr({ status: 'invited', communicationDate: '2026-10-05' }), settings)?.dueDate,
    ).toBe('2026-10-10')
    expect(
      srChainHint(
        sr({
          status: 'reminder_1_sent',
          communicationDate: '2026-10-05',
          communicationResumeDate: '2026-10-20',
        }),
        settings,
      )?.dueDate,
    ).toBe('2026-10-25')
  })

  it('has no automatic step after escalation and flags a switched-off chain', () => {
    expect(srChainHint(sr({ status: 'escalated' }), settings)).toBeNull()
    expect(srChainHint(sr({}), { ...settings, srMailsEnabled: false })?.manualOnly).toBe(true)
  })

  it('sends the lease info mail N days before retirement, reminders after the last mail', () => {
    expect(leaseChainHint(lease({}), settings)).toMatchObject({
      action: 'send_info',
      dueDate: '2026-11-19',
    })
    expect(
      leaseChainHint(lease({ status: 'info_sent', communicationDate: '2026-11-19' }), settings),
    ).toMatchObject({ action: 'send_reminder_1', dueDate: '2026-11-26' })
    expect(leaseChainHint(lease({ status: 'replacement_ordered' }), settings)).toBeNull()
  })
})
