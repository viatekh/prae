import { useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { ToastContext, type ToastType } from '../../lib/toast-context'

interface Toast { id: number; message: string; type: ToastType }

const DISMISS_AFTER_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // A ref, not a local `let` — a plain variable resets to 0 on every render,
  // which produced duplicate ids and dismissed the wrong toast.
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId.current
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
  }, [dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="fixed bottom-20 md:bottom-4 right-4 z-[60] space-y-2 max-w-sm"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(toast => (
          <div key={toast.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white
              ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
            {toast.type === 'error'
              ? <AlertCircle size={16} className="shrink-0 mt-0.5" />
              : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"
              className="opacity-70 hover:opacity-100 shrink-0 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
