import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './components/shared/Toast'
import { AuthProvider } from './components/shared/AuthProvider'
import { AuthGuard, AdminGuard } from './components/shared/AuthGuard'
import { Layout } from './components/shared/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { InventoryPage } from './pages/InventoryPage'
import { ClientsPage } from './pages/ClientsPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { QuickHirePage } from './pages/QuickHirePage'
import { WarehousePage } from './pages/WarehousePage'
import { CheckPage } from './pages/CheckPage'
import { Button } from './components/shared/Button'

// Reports is the only chart-heavy view and isn't on the daily path.
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

function PageFallback() {
  return <div className="p-6 text-sm text-gray-400">Loading…</div>
}

/**
 * Providers live inside the router so descendants (and the auth guard) can use
 * router hooks, and so unsaved-changes blocking works via the data router.
 */
function Providers() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  )
}

function RouteError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          This page failed to load. Reloading usually clears it.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <Providers />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: <AuthGuard><Layout /></AuthGuard>,
        children: [
          { index: true,             element: <DashboardPage /> },
          { path: 'projects',        element: <ProjectsPage /> },
          { path: 'projects/:id',    element: <ProjectDetailPage /> },
          { path: 'projects/:id/check', element: <CheckPage /> },
          { path: 'quick',           element: <QuickHirePage /> },
          { path: 'warehouse',       element: <WarehousePage /> },
          { path: 'inventory',       element: <InventoryPage /> },
          { path: 'clients',         element: <ClientsPage /> },
          { path: 'calendar',        element: <CalendarPage /> },
          { path: 'reports',         element: <ReportsPage /> },
          { path: 'settings',        element: <SettingsPage /> },
          { path: 'users',           element: <AdminGuard><UsersPage /></AdminGuard> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
