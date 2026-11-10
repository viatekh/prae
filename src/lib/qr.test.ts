import { describe, it, expect } from 'vitest'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { qrPath } from './qr'

/** Paints a QR the way a printed label looks to a camera: black modules, white border. */
function render(text: string, scale = 4, quiet = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const width = (modules.size + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (!modules.data[y * modules.size + x]) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
        }
      }
    }
  }
  return { pixels, width }
}

describe('QR labels', () => {
  it('a printed label reads back as the item ID', () => {
    for (const id of ['CDJ3000-001', 'SM58-012', 'MAXP12-003']) {
      const { pixels, width } = render(id)
      expect(jsQR(pixels, width, width)?.data).toBe(id)
    }
  })
  it('draws one square per dark module', () => {
    const { size, path } = qrPath('DECK-001')
    const dark = QRCode.create('DECK-001', { errorCorrectionLevel: 'M' }).modules.data.filter(Boolean).length
    expect(size).toBeGreaterThan(20)
    expect(path.match(/M/g)?.length).toBe(dark)
  })
})
