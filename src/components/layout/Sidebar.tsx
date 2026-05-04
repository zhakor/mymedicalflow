import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Settings,
  UserCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { iconaWhite, iconaBlue, logoBlu, logoBianco } from '../../assets/logos'
import { useProfiloStore } from '../../stores/profiloStore'

export type NavRoute =
  | 'dashboard'
  | 'pazienti'
  | 'appuntamenti'
  | 'fatture'
  | 'impostazioni'
  | 'profilo'

interface NavItem {
  id: NavRoute
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'pazienti', label: 'Pazienti', icon: <Users size={20} /> },
  { id: 'appuntamenti', label: 'Appuntamenti', icon: <Calendar size={20} /> },
  { id: 'fatture', label: 'Fatture', icon: <FileText size={20} /> },
  { id: 'impostazioni', label: 'Impostazioni', icon: <Settings size={20} /> },
  { id: 'profilo', label: 'Profilo', icon: <UserCircle size={20} /> },
]

interface SidebarProps {
  activeRoute: NavRoute
  onNavigate: (route: NavRoute) => void
  collapsed: boolean
}

export function Sidebar({ activeRoute, onNavigate, collapsed }: SidebarProps) {
  const profilo = useProfiloStore((s) => s.profilo)
  const fotoProfilo = profilo?.fotoProfilo
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null)

  return (
    <aside className="h-full bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className={clsx('border-b border-gray-100 dark:border-gray-800 transition-all duration-300', collapsed ? 'px-2 pt-4 pb-3' : 'px-2 pt-4 pb-3')}>
        <div className="flex flex-col items-center gap-1">
          {collapsed ? (
            <img src={iconaBlue} alt="MyMedicalFlow" className="w-9 h-9 object-contain dark:hidden" />
          ) : (
            <img src={logoBlu} alt="MyMedicalFlow" className="w-36 h-36 object-contain dark:hidden" />
          )}
          {collapsed ? (
            <img src={iconaWhite} alt="MyMedicalFlow" className="w-9 h-9 object-contain hidden dark:block" />
          ) : (
            <img src={logoBianco} alt="MyMedicalFlow" className="w-36 h-36 object-contain hidden dark:block" />
          )}
          {!collapsed && (
            <div className="text-center">
              <h1 className="font-semibold text-gray-900 dark:text-white text-sm">
                MyMedicalFlow
              </h1>
              <p className="text-xs text-gray-400">Gestionale medico</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigazione */}
      <nav className={clsx('flex-1 space-y-1 overflow-y-auto', collapsed ? 'p-2' : 'p-4')}>
        {navItems.map((item) => {
          const icon = item.id === 'profilo' && fotoProfilo ? (
            <img
              src={fotoProfilo}
              alt="Profilo"
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <span className="flex-shrink-0">{item.icon}</span>
          )

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={collapsed ? (e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({ label: item.label, y: rect.top + rect.height / 2 })
              } : undefined}
              onMouseLeave={collapsed ? () => setTooltip(null) : undefined}
              className={clsx(
                collapsed
                  ? 'flex items-center justify-center w-full p-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700 dark:hover:text-teal-400 transition-all duration-200 cursor-pointer'
                  : 'nav-item w-full text-left',
                activeRoute === item.id && 'nav-item-active',
              )}
            >
              {icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Tooltip fixed — outside sidebar to avoid overflow */}
      {collapsed && tooltip && (
        <div
          className="pointer-events-none fixed z-[200] whitespace-nowrap rounded-lg bg-gray-900 dark:bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ left: '4.5rem', top: tooltip.y, transform: 'translateY(-50%)' }}
        >
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-700" />
          {tooltip.label}
        </div>
      )}

      {/* Footer sidebar */}
      <div className={clsx('border-t border-gray-100 dark:border-gray-800', collapsed ? 'p-2' : 'p-4')}>
        {!collapsed && <p className="text-xs text-gray-400 text-center">v0.1.0 — MyMedicalFlow</p>}
        {collapsed && <p className="text-xs text-gray-400 text-center">v0.1</p>}
      </div>
    </aside>
  )
}
