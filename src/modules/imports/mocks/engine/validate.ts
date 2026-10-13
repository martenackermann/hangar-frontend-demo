import { getBusinessTimeZone } from '@/lib/format'
import type { ImportType } from '@/lib/api/types'
import { ITSM_STATES, SPECS, headerAnalysis, type ColumnSpec, type Kind, type PackedKeySpec } from './formats'
import type { RawTable } from './reader'

/**
 * Row validation of the mock import engine (SPEC §7.1, §7.4.1, §7.8), mirroring the backend's
 * `validate.py` + `packed.py`: same codes, severities and column names.
 */
export type Severity = 'error' | 'warning'

export interface Issue {
  severity: Severity
  code: string
  message: string
  column: string | null
  rawValue: string | null
}

export interface Row {
  number: number
  raw: Record<string, string | null>
  values: Record<string, unknown>
  issues: Issue[]
  key: string | null
  original: (string | null)[]
}

export interface Validation {
  type: ImportType
  rows: Row[]
  extraColumns: string[]
  missingColumns: string[]
  headers: string[]
}

const NULLS = new Set(['', 'N/A', '-', 'NULL'])

export function isNull(value: string | null | undefined): boolean {
  return value === null || value === undefined || NULLS.has(value.trim().toUpperCase())
}

export function issue(
  severity: Severity,
  code: string,
  message: string,
  column: string | null = null,
  raw: unknown = null,
): Issue {
  const text = raw === null || raw === undefined ? null : String(raw)
  return {
    severity,
    code,
    message,
    column,
    rawValue: text && text.length > 500 ? `${text.slice(0, 499)}…` : text,
  }
}

export const hasErrors = (row: Pick<Row, 'issues'>) => row.issues.some((i) => i.severity === 'error')
export const hasWarnings = (row: Pick<Row, 'issues'>) =>
  row.issues.some((i) => i.severity === 'warning')

// ---- cell parsers ------------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/
const EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const GENDERS: Record<string, string> = {
  female: 'female',
  f: 'female',
  male: 'male',
  m: 'male',
  diverse: 'diverse',
  d: 'diverse',
  unspecified: 'unspecified',
  u: 'unspecified',
}
const PROCUREMENT: Record<string, string> = {
  replacement: 'replacement',
  'new hire': 'new_hire',
  'additional device': 'additional_device',
  removal: 'removal',
}

class CellError extends Error {}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return local - utcMs
}

/** Wall-clock time in the business TZ → UTC ISO string. */
function businessToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const tz = getBusinessTimeZone()
  const first = guess - tzOffsetMs(guess, tz)
  return new Date(guess - tzOffsetMs(first, tz)).toISOString()
}

function validDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function parseDate(value: string): string {
  const match = DATE.exec(value.trim())
  if (!match) throw new CellError(`'${value}' is not a date (YYYY-MM-DD).`)
  if (!validDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new CellError(`'${value}' is not a valid calendar date.`)
  }
  return value.trim()
}

export function parseDateTime(value: string): string {
  const match = DATETIME.exec(value.trim())
  if (!match) throw new CellError(`'${value}' is not a date-time (YYYY-MM-DDTHH:MM[:SS][Z]).`)
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(match[i]))
  const s = match[6] ? Number(match[6]) : 0
  if (!validDate(y!, mo!, d!) || h! > 23 || mi! > 59 || s > 59) {
    throw new CellError(`'${value}' is not a valid date-time.`)
  }
  const zone = match[7]
  if (!zone) return businessToUtc(y!, mo!, d!, h!, mi!, s)
  const base = Date.UTC(y!, mo! - 1, d!, h!, mi!, s)
  if (zone === 'Z') return new Date(base).toISOString()
  const sign = zone.startsWith('-') ? -1 : 1
  const offset = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) * 60_000
  return new Date(base - offset).toISOString()
}

export function parseDateOrDateTime(value: string): string {
  if (DATE.test(value.trim())) {
    const day = parseDate(value)
    const [y, m, d] = day.split('-').map(Number)
    return businessToUtc(y!, m!, d!)
  }
  return parseDateTime(value)
}

