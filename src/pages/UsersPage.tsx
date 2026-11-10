import { useState } from 'react'
import { Plus, Shield, User, Trash2, AlertTriangle, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { createAuthUser, sendPasswordReset } from '../lib/auth'
import { useAuth, type Profile } from '../lib/auth-context'
import { useQueryClient } from '@tanstack/react-query'
import { useProfiles } from '../hooks/useProfiles'
import { errorMessage } from '../lib/errors'
import { Button } from '../components/shared/Button'
import { Input } from '../components/shared/Input'
import { Modal } from '../components/shared/Modal'
import { useToast } from '../lib/toast-context'

function RoleBadge({ role }: { role: 'admin' | 'staff' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {role === 'admin' ? <Shield size={11} /> : <User size={11} />}
      {role}
    </span>
  )
}

export function UsersPage() {
  const { profile: myProfile } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: profiles = [], isLoading: loading } = useProfiles()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = () => qc.invalidateQueries({ queryKey: ['profiles'] })

  const handleRoleChange = async (profile: Profile, role: 'admin' | 'staff') => {
    setBusyId(profile.id)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(`${profile.email} is now ${role}`)
    reload()
  }

  const handleDelete = async (profile: Profile) => {
    // Goes through delete_user(), which removes the auth.users row and lets the
    // profile cascade. Deleting only the profile row left the login working.
    setBusyId(profile.id)
    const { error } = await supabase.rpc('delete_user', { target_id: profile.id })
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(`${profile.email} removed`)
    setConfirmDelete(null)
    reload()
  }

  const handlePasswordReset = async (profile: Profile) => {
    const { error } = await sendPasswordReset(profile.email)
    if (error) { toast(error.message, 'error'); return }
    toast(`Password reset email sent to ${profile.email}`)
  }

  return (
    <div className="p-3 md:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{profiles.length} user{profiles.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} />Add user</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {loading ? (
          <p className="text-sm text-gray-500 p-4">Loading…</p>
        ) : profiles.map((p, idx) => (
          <div key={p.id} className={`flex items-center gap-4 px-4 py-3 ${idx > 0 ? 'border-t border-gray-100' : ''} ${
            p.id === myProfile?.id ? 'bg-blue-50' : 'hover:bg-gray-50'
          } ${busyId === p.id ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900">{p.full_name || p.email}</span>
                {p.id === myProfile?.id && <span className="text-xs text-blue-500">(you)</span>}
              </div>
              {p.full_name && <p className="text-xs text-gray-400">{p.email}</p>}
            </div>
            <RoleBadge role={p.role} />
            {p.id !== myProfile?.id && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Send password reset" onClick={() => handlePasswordReset(p)}>
                  <KeyRound size={14} />
                </Button>
                <Button variant="ghost" size="sm" title={p.role === 'admin' ? 'Set as staff' : 'Set as admin'}
                  onClick={() => handleRoleChange(p, p.role === 'admin' ? 'staff' : 'admin')}>
                  <Shield size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(p)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>
        ))}
        {profiles.length === 0 && !loading && (
          <p className="text-sm text-gray-400 text-center py-8">No users yet</p>
        )}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-xs text-yellow-800 font-medium mb-1">Email confirmation</p>
        <p className="text-xs text-yellow-700">For users to log in immediately after creation, disable <strong>Enable email confirmations</strong> in your Supabase dashboard under Authentication → Settings. Otherwise new users must confirm their email first.</p>
      </div>

      {/* Create user modal */}
      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { reload(); setShowCreate(false) }} />

      {/* Confirm delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove user" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              Remove <strong>{confirmDelete?.email}</strong>? Their login is deleted and they lose access
              immediately. This cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" disabled={!!busyId}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}>Remove</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reset = () => { setEmail(''); setFullName(''); setPassword(''); setRole('staff'); setError('') }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: signUpError } = await createAuthUser(email, password)
      if (signUpError) { setError(signUpError.message); return }
      if (!data.user) { setError('User creation failed — no user returned'); return }

      // Update their profile with name + role
      const { error: profileError } = await supabase.from('profiles')
        .upsert({ id: data.user.id, email, full_name: fullName || null, role })
      if (profileError) { setError(profileError.message); return }

      toast(`${email} added`)
      reset()
      onCreated()
    } catch (e) {
      setError(errorMessage(e, 'Could not create the user'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { onClose(); reset() }} title="Add user" size="sm">
      <form onSubmit={handleCreate} className="space-y-4">
        <Input label="Email *" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" />
        <Input label="Full name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Optional" />
        <Input label="Initial password *" type="password" value={password} onChange={e => setPassword(e.target.value)} required
          placeholder="Min 6 characters" minLength={6} autoComplete="new-password" />
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-1">Role</legend>
          <div className="flex gap-3">
            {(['staff', 'admin'] as const).map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                <span className="text-sm capitalize text-gray-700">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button type="button" variant="secondary" onClick={() => { onClose(); reset() }}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create user'}</Button>
        </div>
      </form>
    </Modal>
  )
}
