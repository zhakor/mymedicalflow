import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar, type NavRoute } from './Sidebar'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
  activeRoute: NavRoute
  onNavigate: (route: NavRoute) => void
}

export function AppLayout({ children, activeRoute, onNavigate }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 dark:bg-gray-950">
      {/* Sidebar wrapper — anima la larghezza */}
      <div
        className={clsx(
          'relative flex-shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} collapsed={collapsed} />
      </div>

      {/* Tab toggle — segue il bordo destro della sidebar */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{ left: collapsed ? '4rem' : '16rem' }}
        className="fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-14 rounded-r-lg bg-white dark:bg-gray-900 border border-l-0 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-teal-500 dark:hover:text-teal-400 shadow-md transition-[left] duration-300 ease-in-out"
        aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Contenuto principale */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
