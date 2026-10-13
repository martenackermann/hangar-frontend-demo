import type {
  ArticleRef,
  AssetDetail,
  AssetListItem,
  AssetMovement,
  AssetSummary,
  AttentionFlag,
  ContactDetail,
  ContactListItem,
  ContactRef,
  DeliveryType,
  DeviationCode,
  HistoryEntry,
  LeaseReturnDetail,
  LeaseReturnListItem,
  LocationRef,
  Me,
  Persona,
  PipelineStage,
  Region,
  RegionRef,
  SavedView,
  ServiceRequestDetail,
  ServiceRequestItem,
  ServiceRequestListItem,
  ServiceRequestStatus,
  Site,
  SiteRef,
  StockLocation,
  UserRef,
  UserSummary,
} from '@/lib/api/types'
import { PERSONAS, ROLE_PERMISSIONS } from '@/lib/enums/catalog'
import { addWorkingDays, businessToday, daysBetween, toBusinessDate } from '@/lib/format'
import type { MockActor } from '@/mocks/auth'
import { db } from '@/mocks/db'
import { evaluateActions } from '@/mocks/workflow'
import { servedEnums } from './fixture'
import type {
  AssetMovementRow,
  AssetRow,
  ContactRow,
  LeaseReturnRow,
  ServiceRequestItemRow,
  ServiceRequestRow,
  SiteRow,
  UserRow,
} from './tables'

/**
 * Core read models (SPEC_RESOLUTIONS #1): the ONE place that turns raw rows into the API.md
 * DTOs — `ServiceRequestListItem/Detail`, `LeaseReturnListItem/Detail`, `AssetListItem/Detail`,
 * contacts, references — including `attention` (SPEC §6.14) and `availableActions` /
 * `blockedActions` (via the workflow engine). Slice mocks call these; they never rebuild DTOs.
 */

export const SR_TERMINAL = new Set<ServiceRequestStatus>(['completed', 'cancelled'])
export const WITH_APPT = new Set<ServiceRequestStatus>([
  'appointment_booked',
  'personalization_in_progress',
  'personalization_done',
  'ready_for_picking',
  'provided',
  'shipped',
])
export const HOLD_GROUP = 'Rollout Hardware Hold'

// ---- references ----------------------------------------------------------------------------

export function displayName(user: { firstName: string | null; lastName: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ')
}

export function userRef(id: number | null | undefined): UserRef | null {
  const user = id ? db.collection('users').get(id) : undefined
  return user
    ? { id: user.id, displayName: displayName(user), email: user.email, role: user.role }
    : null
}

export function siteRef(id: number | null | undefined): SiteRef | null {
  const site = id ? db.collection('sites').get(id) : undefined
  return site ? { id: site.id, code: site.code, name: site.name, kind: site.kind } : null
}

export function regionRef(id: number | null | undefined): RegionRef | null {
  const region = id ? db.collection('regions').get(id) : undefined
  return region ? { id: region.id, code: region.code, name: region.name } : null
}

export function locationRef(id: number | null | undefined): LocationRef | null {
  const location = id ? db.collection('stock_locations').get(id) : undefined
  return location
    ? {
        id: location.id,
        code: location.code,
        name: location.name,
        type: location.type,
        siteId: location.siteId,
      }
    : null
}

export function articleRef(id: number | null | undefined): ArticleRef | null {
  const article = id ? db.collection('articles').get(id) : undefined
  return article
    ? {
        id: article.id,
        number: article.number,
        name: article.name,
        modelNumber: article.modelNumber,
        internalDescription: article.internalDescription,
        category: article.category,
      }
    : null
}

export function contactRef(contact: ContactRow): ContactRef {
  return {
    id: contact.id,
    userId: contact.userId,
    displayName: displayName(contact),
    email: contact.email,
  }
}

export function site(row: SiteRow): Site {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    parentSiteId: row.parentSiteId,
    address: { street: row.street, zip: row.zip, city: row.city, country: row.country },
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    locations: db
      .collection('stock_locations')
      .filter((l) => l.siteId === row.id)
      .map((l) => locationRef(l.id))
      .filter((l): l is LocationRef => l !== null),
  }
}

