import { HttpResponse } from 'msw'
import type { DownloadLink, EntityRef } from '@/lib/api/types'
import { env } from '@/lib/env'
import { db } from './db'
import { problem } from './http'

/**
 * Mock file store (API.md §1.6, SPEC §5.1 `stored_files`): slices create files (exports, labels,
 * protocols, reports) and hand back a signed `DownloadLink`; `GET /files/{id}/download` serves
 * the bytes. Content is kept in the demo database (base64), so keep demo files small.
 *
 *   const file = storeFile({ filename: 'service-requests.csv', contentType: 'text/csv', body: csv([...]), purpose: 'export', actorId })
 *   return HttpResponse.json(downloadLink(file))
 */
export interface StoredFileRow {
  id: number
  storageKey: string
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
  purpose: string
  entityType: string | null
  entityId: number | null
  createdBy: number | null
  expiresAt: string | null
  createdAt: string
  /** Mock only: file content. */
  contentBase64: string
}

declare module './db' {
  interface DemoCollections {
    stored_files: StoredFileRow
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function storeFile(input: {
  filename: string
  contentType: string
  body: string | Uint8Array
  purpose: string
  entity?: Pick<EntityRef, 'type' | 'id'> | null
  actorId?: number | null
  /** Default 24 h (exports). Pass null to keep. */
  ttlHours?: number | null
}): StoredFileRow {
  const bytes = typeof input.body === 'string' ? new TextEncoder().encode(input.body) : input.body
  const now = new Date()
  const ttl = input.ttlHours === undefined ? 24 : input.ttlHours
  return db.collection('stored_files').insert({
    storageKey: `demo/${now.getTime()}-${input.filename}`,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: bytes.byteLength,
    sha256: '',
    purpose: input.purpose,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    createdBy: input.actorId ?? null,
    expiresAt: ttl === null ? null : new Date(now.getTime() + ttl * 3_600_000).toISOString(),
    createdAt: now.toISOString(),
    contentBase64: toBase64(bytes),
  })
}

/** Signed URL (expires after 10 minutes; the mock does not check the signature). */
export function downloadLink(file: StoredFileRow): DownloadLink {
  const expires = new Date(Date.now() + 10 * 60_000)
  const base = env.apiUrl.startsWith('http')
    ? env.apiUrl
    : `${globalThis.location?.origin ?? 'http://localhost'}${env.apiUrl}`
  return {
    url: `${base}/files/${file.id}/download?expires=${Math.floor(expires.getTime() / 1000)}&signature=demo`,
    filename: file.filename,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    expiresAt: expires.toISOString(),
  }
}

/** `GET /files/{id}/download` (public, signature-checked in the real API). */
export function serveFile(id: number, request: Request) {
  const file = db.collection('stored_files').get(id)
  if (!file)
    return problem(404, 'not_found', 'Not found', { detail: 'The file does not exist.', request })
  const expires = Number(new URL(request.url).searchParams.get('expires'))
  if (!expires || expires * 1000 < Date.now()) {
    return problem(403, 'invalid_signature', 'Link expired', {
      detail: 'Request the download again.',
      request,
    })
  }
  return new HttpResponse(fromBase64(file.contentBase64), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    },
  })
}

/** CSV per SPEC §6.20: UTF-8 with BOM, comma, RFC 4180 quoting. */
export function csv(
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  const cell = (value: string | number | boolean | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}

/**
 * Tiny single-font PDF (A4, Helvetica) for demo labels, protocols and reports. Each entry of
 * `pages` is a list of text lines; `title` lines are printed larger.
 */
export function simplePdf(
  pages: readonly { title: string; lines: readonly string[] }[],
): Uint8Array {
  const escape = (text: string) =>
    text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7e]/g, '?')
  const objects: string[] = []
  const add = (body: string) => {
    objects.push(body)
    return objects.length
  }
  const catalogId = add('') // placeholder
  const pagesId = add('')
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageIds: number[] = []
  for (const page of pages) {
    let y = 800
    const ops = [`BT /F1 16 Tf 50 ${y} Td (${escape(page.title)}) Tj ET`]
    for (const line of page.lines) {
      y -= 18
      ops.push(`BT /F1 10 Tf 50 ${y} Td (${escape(line)}) Tj ET`)
    }
    const stream = ops.join('\n')
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    )
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
