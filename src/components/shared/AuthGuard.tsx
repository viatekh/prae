import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Shield } from 'lucide-react'
import { useAuth } from '../../lib/auth-context'

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-sm text-gray-400">{children}</div>
    </div>
  )
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageMessage>Loading…</FullPageMessage>

  // Remember where the user was headed so login can send them back there.
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />

  return <>{children}</>
}

/** Renders children only for admins. Waits for the profile before deciding. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin, profileLoading } = useAuth()

  if (profileLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Shield size={18} />
          <p className="text-sm">Only admins can manage users.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