export function region(id: number): Region | null {
  const row = db.collection('regions').get(id)
  if (!row) return null
  const supplying = siteRef(row.supplyingSiteId)
  if (!supplying) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    supplyingSite: supplying,
    defaultDeliveryType: row.defaultDeliveryType,
    bookingDestinationId: row.bookingDestinationId,
    bookingServiceId: row.bookingServiceId,
    pickupPoint: row.pickupPointName
      ? {
          name: row.pickupPointName,
          street: row.pickupPointStreet,
          zip: row.pickupPointZip,
          city: row.pickupPointCity,
        }
      : null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    ruleCount: db.collection('region_rules').count((rule) => rule.regionId === row.id),
    openServiceRequests: db
      .collection('service_requests')
      .count((sr) => sr.regionId === row.id && !SR_TERMINAL.has(sr.status)),
  }
}

export function stockLocation(id: number): StockLocation | null {
  const row = db.collection('stock_locations').get(id)
  const ref = locationRef(id)
  if (!row || !ref) return null
  return { ...ref, isActive: row.isActive, sortOrder: row.sortOrder, site: siteRef(row.siteId) }
}

export function userSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: displayName(row),
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    homeSite: siteRef(row.homeSiteId),
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    isDemoPersona: row.isDemoPersona,
  }
}

export function me(row: UserRow): Me {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: displayName(row),
    role: row.role,
    permissions: [...ROLE_PERMISSIONS[row.role]],
    homeSite: siteRef(row.homeSiteId),
    isDemoPersona: row.isDemoPersona,
  }
}

export function persona(row: UserRow): Persona {
  const info = PERSONAS.find((p) => p.email === row.email)
  const roleLabel = servedEnums().role.find((r) => r.value === row.role)?.label ?? row.role
  return {
    email: row.email,
    displayName: displayName(row),
    role: row.role,
    roleLabel: info?.roleLabel ?? roleLabel,
    description: info?.description ?? `${roleLabel} persona`,
    homeSite: siteRef(row.homeSiteId),
    group: info?.group ?? 'more_technicians',
    initials: info?.initials ?? `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`,
  }
}

export function deviationCode(id: number): DeviationCode | null {
  const row = db.collection('deviation_codes').get(id)
  return row ? { ...row } : null
}

export function savedView(
  row: {
    id: number
    userId: number
    route: string
    name: string
    search: Record<string, unknown>
    isShared: boolean
    sortOrder: number
    createdAt: string
  },
  actor: MockActor | null,
): SavedView {
  const owner = userRef(row.userId)
  return {
    id: row.id,
    route: row.route,
    name: row.name,
    search: row.search,
    isShared: row.isShared,
    sortOrder: row.sortOrder,
    owner: owner ?? { id: row.userId, displayName: 'Unknown', email: '', role: 'viewer' },
    isOwn: actor?.id === row.userId,
    createdAt: row.createdAt,
  }
}

// ---- service requests ---------------------------------------------------------------------

export function stageOf(status: ServiceRequestStatus): PipelineStage {
  return servedEnums().serviceRequestStatus.find((s) => s.value === status)?.stage ?? 'imported'
}

export function effectiveDeliveryType(
  sr: Pick<ServiceRequestRow, 'deliveryType' | 'deliveryTypeOverride'>,
): DeliveryType | null {
  return sr.deliveryTypeOverride ?? sr.deliveryType
}

export function itemsOf(srId: number): ServiceRequestItemRow[] {
  const order = [
    'new_base',
    'new_peripheral_1',
    'new_peripheral_2',
    'old_base',
    'old_peripheral_1',
    'old_peripheral_2',
  ]
  return db
    .collection('service_request_items')
    .filter((item) => item.serviceRequestId === srId)
    .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
}

