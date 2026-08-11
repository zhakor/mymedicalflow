import { useMemo } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  INTESTAZIONI_SETTIMANA,
  appuntamentiDelGiorno,
  dataDaChiave,
  eWeekend,
  grigliaMese,
  nomeMese,
  oggi,
  stessoMese,
} from '../../lib/agendaService'
import type { Appointment } from '../../types/appuntamento'

interface CalendarioMeseProps {
  appuntamenti: Appointment[]
  anno: number
  mese: number
  /** Giorno selezionato, in formato `AAAA-MM-GG`. */
  selezionato: string
  onSelezione: (chiave: string) => void
  onCambioMese: (anno: number, mese: number) => void
}

/** Quante anteprime stanno in una casella prima di riassumere con "+N". */
const ANTEPRIME_PER_GIORNO = 2

export function CalendarioMese({
  appuntamenti,
  anno,
  mese,
  selezionato,
  onSelezione,
  onCambioMese,
}: CalendarioMeseProps) {
  const giorni = useMemo(() => grigliaMese(anno, mese), [anno, mese])
  const oggiChiave = oggi()

  // Un solo raggruppamento per tutta la griglia: filtrare 42 volte l'elenco
  // completo rifarebbe lo stesso lavoro a ogni casella.
  const perGiorno = useMemo(() => {
    const mappa = new Map<string, Appointment[]>()
    for (const chiave of giorni) {
      const elenco = appuntamentiDelGiorno(appuntamenti, chiave)
      if (elenco.length) mappa.set(chiave, elenco)
    }
    return mappa
  }, [appuntamenti, giorni])

  function spostaMese(delta: number) {
    const d = new Date(anno, mese + delta, 1)
    onCambioMese(d.getFullYear(), d.getMonth())
  }

  function vaiAOggi() {
    const d = new Date()
    onCambioMese(d.getFullYear(), d.getMonth())
    onSelezione(oggiChiave)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Intestazione: mese e navigazione */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white capitalize">
          {nomeMese(anno, mese)}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => spostaMese(-1)}
            aria-label="Mese precedente"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={vaiAOggi}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => spostaMese(1)}
            aria-label="Mese successivo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Giorni della settimana */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
        {INTESTAZIONI_SETTIMANA.map((g) => (
          <div
            key={g}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400"
          >
            {g}
          </div>
        ))}
      </div>

      {/* Griglia del mese */}
      <div className="grid grid-cols-7">
        {giorni.map((chiave) => {
          const delGiorno = perGiorno.get(chiave) ?? []
          const nelMese = stessoMese(chiave, anno, mese)
          const eOggi = chiave === oggiChiave
          const eSelezionato = chiave === selezionato

          return (
            <button
              key={chiave}
              type="button"
              onClick={() => onSelezione(chiave)}
              aria-pressed={eSelezionato}
              className={clsx(
                'relative min-h-[84px] sm:min-h-[96px] p-1.5 text-left align-top border-b border-r border-gray-100 dark:border-gray-800 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500',
                eSelezionato
                  ? 'bg-teal-50 dark:bg-teal-900/25'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                // I giorni fuori dal mese restano visibili ma arretrano
                !nelMese && 'bg-gray-50/60 dark:bg-gray-950/40',
                nelMese && eWeekend(chiave) && !eSelezionato && 'bg-gray-50/40 dark:bg-gray-900/60',
              )}
            >
              <span
                className={clsx(
                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold',
                  eOggi && 'bg-teal-600 text-white',
                  !eOggi && nelMese && 'text-gray-700 dark:text-gray-200',
                  !eOggi && !nelMese && 'text-gray-300 dark:text-gray-600',
                )}
              >
                {dataDaChiave(chiave).getDate()}
              </span>

              <div className="mt-1 space-y-0.5">
                {delGiorno.slice(0, ANTEPRIME_PER_GIORNO).map((a) => (
                  <div
                    key={a.id}
                    title={`${a.appointmentTime} — ${a.patientLastName} ${a.patientFirstName}`}
                    className={clsx(
                      'truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium',
                      a.appointmentType === 'valutazione'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
                    )}
                  >
                    {a.appointmentTime} {a.patientLastName}
                  </div>
                ))}
                {delGiorno.length > ANTEPRIME_PER_GIORNO && (
                  <div className="px-1 text-[10px] font-medium text-gray-400">
                    +{delGiorno.length - ANTEPRIME_PER_GIORNO} altri
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
