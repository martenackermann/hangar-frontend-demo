import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import type {
  ArticleDetail,
  ImportDetection,
  ImportJobDetail,
  ImportRowIssue,
  JobAccepted,
  List,
  RegionResolutionResult,
  VipEntry,
} from '@/lib/api/types'
import { actorForUser } from '@/mocks/auth'
import { db } from '@/mocks/db'
import { PERSONA_EMAILS, signInAs } from '@/test/utils'
import { ORDER_DETAIL_KEYS, detectType } from './engine/formats'
import { readCsv } from './engine/reader'
import { runValidation } from './engine/run'
import { parsePacked, validateTable } from './engine/validate'

const SR_HEADER =
  'sr_number,task_number,itsm_state,assignment_group,opened_at,user_id,catalog_item,short_description,order_details,delivery_address,gender,first_name,last_name,email,cost_center'

function srLine(number: string, overrides: Partial<Record<string, string>> = {}): string {
  const v = {
    task: `TASK${number.slice(2)}`,
    state: 'Open',
    group: 'Workplace Rollout',
    user: 'T810001',
    details:
      '[Procurement type: Replacement],[New base device type: Laptop Standard 14],[Scope of delivery: Laptop, dock]',
    address: '[Street: 18 Harbour Road],[Zip: 10110],[City: Riverton]',
    email: 'mia.tester@example.com',
    ...overrides,
  }
  return `${number},${v.task},${v.state},${v.group},2026-10-12T08:14:00Z,${v.user},Workplace hardware replacement,Replace laptop,"${v.details}","${v.address}",female,Mia,Tester,${v.email},CC-4410`
}

const bytes = (text: string) => new TextEncoder().encode(text)
const dana = () => actorForUser(db.collection('users').find((u) => u.email === PERSONA_EMAILS.dispatcher)!)

function upload(content: string, filename = 'export.csv', options?: object, type?: string) {
  const form = new FormData()
  form.append('file', new File([content], filename))
  if (options) form.append('options', JSON.stringify(options))
  if (type) form.append('type', type)
  return api.upload<JobAccepted & { importJobId: number }>('/imports', form)
}

/** Let the mock job finish (its duration has passed) and read the import. */
async function finish(importJobId: number): Promise<ImportJobDetail> {
  const job = db.collection('import_jobs').get(importJobId)!
  db.collection('background_jobs').update(job.backgroundJobId, {
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  })
  return api.get<ImportJobDetail>(`/imports/${importJobId}`)
}

describe('mock import engine (port of the backend)', () => {
  it('parses packed cells and detects types by header', () => {
    const packed = parsePacked(
      '[Procurement type: Replacement],[Note: call: 9:00],[Color: Blue],[procurement type: Removal]',
      'order_details',
      ORDER_DETAIL_KEYS,
    )
    expect(packed.values.note).toBe('call: 9:00')
    expect(packed.issues.map((i) => i.code)).toEqual(['packed_unknown_key', 'packed_duplicate_key'])
    expect(detectType(['sr_number', 'order_details'])).toBe('service_requests')
    expect(detectType(['serial_number', 'install_state'])).toBe('asset_status_sync')
    expect(detectType(['user_id', 'email'])).toBeNull()
  })

  it('validates rows with the backend codes', () => {
    const table = readCsv(
      bytes(
        [
          SR_HEADER,
          srLine('SR0099001'),
          srLine('SR12AB', { task: '' }),
          srLine('SR0099003', { address: '[Street: x],[City: Riverton]' }),
          srLine('SR0099001'),
        ].join('\r\n'),
      ),
    )
    const validation = validateTable(table, 'service_requests')
    expect(validation.rows.map((r) => r.issues.map((i) => i.code))).toEqual([
      [],
      ['invalid_format'],
      ['packed_missing_key'],
      ['duplicate_in_file'],
    ])
  })

  it('creates SRs with region, VIP, campus, lease linking and hardware hold', () => {
    const lease = db.collection('lease_returns').find((l) => l.status === 'info_sent' && !l.serviceRequestId)!
    const vip = db.collection('vip_entries').all()[0]!
    const table = readCsv(
      bytes(
        [
          SR_HEADER,
          srLine('SR0099101', {
            details: `[Procurement type: Replacement],[Old base device: ${lease.assetTag}],[New base device type: Laptop Ultra 15]`,
          }),
          srLine('SR0099102', { user: vip.userId }),
          srLine('SR0099103', { address: '[Street: 1 Campus Way],[Zip: 10500],[City: Riverton]' }),
          srLine('SR0099104', { group: 'Rollout Hardware Hold' }),
        ].join('\n'),
      ),
    )
    const validation = validateTable(table, 'service_requests')
    const result = runValidation(999, 'service_requests', {}, validation, dana())
    expect(result.status).toBe('completed')
    expect(result.counts).toMatchObject({ created: 4, warnings: 1 })
    expect(result.postProcess).toMatchObject({ leaseReturnsLinked: 1, hardwareHold: 1 })
    const srs = db.collection('service_requests')
    expect(srs.find((s) => s.number === 'SR0099102')?.status).toBe('imported_vip')
    expect(srs.find((s) => s.number === 'SR0099103')?.isCampus).toBe(true)
    const held = srs.find((s) => s.number === 'SR0099104')!
    expect([held.status, held.holdSource]).toEqual(['hardware_unavailable', 'import'])
    const linked = db.collection('lease_returns').get(lease.id)!
    expect(linked.status).toBe('replacement_ordered')
    expect(linked.serviceRequestId).toBe(srs.find((s) => s.number === 'SR0099101')?.id)
  })

  it('dry runs change nothing', () => {
    const before = db.collection('service_requests').count()
    const table = readCsv(bytes([SR_HEADER, srLine('SR0099201')].join('\n')))
    const result = runValidation(998, 'service_requests', { dryRun: true }, validateTable(table, 'service_requests'), dana())
    expect(result.counts.created).toBe(1)
    expect(db.collection('service_requests').count()).toBe(before)
  })
})