export function srAttention(sr: ServiceRequestRow, now = new Date()): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  const terminal = SR_TERMINAL.has(sr.status)
  const today = businessToday()
  const contact = db.collection('contacts').get(sr.contactId)
  if (!terminal && sr.regionId === null) flags.push('region_unresolved')
  if (!terminal && !contact?.email) flags.push('contact_email_missing')
  if (
    !terminal &&
    itemsOf(sr.id).some((item) => item.slot.startsWith('new_') && item.articleId === null)
  ) {
    flags.push('unknown_article')
  }
  if (
    ['appointment_booked', 'personalization_in_progress', 'personalization_done'].includes(
      sr.status,
    ) &&
    sr.appointmentStartAt &&
    toBusinessDate(sr.appointmentStartAt) <= addWorkingDays(today, 1)
  ) {
    flags.push('appointment_soon_not_ready')
  }
  if (
    WITH_APPT.has(sr.status) &&
    sr.appointmentEndAt &&
    Date.parse(sr.appointmentEndAt) < now.getTime() - 86_400_000
  ) {
    flags.push('appointment_overdue')
  }
  if (
    sr.status === 'escalated' &&
    sr.communicationDate &&
    daysBetween(sr.communicationDate, today) >= 7
  ) {
    flags.push('escalated_stale')
  }
  if (!terminal && sr.itsmState === 'Closed Complete') flags.push('itsm_closed')
  if (
    sr.status === 'hardware_unavailable' &&
    sr.holdSource === 'import' &&
    sr.assignmentGroup !== HOLD_GROUP
  ) {
    flags.push('hold_group_left')
  }
  return flags
}

export function assetSummary(asset: AssetRow): AssetSummary {
  const sr = asset.serviceRequestId
    ? db.collection('service_requests').get(asset.serviceRequestId)
    : undefined
  return {
    id: asset.id,
    serialNumber: asset.serialNumber,
    assetTag: asset.assetTag,
    article: articleRef(asset.articleId),
    model: asset.model,
    status: asset.status,
    location: locationRef(asset.locationId) ?? {
      id: asset.locationId,
      code: '?',
      name: 'Unknown',
      type: 'goods_in',
      siteId: null,
    },
    installationPlace: asset.installationPlace,
    serviceRequest: sr ? { id: sr.id, number: sr.number } : null,
  }
}

export function srItem(item: ServiceRequestItemRow): ServiceRequestItem {
  const asset = item.assetId ? db.collection('assets').get(item.assetId) : undefined
  return {
    id: item.id,
    slot: item.slot,
    direction: item.slot.startsWith('new_') ? 'deliver' : 'collect',
    requestedType: item.requestedType,
    article: articleRef(item.articleId),
    expectedAssetTag: item.expectedAssetTag,
    asset: asset ? assetSummary(asset) : null,
    assignedAt: item.assignedAt,
    assignedBy: userRef(item.assignedBy),
    packedAt: item.packedAt,
    packedBy: userRef(item.packedBy),
    verifiedAt: item.verifiedAt,
    verifiedBy: userRef(item.verifiedBy),
    verifiedSerial: item.verifiedSerial,
  }
}

export function srListItem(sr: ServiceRequestRow, actor: MockActor | null): ServiceRequestListItem {
  const contact = db.collection('contacts').get(sr.contactId)
  return {
    id: sr.id,
    number: sr.number,
    taskNumber: sr.taskNumber,
    status: sr.status,
    stage: stageOf(sr.status),
    statusChangedAt: sr.statusChangedAt,
    contact: contact
      ? contactRef(contact)
      : { id: sr.contactId, userId: '?', displayName: 'Unknown', email: null },
    region: regionRef(sr.regionId),
    supplyingSite: siteRef(sr.supplyingSiteId),
    deliveryType: effectiveDeliveryType(sr),
    isCampus: sr.isCampus,
    isVip: sr.isVip,
    procurementType: sr.procurementType,
    newItemTypes: itemsOf(sr.id)
      .filter((item) => item.slot.startsWith('new_'))
      .map((item) => item.requestedType ?? '')
      .filter(Boolean),
    appointmentStartAt: sr.appointmentStartAt,
    appointmentEndAt: sr.appointmentEndAt,
    appointmentCalendarId: sr.appointmentCalendarId,
    appointmentCalendarName: sr.appointmentCalendarName,
    communicationDate: sr.communicationDate,
    communicationPaused: sr.communicationPaused,
    communicationResumeDate: sr.communicationResumeDate,
    editor: userRef(sr.editorUserId),
    importedAt: sr.importedAt,
    attention: srAttention(sr),
    availableActions: evaluateActions('serviceRequest', sr, actor).availableActions,
  }
}

export function bookingLink(sr: ServiceRequestRow): string | null {
  if (sr.isCampus || !sr.regionId) return null
  const row = db.collection('regions').get(sr.regionId)
  if (!row?.bookingDestinationId || !row.bookingServiceId) return null
  return `https://booking.example.com/${row.bookingDestinationId}?service=${row.bookingServiceId}&ref=${sr.number}`
}

