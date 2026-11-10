import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { configProblems } from './lib/config'
import { SetupNeeded, StartupFailed } from './components/shared/StartupScreens'

const root = createRoot(document.getElementById('root')!)
const problems = configProblems({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

if (problems.length > 0) {
  root.render(<StrictMode><SetupNeeded problems={problems} /></StrictMode>)
} else {
  // Loaded only once the settings are known to be usable: the Supabase client
  // is created as soon as the app's modules are imported.
  import('./App.tsx')
    .then(({ default: App }) => root.render(<StrictMode><App /></StrictMode>))
    .catch(error => root.render(<StartupFailed message={error instanceof Error ? error.message : String(error)} />))
}
