import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { chiudi } from '../navigazione'
import { SPINTA, Sfondo } from './Movimento'

interface PaginaProps {
  titolo: string
  azioni?: ReactNode
  /** Pulsanti fissi in basso (Salva, Elimina...). */
  piede?: ReactNode
  children: ReactNode
}

/**
 * Schermata a tutto schermo sopra le schede (cartella, moduli): entra da
 * destra come in iOS. Il ritorno non ha animazione né gesto propri: dentro
 * Safari il bordo sinistro è del browser, e due movimenti insieme producevano
 * glitch. La pagina sparisce subito, qualunque sia il modo di tornare indietro.
 */
export function Pagina({ titolo, azioni, piede, children }: PaginaProps) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0, transition: SPINTA }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      className="fixed inset-0"
    >
      <div className="absolute inset-0 isolate bg-[#eef4f4] dark:bg-[#050a0b] shadow-[-12px_0_40px_-12px_rgb(0_0_0/0.25)]">
        <Sfondo />
        <div
          className="absolute inset-0 overflow-y-auto overscroll-contain pt-[calc(var(--testata)+0.75rem)]"
          style={{ paddingBottom: piede ? 'calc(5rem + env(safe-area-inset-bottom))' : undefined }}
        >
          {children}
        </div>

        <header className="absolute inset-x-0 top-0 z-10 testata pt-[env(safe-area-inset-top)]">
          <div className="h-14 px-1 flex items-center gap-1">
            <button
              onClick={chiudi}
              className="tocco flex items-center justify-center rounded-full text-teal-700 dark:text-teal-300"
              aria-label="Indietro"
            >
              <ArrowLeft size={22} />
            </button>
            <h2 className="flex-1 text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">{titolo}</h2>
            {azioni && <div className="flex items-center gap-1 pr-1">{azioni}</div>}
          </div>
        </header>

        {piede && (
          <footer className="absolute inset-x-0 bottom-0 z-10 vetro-spesso border-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3">
            {piede}
          </footer>
        )}
      </div>
    </motion.div>
  )
}

/** Riquadro con titolo, come le card delle sezioni del desktop. */
export function Sezione({ titolo, icona, extra, children }: { titolo: string; icona?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          {icona && <span className="text-teal-600 dark:text-teal-400">{icona}</span>}
          {titolo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  )
}