function parseCell(kind: Kind, value: string): unknown {
  switch (kind) {
    case 'date':
      return parseDate(value)
    case 'datetime':
      return parseDateTime(value)
    case 'date_or_datetime':
      return parseDateOrDateTime(value)
    case 'email':
    case 'optional_email': {
      const email = value.trim().toLowerCase()
      if (email.length > 254 || !EMAIL.test(email))
        throw new CellError(`'${value}' is not a valid email address.`)
      return email
    }
    case 'gender': {
      const gender = GENDERS[value.trim().toLowerCase()]
      if (!gender)
        throw new CellError(`'${value}' is not a gender (female, male, diverse, unspecified).`)
      return gender
    }
    case 'procurement': {
      const found = PROCUREMENT[value.trim().toLowerCase().replace(/[\s_]+/g, ' ')]
      if (!found)
        throw new CellError(
          `'${value}' is not a procurement type (Replacement, New hire, Additional device, Removal).`,
        )
      return found
    }
    case 'zip':
      if (!/^\d{4,5}$/.test(value.trim()))
        throw new CellError(`'${value}' is not a zip code (4–5 digits).`)
      return value.trim().padStart(5, '0')
    case 'mac': {
      const digits = value.trim().toUpperCase().replace(/[:\-.\s]/g, '')
      if (!/^[0-9A-F]{12}$/.test(digits))
        throw new CellError(`'${value}' is not a MAC address (12 hex digits).`)
      return digits.match(/.{2}/g)!.join(':')
    }
    case 'phone':
      if (!/^[+0-9 ()/-]{5,40}$/.test(value.trim()))
        throw new CellError(`'${value}' is not a phone number.`)
      return value.trim()
    case 'software':
      return value
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
    default:
      return value
  }
}

function recordParse(row: Row, kind: Kind, column: string, raw: string): unknown {
  if (kind === 'itsm_state') {
    const known = ITSM_STATES.find((s) => s.toLowerCase() === raw.trim().toLowerCase())
    if (!known)
      row.issues.push(
        issue('warning', 'invalid_enum', `Unknown ITSM state '${raw}' (stored as given).`, column, raw),
      )
    return known ?? raw.trim()
  }
  try {
    return parseCell(kind, raw)
  } catch (error) {
    if (!(error instanceof CellError)) throw error
    const message = error.message
    switch (kind) {
      case 'date':
      case 'datetime':
      case 'date_or_datetime':
        row.issues.push(issue('error', 'invalid_date', message, column, raw))
        break
      case 'email':
        row.issues.push(issue('error', 'invalid_email', message, column, raw))
        break
      case 'optional_email':
        row.issues.push(issue('warning', 'invalid_email', `${message} It was ignored.`, column, raw))
        break
      case 'gender':
        row.issues.push(issue('warning', 'invalid_enum', `${message} It was ignored.`, column, raw))
        break
      case 'procurement':
        row.issues.push(issue('error', 'invalid_enum', message, column, raw))
        break
      case 'mac':
      case 'phone':
        row.issues.push(issue('warning', 'invalid_format', `${message} It was ignored.`, column, raw))
        break
      default:
        row.issues.push(issue('error', 'invalid_format', message, column, raw))
    }
    return null
  }
}

// ---- packed columns (SPEC §7.4.1) ---------------------------------------------------------------

export function parsePacked(
  raw: string | null,
  column: string,
  keys: readonly PackedKeySpec[],
): { values: Record<string, string | null>; present: Set<string>; issues: Issue[] } {
  const values: Record<string, string | null> = {}
  const present = new Set<string>()
  const issues: Issue[] = []
  const text = (raw ?? '').trim()
  const missing = () => {
    for (const key of keys) {
      if (key.required && (values[key.name] ?? null) === null) {
        issues.push(
          issue('error', 'packed_missing_key', `Required key '${key.key}' is missing.`, `${column}.${key.key}`),
        )
      }
    }
  }
  if (!text) {
    missing()
    return { values, present, issues }
  }
  if (!text.startsWith('[') || !text.endsWith(']')) {
    issues.push(
      issue('error', 'packed_format', 'Packed values must look like [Key: value],[Key: value].', column, raw),
    )
    return { values, present, issues }
  }
  const byKey = new Map(keys.map((k) => [k.key.toLowerCase(), k]))
  for (const part of text.slice(1, -1).split('],[')) {
    const colon = part.indexOf(':')
    if (colon < 0) {
      issues.push(issue('error', 'packed_format', `'[${part}]' is not a [Key: value] pair.`, column, raw))
      continue
    }
    const keyText = part.slice(0, colon).trim()
    const valueText = part.slice(colon + 1).trim()
    const spec = byKey.get(keyText.toLowerCase())
    if (!spec) {
      issues.push(
        issue('warning', 'packed_unknown_key', `Unknown key '${keyText}' was ignored.`, `${column}.${keyText}`, valueText),
      )
      continue
    }
    if (present.has(spec.name)) {
      issues.push(
        issue('error', 'packed_duplicate_key', `Key '${spec.key}' appears more than once.`, `${column}.${spec.key}`, valueText),
      )
      continue
    }
    present.add(spec.name)
    values[spec.name] = isNull(valueText) ? null : valueText
  }
  if (!issues.some((i) => i.severity === 'error')) missing()
  return { values, present, issues }
}

