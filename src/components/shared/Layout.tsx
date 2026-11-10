import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Users, FolderKanban, Calendar, Settings, Boxes, LogOut, Shield, Menu, X, Search,
  LayoutDashboard, BarChart2, Plus, MoreHorizontal, Zap, Warehouse,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../lib/auth-context'
import { useProjects } from '../../hooks/useProjects'
import { useItems } from '../../hooks/useItems'
import { useClients } from '../../hooks/useClients'

const MIN_QUERY = 2

interface SearchResult {
  key: string
  type: 'Project' | 'Client' | 'Item'
  label: string
  sub: string
  to: string
}

const TYPE_COLOR: Record<SearchResult['type'], string> = {
  Project: 'bg-blue-100 text-blue-700',
  Client: 'bg-purple-100 text-purple-700',
  Item: 'bg-gray-100 text-gray-600',
}

function GlobalSearch({ onNavigated }: { onNavigated?: () => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: projects = [] } = useProjects()
  const { data: items = [] } = useItems()
  const { data: clients = [] } = useClients()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Cmd/Ctrl-K focuses search from anywhere.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < MIN_QUERY) return []
    return [
      ...projects
        .filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.project_number.toLowerCase().includes(q) ||
          (p.client?.name || '').toLowerCase().includes(q))
        .slice(0, 4)
        .map<SearchResult>(p => ({
          key: `project-${p.id}`, type: 'Project', label: p.name, sub: p.project_number,
          to: `/projects/${p.id}`,
        })),
      ...clients
        .filter(c => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
        .slice(0, 3)
        .map<SearchResult>(c => ({
          key: `client-${c.id}`, type: 'Client', label: c.name, sub: c.company || '',
          // Deep-link straight to the client's record.
          to: `/clients?client=${c.id}`,
        })),
      ...items
        .filter(i => i.name.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q))
        .slice(0, 3)
        .map<SearchResult>(i => ({
          key: `item-${i.id}`, type: 'Item', label: i.name, sub: i.item_id,
          to: `/inventory?tab=items&q=${encodeURIComponent(i.item_id)}`,
        })),
    ]
  }, [query, projects, clients, items])

  const go = useCallback((result: SearchResult) => {
    navigate(result.to)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
    onNavigated?.()
  }, [navigate, onNavigated])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[activeIndex]) }
  }

  const listboxId = 'global-search-results'
  const showList = open && results.length > 0

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search…  ⌘K"
          aria-label="Search projects, clients and items"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listboxId}-${activeIndex}` : undefined}
          className="w-full lg:w-64 pl-8 pr-3 py-1.5 text-sm bg-white/10 text-white placeholder-gray-400 border border-white/10 rounded-lg focus:outline-none focus:bg-white/20 focus:border-white/30"
        />
      </div>
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full mt-1 w-full min-w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {results.map((r, i) => (
            <li key={r.key} id={`${listboxId}-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(r)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 cursor-pointer',
                  i === activeIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                )}
              >
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium shrink-0', TYPE_COLOR[r.type])}>{r.type}</span>
                <span className="flex-1 text-sm text-gray-900 truncate">{r.label}</span>
                {r.sub && <span className="text-xs text-gray-400 shrink-0 truncate max-w-[90px]">{r.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= MIN_QUERY && results.length === 0 && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-3 py-2.5 text-sm text-gray-400">
          No matches
        </div>
      )}
    </div>
  )
}

interface NavItem {
  to: string
  icon: typeof LayoutDashboard
  label: string
  adminOnly?: boolean
  /** Starts the "Admin" group in the sidebar. */
  group?: 'admin'
}

const NAV: NavItem[] = [
  { to: '/',          icon: LayoutDashboard, label: 'Today' },
  { to: '/projects',  icon: FolderKanban,    label: 'Projects' },
  { to: '/warehouse', icon: Warehouse,       label: 'Warehouse' },
  { to: '/inventory', icon: Boxes,           label: 'Inventory' },
  { to: '/clients',   icon: Users,           label: 'Clients' },
  { to: '/calendar',  icon: Calendar,        label: 'Calendar' },
  { to: '/reports',   icon: BarChart2,       label: 'Reports' },
  { to: '/settings',  icon: Settings,        label: 'Settings', group: 'admin' },
  { to: '/users',     icon: Shield,          label: 'Users', adminOnly: true, group: 'admin' },
]

