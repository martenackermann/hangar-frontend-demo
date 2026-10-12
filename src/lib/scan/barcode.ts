import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/**
 * Camera barcode scanning. Uses the native BarcodeDetector where it exists (Chrome on
 * Android/macOS) and the zxing-wasm based ponyfill elsewhere. The WASM binary is
 * self-hosted (bundled by Vite, precached by the PWA) instead of loaded from a CDN.
 *
 * PLACEHOLDER (phase 2a): phase 2b builds the scan-input components on top of this.
 */
export type ScanFormat =
  'code_128' | 'code_39' | 'ean_13' | 'ean_8' | 'qr_code' | 'data_matrix' | 'upc_a' | 'itf'

export interface DetectedCode {
  rawValue: string
  format: string
}

export interface CodeDetector {
  detect(source: ImageBitmapSource): Promise<DetectedCode[]>
}

export const DEFAULT_SCAN_FORMATS: readonly ScanFormat[] = [
  'code_128',
  'code_39',
  'ean_13',
  'qr_code',
  'data_matrix',
]

let ponyfillPrepared = false

export async function createCodeDetector(
  formats: readonly ScanFormat[] = DEFAULT_SCAN_FORMATS,
): Promise<CodeDetector> {
  const native = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorStatic }).BarcodeDetector
  if (native) {
    const supported = await native.getSupportedFormats()
    if (formats.every((format) => supported.includes(format))) {
      return new native({ formats: [...formats] })
    }
  }

  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  if (!ponyfillPrepared) {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
      },
    })
    ponyfillPrepared = true
  }
  return new BarcodeDetector({ formats: [...formats] })
}

interface NativeBarcodeDetectorStatic {
  new (options?: { formats?: string[] }): CodeDetector
  getSupportedFormats(): Promise<string[]>
}