describe('mock /imports endpoints', () => {
  it('detects, uploads, processes and lists issues', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const content = [SR_HEADER, srLine('SR0099301'), srLine('SR12AB', { task: '' })].join('\n')
    const form = new FormData()
    form.append('file', new File([content], 'itsm.csv'))
    const detection = await api.upload<ImportDetection>('/imports/detect', form)
    expect(detection).toMatchObject({ detectedType: 'service_requests', rowCount: 2, delimiter: ',' })

    const accepted = await upload(content)
    expect(accepted.status).toBe('queued')
    const queued = await api.get<ImportJobDetail>(`/imports/${accepted.importJobId}`)
    expect(queued.availableActions).toEqual(['cancel'])
    const done = await finish(accepted.importJobId)
    expect(done.status).toBe('completed_with_errors')
    expect(done.counts).toMatchObject({ total: 2, created: 1, errors: 1 })
    expect(done.hasErrorReport).toBe(true)
    const issues = await api.get<List<ImportRowIssue>>(`/imports/${accepted.importJobId}/errors`)
    expect(issues.data.map((i) => [i.rowNumber, i.code])).toEqual([[3, 'invalid_format']])
  })

  it('rejects bad files like the backend', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const codes: string[] = []
    for (const [content, name] of [
      ['user_id,email\nE1,a@example.com\n', 'x.csv'],
      ['sr_number,order_details\nSR0012345,x\n', 'x.csv'],
      ['user_id,last_name\n', 'x.csv'],
    ] as const) {
      try {
        await upload(content, name)
      } catch (error) {
        if (isApiError(error)) codes.push(`${error.status} ${error.code}`)
      }
    }
    expect(codes).toEqual([
      '422 type_not_detected',
      '422 missing_columns',
      '400 empty_file',
    ])
    await expect(upload('serial_number,model\nKD1,KD-AERO14-G3\n')).rejects.toMatchObject({
      status: 422,
      fieldErrors: { 'options.targetLocationId': expect.any(Array) },
    })
  })

  it('cancels a queued import; viewers cannot upload', async () => {
    await signInAs(PERSONA_EMAILS.dispatcher)
    const accepted = await upload([SR_HEADER, srLine('SR0099401')].join('\n'))
    const cancelled = await api.post<ImportJobDetail>(`/imports/${accepted.importJobId}/actions/cancel`, {})
    expect(cancelled.status).toBe('cancelled')
    await expect(api.post(`/imports/${accepted.importJobId}/actions/cancel`, {})).rejects.toMatchObject({
      status: 409,
      code: 'transition_not_allowed',
    })
    await signInAs(PERSONA_EMAILS.viewer)
    await expect(upload([SR_HEADER, srLine('SR0099402')].join('\n'))).rejects.toMatchObject({ status: 403 })
  })
})

describe('mock master data endpoints', () => {
  it('creates articles with hub settings and rejects duplicates', async () => {
    await signInAs(PERSONA_EMAILS.admin)
    const created = await api.post<ArticleDetail>('/articles', {
      number: 'A-19001',
      category: 'laptop',
      name: 'Test laptop',
      modelNumber: 'KD-TEST-1',
      manufacturer: 'Kestrel Devices',
      externalPartNumber: null,
      internalDescription: 'Laptop Test 15',
      weightKg: 1.5,
    })
    expect(created.siteSettings).toHaveLength(3)
    await expect(
      api.post('/articles', { ...created, number: 'A-10001', id: undefined }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('tests the resolver and keeps VIP flags in sync', async () => {
    await signInAs(PERSONA_EMAILS.admin)
    const campus = await api.post<RegionResolutionResult>('/region-rules/test', { zip: '10500' })
    expect(campus).toMatchObject({ resolved: true, isCampus: true, deliveryType: 'technician' })
    const sr = db.collection('service_requests').find((s) => s.status === 'invited' && !s.isVip)!
    const contact = db.collection('contacts').get(sr.contactId)!
    const entry = await api.post<VipEntry>('/vip-entries', {
      userId: contact.userId,
      lastName: contact.lastName,
      vipType: 'Board',
    })
    expect(db.collection('service_requests').get(sr.id)?.isVip).toBe(true)
    await api.delete(`/vip-entries/${entry.id}`)
    expect(db.collection('service_requests').get(sr.id)?.isVip).toBe(false)
  })
})
