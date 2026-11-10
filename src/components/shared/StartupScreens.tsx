/** Shown instead of the app when it cannot start, so a bad deploy explains itself. */
export function SetupNeeded({ problems }: { problems: string[] }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">PRAE isn't connected to its database yet</h1>
        <ul className="list-disc pl-5 space-y-1 text-sm text-red-700">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
          <li>In Vercel, open the project → Settings → Environment Variables.</li>
          <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (exact names), ticked for Production.</li>
          <li>Go to Deployments → the latest one → ⋯ → Redeploy. Values only take effect in a new build.</li>
        </ol>
      </div>
    </div>
  )
}

export function StartupFailed({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg bg-white border border-gray-200 rounded-xl p-6 space-y-2">
        <h1 className="text-lg font-semibold text-gray-900">PRAE failed to start</h1>
        <p className="text-sm text-red-700 break-words">{message}</p>
        <p className="text-sm text-gray-600">Reload the page. If this stays, send this message to whoever set the site up.</p>
      </div>
    </div>
  )
}