export function srDetail(sr: ServiceRequestRow, actor: MockActor | null): ServiceRequestDetail {
  const { availableActions, blockedActions } = evaluateActions('serviceRequest', sr, actor)
  const rule = sr.regionRuleId ? db.collection('region_rules').get(sr.regionRuleId) : undefined
  const deviation = sr.deviationCodeId ? deviationCode(sr.deviationCodeId) : null
  return {
    ...srListItem(sr, actor),
    availableActions,
    blockedActions,
    version: sr.version,
    itsmState: sr.itsmState,
    assignmentGroup: sr.assignmentGroup,
    openedAt: sr.openedAt,
    catalogItem: sr.catalogItem,
    shortDescription: sr.shortDescription,
    costCenter: sr.costCenter,
    scopeOfDelivery: sr.scopeOfDelivery,
    clientComponent: sr.clientComponent,
    requestedSoftware: sr.requestedSoftware,
    addedSoftware: sr.addedSoftware,
    installedSoftware: sr.installedSoftware,
    note: sr.note,
    onsiteContactPhone: sr.onsiteContactPhone,
    deliveryAddress: {
      street: sr.deliveryStreet,
      zip: sr.deliveryZip,
      city: sr.deliveryCity,
      country: sr.deliveryCountry,
      room: sr.deliveryRoom,
      building: sr.deliveryBuilding,
    },
    regionRule: rule ? { id: rule.id, matchKind: rule.matchKind, pattern: rule.pattern } : null,
    regionOverridden: sr.regionOverridden,
    resolvedDeliveryType: sr.deliveryType,
    deliveryTypeOverride: sr.deliveryTypeOverride,
    resumeStatus: sr.resumeStatus,
    communicationPauseReason: sr.communicationPauseReason,
    hardwareUnavailableNotifiedAt: sr.hardwareUnavailableNotifiedAt,
    claimedAt: sr.claimedAt,
    withoutAssetPrep: sr.withoutAssetPrep,
    osReinstall: sr.osReinstall,
    deviation: deviation
      ? {
          code: {
            id: deviation.id,
            code: deviation.code,
            label: deviation.label,
            outcome: deviation.outcome,
          },
          comment: sr.deviationComment,
        }
      : null,
    items: itemsOf(sr.id).map(srItem),
    linkedLeaseReturns: db
      .collection('lease_returns')
      .filter((lr) => lr.serviceRequestId === sr.id)
      .map((lr) => ({ id: lr.id, assetTag: lr.assetTag, status: lr.status })),
    milestones: {
      personalizedAt: sr.personalizedAt,
      orderClosedAt: sr.orderClosedAt,
      providedAt: sr.providedAt,
      shippedAt: sr.shippedAt,
      completedAt: sr.completedAt,
      cancelledAt: sr.cancelledAt,
    },
    bookingLink: bookingLink(sr),
    protocolAvailable: sr.status === 'completed',
    lastImportedAt: sr.lastImportedAt,
    lastImportJobId: sr.lastImportJobId,
  }
}

// ---- lease returns ------------------------------------------------------------------------

export function leaseAttention(lr: LeaseReturnRow): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  const today = businessToday()
  const contact = lr.contactId ? db.collection('contacts').get(lr.contactId) : undefined
  if (lr.status !== 'closed' && !contact?.email) flags.push('contact_email_missing')
  if (
    lr.status === 'escalated' &&
    lr.communicationDate &&
    daysBetween(lr.communicationDate, today) >= 7
  ) {
    flags.push('escalated_stale')
  }
  if (lr.retirementDate < today && !['replacement_ordered', 'closed'].includes(lr.status))
    flags.push('retirement_passed')
  if (lr.status === 'replacement_ordered' && lr.serviceRequestId) {
    const sr = db.collection('service_requests').get(lr.serviceRequestId)
    if (sr?.status === 'completed') flags.push('not_collected')
  }
  return flags
}

