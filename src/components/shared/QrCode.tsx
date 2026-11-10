import { useMemo } from 'react'
import { qrPath } from '../../lib/qr'

export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => qrPath(value), [value])
  // 2-module quiet zone so phone cameras lock on quickly.
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} role="img" aria-label={`QR code for ${value}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
