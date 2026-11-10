import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X } from 'lucide-react'

/** Ignore the same code for this long, so holding the camera on a label counts once. */
const REPEAT_MS = 1500

/**
 * Reads QR labels with the device camera. Works in any modern phone or tablet
 * browser over HTTPS — no app, no hardware scanner.
 */
export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan })

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const seen = { code: '', at: 0 }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      if (video && ctx && video.readyState >= 2 && video.videoWidth > 0) {
        // Downscale: plenty for a label, and far cheaper to decode on an old phone.
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const hit = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
        const code = hit?.data.trim()
        const now = performance.now()
        if (code && (code !== seen.code || now - seen.at > REPEAT_MS)) {
          seen.code = code
          seen.at = now
          setLast(code)
          navigator.vibrate?.(60)
          onScanRef.current(code)
        }
      }
      frame = requestAnimationFrame(tick)
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      // Reported asynchronously so the effect itself never sets state.
      queueMicrotask(() => setError('This browser cannot open the camera. The page must be loaded over https.'))
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(s => {
        if (stopped) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        const video = videoRef.current
        if (video) { video.srcObject = s; void video.play().catch(() => {}) }
        frame = requestAnimationFrame(tick)
      })
      .catch(() => setError('Camera access was blocked. Allow it for this site in your browser settings, then try again.'))

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      <video ref={videoRef} playsInline muted className="w-full h-56 object-cover" />
      {!error && <div className="absolute inset-0 m-auto w-40 h-40 border-2 border-white/80 rounded-xl pointer-events-none" aria-hidden="true" />}
      {error && <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-white px-6">{error}</p>}
      {last && !error && (
        <p className="absolute bottom-2 left-2 right-12 text-xs text-white bg-black/60 rounded px-2 py-1 truncate">Last scan: {last}</p>
      )}
      <button type="button" onClick={onClose} aria-label="Close camera"
        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer">
        <X size={18} />
      </button>
    </div>
  )
}