export function leaseListItem(lr: LeaseReturnRow, actor: MockActor | null): LeaseReturnListItem {
  const contact = lr.contactId ? db.collection('contacts').get(lr.contactId) : undefined
  const sr = lr.serviceRequestId
    ? db.collection('service_requests').get(lr.serviceRequestId)
    : undefined
  return {
    id: lr.id,
    assetTag: lr.assetTag,
    serialNumber: lr.serialNumber,
    model: lr.model,
    modelCategory: lr.modelCategory,
    retirementDate: lr.retirementDate,
    daysUntilRetirement: daysBetween(businessToday(), lr.retirementDate),
    contact: contact ? contactRef(contact) : null,
    userId: lr.userId,
    status: lr.status,
    statusChangedAt: lr.statusChangedAt,
    isVip: lr.isVip,
    isCampus: lr.isCampus,
    communicationDate: lr.communicationDate,
    communicationPaused: lr.communicationPaused,
    communicationResumeDate: lr.communicationResumeDate,
    serviceRequest: sr ? { id: sr.id, number: sr.number, status: sr.status } : null,
    commentCount: db.collection('lease_return_comments').count((c) => c.leaseReturnId === lr.id),
    attention: leaseAttention(lr),
    availableActions: evaluateActions('leaseReturn', lr, actor).availableActions,
  }
}

export function leaseDetail(lr: LeaseReturnRow, actor: MockActor | null): LeaseReturnDetail {
  const { availableActions, blockedActions } = evaluateActions('leaseReturn', lr, actor)
  const asset = db.collection('assets').find((a) => a.assetTag === lr.assetTag)
  return {
    ...leaseListItem(lr, actor),
    availableActions,
    blockedActions,
    version: lr.version,
    checkedInAt: lr.checkedInAt,
    installStatus: lr.installStatus,
    ciName: lr.ciName,
    costCenter: lr.costCenter,
    communicationPauseReason: lr.communicationPauseReason,
    infoSentAt: lr.infoSentAt,
    reminder1SentAt: lr.reminder1SentAt,
    reminder2SentAt: lr.reminder2SentAt,
    escalationSentAt: lr.escalationSentAt,
    escalationEmail: lr.escalationEmail,
    linkedAt: lr.linkedAt,
    closedAt: lr.closedAt,
    closeReason: lr.closeReason,
    importedAt: lr.importedAt,
    lastSeenAt: lr.lastSeenAt,
    asset: asset ? assetSummary(asset) : null,
  }
}

// ---- assets -------------------------------------------------------------------------------

export function assetMovement(row: AssetMovementRow): AssetMovement {
  const sr = row.serviceRequestId
    ? db.collection('service_requests').get(row.serviceRequestId)
    : undefined
  return {
    id: row.id,
    action: row.action,
    actionLabel: servedEnums().assetAction.find((a) => a.value === row.action)?.label ?? row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromLocation: locationRef(row.fromLocationId),
    toLocation: locationRef(row.toLocationId) ?? {
      id: row.toLocationId,
      code: '?',
      name: 'Unknown',
      type: 'goods_in',
      siteId: null,
    },
    fromInstallationPlace: row.fromInstallationPlace,
    toInstallationPlace: row.toInstallationPlace,
    serviceRequest: sr ? { id: sr.id, number: sr.number } : null,
    actor: userRef(row.actorUserId),
    trigger: row.trigger,
    reason: row.reason,
    sourceRef: row.sourceRef,
    occurredAt: row.occurredAt,
  }
}

export function movementsOf(assetId: number): AssetMovementRow[] {
  return db
    .collection('asset_movements')
    .filter((m) => m.assetId === assetId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id)
}

export function assetListItem(asset: AssetRow, actor: MockActor | null): AssetListItem {
  const location = db.collection('stock_locations').get(asset.locationId)
  const contact = asset.assignedContactId
    ? db.collection('contacts').get(asset.assignedContactId)
    : undefined
  return {
    ...assetSummary(asset),
    site: siteRef(location?.siteId),
    assignedContact: contact ? contactRef(contact) : null,
    checkedInAt: asset.checkedInAt,
    statusChangedAt: asset.statusChangedAt,
    source: asset.source,
    availableActions: evaluateActions('asset', asset, actor).availableActions,
  }
}

export function assetDetail(asset: AssetRow, actor: MockActor | null): AssetDetail {
  const { availableActions, blockedActions } = evaluateActions('asset', asset, actor)
  const lease = asset.assetTag
    ? db.collection('lease_returns').find((lr) => lr.assetTag === asset.assetTag)
    : undefined
  return {
    ...assetListItem(asset, actor),
    availableActions,
    blockedActions,
    version: asset.version,
    externalAssetId: asset.externalAssetId,
    ciName: asset.ciName,
    orderNumber: asset.orderNumber,
    macAddress: asset.macAddress,
    leaseReturn: lease
      ? { id: lease.id, status: lease.status, retirementDate: lease.retirementDate }
      : null,
    recentMovements: movementsOf(asset.id).slice(0, 20).map(assetMovement),
  }
}

