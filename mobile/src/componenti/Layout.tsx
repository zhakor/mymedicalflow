import { Home, Calendar, Users, FileText, Settings, Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { clsx } from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'
import { iconaBlue, iconaWhite } from '@desktop/assets/logos'
import { useSincronizzazione } from '../dati/sincronizzazione'
import { UI } from './Movimento'
import { IndicatoreAggiornamento, useTiraPerAggiornare } from './Gesti'
import { aggiornaDalCloud } from '../dati/sincronizzazione'

export type Scheda = 'home' | 'agenda' | 'pazienti' | 'fatture' | 'altro'

const SCHEDE: { id: Scheda; label: string; icona: ReactNode }[] = [
  { id: 'home', label: 'Home', icona: <Home size={22} /> },
  { id: 'agenda', label: 'Agenda', icona: <Calendar size={22} /> },
  { id: 'pazienti', label: 'Pazienti', icona: <Users size={22} /> },
  { id: 'fatture', label: 'Fatture', icona: <FileText size={22} /> },
  { id: 'altro', label: 'Impostazioni', icona: <Settings size={22} /> },
]

export const TITOLI: Record<Scheda, string> = {
  home: 'Dashboard',
  agenda: 'Agenda',
  pazienti: 'Pazienti',
  fatture: 'Fatture',
  altro: 'Impostazioni',
}

function IndicatoreSync() {
  const sync = useSincronizzazione((s) => s.sync)
  const voce = {
    allineato: { icona: <Cloud size={14} />, testo: 'Connesso', classi: 'text-teal-700 dark:text-teal-400' },
    'in-corso': { icona: <RefreshCw size={14} className="animate-spin" />, testo: 'In aggiornamento…', classi: 'text-gray-500' },
    offline: { icona: <CloudOff size={14} />, testo: 'Non connesso', classi: 'text-amber-600' },
    errore: { icona: <AlertTriangle size={14} />, testo: 'Non connesso', classi: 'text-red-600' },
  }[sync]
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={sync}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={UI}
        className={clsx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium vetro', voce.classi)}
      >
        {voce.icona}
        {voce.testo}
      </motion.span>
    </AnimatePresence>
  )
}

interface LayoutProps {
  scheda: Scheda
  onScheda: (s: Scheda) => void
  children: ReactNode
}

export function Layout({ scheda, onScheda, children }: LayoutProps) {
  // Ogni scheda si apre dall'inizio, non alla posizione di quella precedente
  const scorrimento = useRef<HTMLElement>(null)
  useEffect(() => {
    scorrimento.current?.scrollTo({ top: 0 })
  }, [scheda])
  // Tirando in giù dall'inizio di una scheda si aggiorna forzatamente dal Drive
  const { tiro, stato } = useTiraPerAggiornare(scorrimento, aggiornaDalCloud)

  return (
    <div className="relative h-full">
      {/* Il contenuto scorre sotto testata e barra: il vetro lo lascia intravedere. */}
      <main ref={scorrimento} className="absolute inset-0 overflow-y-auto overscroll-contain pt-[calc(var(--testata)+0.75rem)] pb-[var(--barra)]">
        {/* In sequenza: la scheda uscente sparisce in fretta, poi entra la nuova. Mai sovrapposte. */}
        <motion.div style={{ y: tiro }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={scheda}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: UI }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>
      <IndicatoreAggiornamento tiro={tiro} stato={stato} />

      <header className="absolute inset-x-0 top-0 z-20 testata pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-4 flex items-center gap-3">
          <img src={iconaBlue} alt="" className="w-8 h-8 object-contain dark:hidden" />
          <img src={iconaWhite} alt="" className="w-8 h-8 object-contain hidden dark:block" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={scheda}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex-1 text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {TITOLI[scheda]}
            </motion.h1>
          </AnimatePresence>
          <IndicatoreSync />
        </div>
      </header>

      {/* Barra delle schede sospesa, a capsula. La pillola dell'attiva scorre fra le voci. */}
      <nav
        className="absolute inset-x-3 z-20 bottom-[var(--fondo-barra)] grid grid-cols-5 gap-1 rounded-[28px] vetro-spesso border p-1.5 shadow-[0_12px_40px_-12px_rgb(13_70_70/0.35)]"
        aria-label="Sezioni"
      >
        {SCHEDE.map((s) => {
          const attiva = scheda === s.id
          return (
            <button
              key={s.id}
              onClick={() => onScheda(s.id)}
              aria-current={attiva ? 'page' : undefined}
              aria-label={s.label}
              className={clsx(
                'relative tocco flex flex-col items-center justify-center gap-0.5 rounded-[22px] py-1.5 text-[11px] font-medium',
                attiva ? 'text-teal-700 dark:text-teal-300' : 'text-gray-500 dark:text-gray-400',
              )}
            >
              {attiva && (
                <motion.span
                  layoutId="scheda-attiva"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 rounded-[22px] bg-white/80 dark:bg-white/10 shadow-sm"
                />
              )}
              <span className="relative">{s.icona}</span>
              <span className="relative">{s.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
