/**
 * Upload reader of the mock import engine (SPEC §7.1 "Encoding", "CSV dialect", "Header"),
 * mirroring the backend's `reader.py`: UTF-8 only (BOM optional), delimiter from the header
 * line, RFC 4180 quoting, normalized headers, duplicate/empty checks. XLSX needs the real
 * backend (no spreadsheet parser in the browser demo).
 */
export type FileProblemCode =
  'encoding_unsupported' | 'empty_file' | 'duplicate_columns' | 'file_unreadable' | 'too_many_rows'

export class FileProblem extends Error {
  readonly code: FileProblemCode
  readonly status: number

  constructor(code: FileProblemCode, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export interface RawTable {
  headers: string[]
  normalized: string[]
  delimiter: ',' | ';'
  /** Data rows keyed by normalized header, with their spreadsheet row number (header = 1). */
  rows: { number: number; cells: Record<string, string | null>; original: (string | null)[] }[]
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/** One CSV line → fields (quote `"`, doubled quote escape). */
function splitLine(line: string, delimiter: string): string[] {
  return parseCsv(line, delimiter)[0] ?? []
}

export function detectDelimiter(headerLine: string): ',' | ';' {
  return splitLine(headerLine, ';').length > splitLine(headerLine, ',').length ? ';' : ','
}

/** RFC 4180 parser: CRLF or LF line ends, quoted fields may contain delimiters and newlines. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

export function readCsv(bytes: Uint8Array, maxRows?: number): RawTable {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new FileProblem(
      'encoding_unsupported',
      "The file is not UTF-8 encoded. Save it as 'CSV UTF-8' and upload it again.",
    )
  }
  text = text.replace(/^\uFEFF/, '')
  if (!text.trim()) throw new FileProblem('empty_file', 'The file is empty.')
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const records = parseCsv(text, delimiter)
  const headerCells = records[0] ?? []
  const headers = headerCells.map((h) => h.replace(/\uFEFF/g, '').trim())
  const normalized = headers.map(normalizeHeader)
  const seen = new Map<string, number>()
  const duplicates: string[] = []
  for (const name of normalized) {
    if (!name) continue
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    if (count === 2) duplicates.push(name)
  }
  if (duplicates.length) {
    throw new FileProblem('duplicate_columns', `Duplicate columns: ${duplicates.join(', ')}.`)
  }
  if (!normalized.some(Boolean)) {
    throw new FileProblem('file_unreadable', 'The first row contains no column headers.')
  }
  const rows: RawTable['rows'] = []
  records.slice(1).forEach((record, index) => {
    const original = headers.map((_, col) => record[col] ?? null)
    if (original.every((cell) => cell === null || cell.trim() === '')) return
    const cells: Record<string, string | null> = {}
    normalized.forEach((name, col) => {
      if (name) cells[name] = original[col] ?? null
    })
    rows.push({ number: index + 2, cells, original })
  })
  if (rows.length === 0) {
    throw new FileProblem('empty_file', 'The file contains a header row but no data rows.')
  }
  if (maxRows !== undefined && rows.length > maxRows) {
    throw new FileProblem(
      'too_many_rows',
      `The file has ${rows.length} data rows; at most ${maxRows} are allowed.`,
      413,
    )
  }
  return { headers, normalized, delimiter, rows }
}

export function readUpload(filename: string, bytes: Uint8Array, maxRows?: number): RawTable {
  if (filename.toLowerCase().endsWith('.xlsx')) {
    throw new FileProblem(
      'file_unreadable',
      'Excel workbooks are read by the backend only; in the demo, upload the CSV export.',
    )
  }
  return readCsv(bytes, maxRows)
}
