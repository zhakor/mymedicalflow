import { useState } from 'react'
import { ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { SPINTA, USCITA } from './Movimento'
import { pazienteService } from '@desktop/lib/pazienteService'
import type { Patient } from '@desktop/types/paziente'
import { eta, iniziali, dataBreve } from '../schermate/formato'

/**
 * Sul desktop si digitano nome e cognome e il modulo collega il paziente (con
 * scelta fra omonimi). Col dito è più rapido cercarlo in elenco: il risultato
 * è lo stesso, un appuntamento legato a un paziente esistente. Data di nascita
 * e codice fiscale distinguono gli omonimi.
 */
export function SelettorePaziente({
  nome,
  collegato,
  errore,
  onScelto,
}: {
  nome: string
  collegato: boolean
  errore?: string
  onScelto: (p: Patient) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [cerca, setCerca] = useState('')

  const testo = cerca.trim().toLowerCase()
  const elenco = pazienteService
    .getPatients({ page: 1, pageSize: 10_000, filters: {} })
    .data.filter((p) => !testo || `${p.firstName} ${p.lastName} ${p.firstName} ${p.fiscalCode ?? ''}`.toLowerCase().includes(testo))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'it'))

  return (
    <div className="flex flex-col gap-1">
      <span className="label">
        Paziente<span className="text-red-500 ml-0.5">*</span>
      </span>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className={clsx('input-field tocco flex items-center gap-2 text-left', errore && 'border-red-500')}
      >
        <span className={clsx('flex-1 truncate', collegato ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>
          {collegato ? nome : 'Scegli un paziente'}
        </span>
        <ChevronRight size={18} className="text-gray-400" />
      </button>
      {errore && <p className="text-sm text-red-500 mt-0.5">{errore}</p>}

      <AnimatePresence>
      {aperto && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0, transition: SPINTA }}
          exit={{ x: '100%', transition: USCITA }}
          className="fixed inset-0 z-50 flex flex-col bg-[var(--fondo-app)]"
        >
          <div className="relative z-10 shrink-0 pt-[env(safe-area-inset-top)] testata px-3 pb-3">
            <div className="h-14 flex items-center gap-1">
              <button type="button" onClick={() => setAperto(false)} className="tocco flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300" aria-label="Indietro">
                <ArrowLeft size={22} />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scegli paziente</h2>
            </div>
            <label className="relative block">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="search"
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="Cerca per nome o codice fiscale"
                className="input-field pl-10 text-base"
              />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {elenco.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onScelto(p)
                    setAperto(false)
                    setCerca('')
                  }}
                  className="card p-3 w-full flex items-center gap-3 text-left"
                >
                  <span className="h-10 w-10 shrink-0 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                    {iniziali(p)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 dark:text-white truncate">
                      {p.lastName} {p.firstName}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {p.birthDate ? `${dataBreve(p.birthDate)} · ${eta(p.birthDate)} anni` : ''}
                      {p.fiscalCode ? ` · ${p.fiscalCode}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {elenco.length === 0 && <p className="text-center text-sm text-gray-500 py-10">Nessun paziente trovato.</p>}
          </ul>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