// ---- contacts -----------------------------------------------------------------------------

function vipOf(contact: ContactRow) {
  return db.collection('vip_entries').find((v) => v.userId === contact.userId)
}

export function contactListItem(contact: ContactRow): ContactListItem {
  return {
    id: contact.id,
    userId: contact.userId,
    displayName: displayName(contact),
    email: contact.email,
    department: contact.department,
    city: contact.city,
    isVip: Boolean(vipOf(contact)),
    openServiceRequests: db
      .collection('service_requests')
      .count((sr) => sr.contactId === contact.id && !SR_TERMINAL.has(sr.status)),
    openLeaseReturns: db
      .collection('lease_returns')
      .count(
        (lr) =>
          lr.contactId === contact.id && !['closed', 'replacement_ordered'].includes(lr.status),
      ),
  }
}

export function contactDetail(contact: ContactRow): ContactDetail {
  const vip = vipOf(contact)
  return {
    ...contactListItem(contact),
    gender: contact.gender,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    mobile: contact.mobile,
    address: {
      street: contact.street,
      zip: contact.zip,
      city: contact.city,
      building: contact.building,
      room: contact.room,
    },
    isActive: contact.isActive,
    vip: vip ? { vipType: vip.vipType, title: vip.title } : null,
    serviceRequests: db
      .collection('service_requests')
      .filter((sr) => sr.contactId === contact.id)
      .map((sr) => ({ id: sr.id, number: sr.number, status: sr.status })),
    leaseReturns: db
      .collection('lease_returns')
      .filter((lr) => lr.contactId === contact.id)
      .map((lr) => ({ id: lr.id, assetTag: lr.assetTag, status: lr.status })),
  }
}

// ---- history ------------------------------------------------------------------------------

/** Transition + comment entries of an SR or lease return (H1 adds mails). Newest first. */
export function historyEntries(
  entityType: 'service_request' | 'lease_return',
  entityId: number,
): HistoryEntry[] {
  const transitions: HistoryEntry[] = db
    .collection('status_transitions')
    .filter((t) => t.entityType === entityType && t.entityId === entityId)
    .map((t) => ({
      kind: 'transition',
      id: `transition:${t.id}`,
      occurredAt: t.occurredAt,
      actor: userRef(t.actorUserId),
      trigger: t.trigger,
      action: t.action,
      actionLabel:
        servedEnums().transitions[
          entityType === 'service_request' ? 'serviceRequest' : 'leaseReturn'
        ].find((d) => d.action === t.action)?.label ?? t.action.replace(/_/g, ' '),
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      comment: t.comment,
      payload: t.payload,
    }))
  const extra: HistoryEntry[] =
    entityType === 'lease_return'
      ? db
          .collection('lease_return_comments')
          .filter((c) => c.leaseReturnId === entityId)
          .map((c) => ({
            kind: 'comment',
            id: `comment:${c.id}`,
            occurredAt: c.createdAt,
            actor: userRef(c.authorUserId),
            trigger: 'user',
            body: c.body,
          }))
      : db
          .collection('asset_movements')
          .filter((m) => m.serviceRequestId === entityId)
          .map((m) => {
            const asset = db.collection('assets').get(m.assetId)
            return {
              kind: 'asset_movement',
              id: `asset_movement:${m.id}`,
              occurredAt: m.occurredAt,
              actor: userRef(m.actorUserId),
              trigger: m.trigger,
              movementId: m.id,
              asset: {
                id: m.assetId,
                serialNumber: asset?.serialNumber ?? '?',
                assetTag: asset?.assetTag ?? null,
              },
              action: m.action,
              fromStatus: m.fromStatus,
              toStatus: m.toStatus,
              fromLocation: locationRef(m.fromLocationId),
              toLocation: locationRef(m.toLocationId) ?? {
                id: m.toLocationId,
                code: '?',
                name: 'Unknown',
                type: 'goods_in',
                siteId: null,
              },
              reason: m.reason,
            }
          })
  return [...transitions, ...extra].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}
