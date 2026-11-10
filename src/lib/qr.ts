import QRCode from 'qrcode'

/**
 * A QR code as an SVG path, built synchronously so it can be rendered inline
 * (and printed crisply at any label size).
 */
export function qrPath(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const { size, data } = modules
  let path = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`
    }
  }
  return { size, path }
}
