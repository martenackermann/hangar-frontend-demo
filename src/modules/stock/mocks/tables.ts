import type {
  CallOffOrderStatus,
  DeactivationReason,
  ID,
  ISODate,
  ISODateTime,
  InventoryScanResult,
  InventoryStatus,
} from '@/lib/api/types'

/**
 * H5 tables of the demo database (SPEC §5.6) as raw camelCase rows — exactly what the backend's
 * seed exporter writes into `seed.json` (`tables.inventories`, …). Two columns go beyond the
 * SPEC table (backend README): `inventories.reconciliation` (frozen on close/cancel) and
 * `deactivation_batches.closedLeaseReturnCount` / `sample`.
 */
export interface InventoryCounts {
  expected: number
  matched: number
  missing: number
  wrongLocation: number
  unknown: number
  corrected: number | null
}

export type ReconciliationCategory = 'matched' | 'missing' | 'wrong_location' | 'unknown'

/** One frozen reconciliation entry (snapshot at close/cancel). */
export interface FrozenEntry {
  category: ReconciliationCategory
  serialNumber: string
  assetId: ID | null
  status: string | null
  recordedLocationId: ID | null
  scannedLocationId: ID | null
  scannedById: ID | null
  scannedAt: ISODateTime | null
  correctable: boolean
  corrected: boolean
}

export interface InventoryRow {
  id: ID
  siteId: ID
  status: InventoryStatus
  openedAt: ISODateTime
  openedBy: ID
  closedAt: ISODateTime | null
  closedBy: ID | null
  countDate: ISODate | null
  applyCorrections: boolean | null
  resultSummary: InventoryCounts | null
  reconciliation: FrozenEntry[] | null
  missingReportFileId: ID | null
  wrongLocationReportFileId: ID | null
  unknownReportFileId: ID | null
  note: string | null
  version: number
  createdAt: ISODateTime
}

export interface InventoryScanRow {
  id: ID
  inventoryId: ID
  serialNumber: string
  assetId: ID | null
  result: InventoryScanResult
  scannedLocationId: ID | null
  recordedLocationId: ID | null
  scannedBy: ID
  scannedAt: ISODateTime
}

export interface CallOffOrderRow {
  id: ID
  number: string
  siteId: ID
  status: CallOffOrderStatus
  deliveryDate: ISODate
  note: string | null
  recipientEmail: string
  createdBy: ID
  sentAt: ISODateTime | null
  sentBy: ID | null
  xlsxFileId: ID | null
  pdfFileId: ID | null
  version: number
  createdAt: ISODateTime
}

export interface CallOffOrderLineRow {
  id: ID
  calloffOrderId: ID
  articleId: ID
  demandQty: number
  stockQty: number
  bufferQty: number
  suggestedQty: number
  quantity: number
}

export interface DeactivationSampleRow {
  serialNumber: string
  outcome: 'deactivated' | 'already_deactivated' | 'rejected' | 'not_found'
  detail: string | null
}

export interface DeactivationBatchRow {
  id: ID
  reason: DeactivationReason
  originalFilename: string
  fileId: ID | null
  totalRows: number
  deactivatedCount: number
  alreadyDeactivatedCount: number
  rejectedCount: number
  notFoundCount: number
  closedLeaseReturnCount: number
  notFoundFileId: ID | null
  rejectedFileId: ID | null
  sample: DeactivationSampleRow[] | null
  createdBy: ID
  createdAt: ISODateTime
}

declare module '@/mocks/db' {
  interface DemoCollections {
    inventories: InventoryRow
    inventory_scans: InventoryScanRow
    calloff_orders: CallOffOrderRow
    calloff_order_lines: CallOffOrderLineRow
    deactivation_batches: DeactivationBatchRow
  }
}

export const H5_TABLES = [
  'inventories',
  'inventory_scans',
  'calloff_orders',
  'calloff_order_lines',
  'deactivation_batches',
] as const