// Bottom nav shows only the 4 most-used destinations on mobile
const BOTTOM_NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Today' },
  { to: '/quick',     icon: Zap,             label: 'Quick hire' },
  { to: '/warehouse', icon: Warehouse,       label: 'Warehouse' },
  { to: '/projects',  icon: FolderKanban,    label: 'Projects' },
]

/**
 * Defined at module scope, not inside Layout. When this lived in the render body
 * React saw a new component type on every render and remounted the whole sidebar,
 * throwing away whatever was typed in the search box.
 */
function SidebarContent({ onNavigate, onSignOut, profile, showUsers }: {
  onNavigate: () => void
  onSignOut: () => void
  profile: { full_name: string | null; email: string; role: string } | null
  showUsers: boolean
}) {
  const nav = NAV.filter(item => !item.adminOnly || showUsers)

  return (
    <>
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">PRAE</h1>
          <p className="text-xs text-gray-400 mt-0.5">Company Management</p>
        </div>
        <button onClick={onNavigate} aria-label="Close menu" className="md:hidden text-gray-400 hover:text-white p-1 cursor-pointer">
          <X size={18} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-white/10">
        <GlobalSearch onNavigated={onNavigate} />
      </div>

      <nav aria-label="Main" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* The most common starting point, reachable from every page. */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Link to="/quick" onClick={onNavigate}
            className="flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[13px] whitespace-nowrap font-medium bg-white text-gray-900 hover:bg-gray-200 transition-colors">
            <Zap size={14} />Quick hire
          </Link>
          <Link to="/projects?new=1" onClick={onNavigate}
            className="flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[13px] whitespace-nowrap font-medium bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors">
            <Plus size={14} />Project
          </Link>
        </div>
        {nav.map(({ to, icon: Icon, label, group }, i) => (
          <div key={to}>
            {group && nav[i - 1]?.group !== group && (
              <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Admin</p>
            )}
            <NavLink to={to} end={to === '/'}
              onClick={onNavigate}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-white text-gray-900 font-medium' : 'text-gray-300 hover:bg-white/10'
              )}>
              <Icon size={16} />{label}
            </NavLink>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
            {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {profile?.full_name || profile?.email || 'Signed in'}
            </p>
            {profile?.role && <p className="text-xs text-gray-400 capitalize">{profile.role}</p>}
          </div>
          <button onClick={onSignOut} title="Sign out" aria-label="Sign out"
            className="text-gray-400 hover:text-white p-1 rounded cursor-pointer shrink-0">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  )
}

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSignOut = useCallback(async () => {
    await signOut()
    navigate('/login', { replace: true })
  }, [signOut, navigate])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const sidebar = (
    <SidebarContent
      onNavigate={closeDrawer}
      onSignOut={handleSignOut}
      profile={profile}
      showUsers={isAdmin}
    />
  )

  return (
    <div className="flex h-screen print:h-auto print:block bg-gray-50 print:bg-white">
      <a href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:top-2 focus:left-2 focus:bg-gray-900 focus:text-white focus:px-3 focus:py-2 focus:rounded-lg focus:text-sm">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex print:hidden w-56 bg-gray-900 text-white flex-col shrink-0">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={closeDrawer} aria-hidden="true" />
          <aside className="relative w-64 bg-gray-900 text-white flex flex-col z-50">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
        {/* Mobile top bar */}
        <header className="md:hidden print:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 text-white shrink-0">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu"
            className="text-gray-300 hover:text-white p-1 -ml-1 cursor-pointer">
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold tracking-tight">PRAE</span>
          {/* Search was previously buried in the drawer on mobile. */}
          <div className="flex-1 min-w-0 max-w-[220px] ml-auto">
            <GlobalSearch />
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-auto print:overflow-visible pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav aria-label="Quick navigation"
          className="md:hidden print:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30">
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isActive ? 'text-gray-900 font-medium' : 'text-gray-400'
              )}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
          {/* Clients, Reports and Settings live in the drawer; this makes that discoverable. */}
          <button type="button" onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs text-gray-400 cursor-pointer">
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