function packedValue(row: Row, key: PackedKeySpec, column: string, value: string): unknown {
  const label = `${column}.${key.key}`
  if (key.maxLen !== undefined && value.length > key.maxLen) {
    row.issues.push(issue('error', 'too_long', `'${key.key}' is longer than ${key.maxLen} characters.`, label, value))
    return null
  }
  if (key.kind === 'key') {
    const upper = value.toUpperCase()
    if (key.pattern && !key.pattern.test(upper)) {
      row.issues.push(issue('error', 'invalid_format', `'${value}' is not a valid asset tag.`, label, value))
      return null
    }
    return upper
  }
  return recordParse(row, key.kind ?? 'text', label, value)
}

// ---- table --------------------------------------------------------------------------------------

function clean(column: ColumnSpec, value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (NULLS.has(trimmed.toUpperCase())) return null
  return column.kind === 'key' ? trimmed.toUpperCase() : trimmed
}

export function validateTable(table: RawTable, type: ImportType): Validation {
  const spec = SPECS[type]
  const { missing, extra } = headerAnalysis(table.normalized, spec)
  const seenKeys = new Set<string>()
  const rows: Row[] = table.rows.map(({ number, cells, original }) => {
    const raw: Record<string, string | null> = {}
    for (const column of spec.columns) raw[column.name] = clean(column, cells[column.name])
    const row: Row = { number, raw, values: {}, issues: [], key: raw[spec.key] ?? null, original }
    // column-wise checks (the backend runs these vectorised in polars)
    for (const column of spec.columns) {
      const value = raw[column.name] ?? null
      if (column.required && value === null) {
        row.issues.push(issue('error', 'missing_required', `'${column.name}' is required.`, column.name))
      }
      if (value === null) continue
      const tooLong = column.maxLen !== undefined && value.length > column.maxLen
      if (tooLong) {
        row.issues.push(
          issue('error', 'too_long', `'${column.name}' is longer than ${column.maxLen} characters.`, column.name, value),
        )
      } else if (column.pattern && !column.pattern.test(value)) {
        row.issues.push(
          issue(
            'error',
            'invalid_format',
            `'${value}' does not match the format of '${column.name}' (${column.format}).`,
            column.name,
            value,
          ),
        )
      }
    }
    if (row.key !== null) {
      if (seenKeys.has(row.key)) {
        row.issues.push(
          issue(
            'error',
            'duplicate_in_file',
            `${row.key} appears more than once in this file; only the first row is imported.`,
            spec.key,
            row.key,
          ),
        )
      }
      seenKeys.add(row.key)
    }
    const failed = new Set(row.issues.filter((i) => i.severity === 'error').map((i) => i.column))
    for (const column of spec.columns) {
      const value = raw[column.name] ?? null
      const kind = column.kind ?? 'text'
      if (kind === 'packed') {
        if (failed.has(column.name) || value === null) {
          row.values[column.name] = null
          continue
        }
        const keys = spec.packed[column.name] ?? []
        const result = parsePacked(value, column.name, keys)
        row.issues.push(...result.issues)
        const parsed: Record<string, unknown> = {}
        for (const key of keys) {
          const v = result.values[key.name] ?? null
          parsed[key.name] = v === null ? null : packedValue(row, key, column.name, v)
        }
        row.values[column.name] = parsed
      } else if (value === null || failed.has(column.name)) {
        row.values[column.name] = null
      } else if (kind === 'text' || kind === 'key') {
        row.values[column.name] = value
      } else {
        row.values[column.name] = recordParse(row, kind, column.name, value)
      }
    }
    if (type === 'service_requests') {
      const details = row.values.order_details as Record<string, unknown> | null
      if (
        details &&
        details.procurement_type &&
        details.procurement_type !== 'removal' &&
        !details.new_base &&
        !row.issues.some((i) => i.code.startsWith('packed_') && i.severity === 'error')
      ) {
        row.issues.push(
          issue(
            'error',
            'packed_missing_key',
            "Required key 'New base device type' is missing (only removals may omit it).",
            'order_details.New base device type',
          ),
        )
      }
    }
    return row
  })
  return {
    type,
    rows,
    extraColumns: extra,
    missingColumns: missing,
    headers: table.headers,
  }
}

/** Failed-row report rows: original columns + `row_number,severity,column,code,message`. */
export function errorReportRows(
  validation: Pick<Validation, 'headers' | 'rows'>,
): (string | number)[][] | null {
  const lines: (string | number)[][] = []
  for (const row of validation.rows) {
    for (const i of row.issues) {
      lines.push([
        ...validation.headers.map((_, col) => row.original[col] ?? ''),
        row.number,
        i.severity,
        i.column ?? '',
        i.code,
        i.message,
      ])
    }
  }
  if (lines.length === 0) return null
  return [[...validation.headers, 'row_number', 'severity', 'column', 'code', 'message'], ...lines]
}
