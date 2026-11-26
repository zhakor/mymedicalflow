import { clsx } from 'clsx'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useSincronizzazioneStore } from '../../stores/sincronizzazioneStore'

/**
 * Stato della connessione con il telefono, accanto all'ultima copia: le
 * stesse tre parole dell'app sul telefono. Nascosto se la sincronizzazione
 * non è configurata.
 */
export function IndicatoreSincronizzazione() {
  const stato = useSincronizzazioneStore((s) => s.stato)
  if (stato === 'spenta') return null

  const voce =
    stato === 'allineato'
      ? { testo: 'Connesso', icona: <Cloud size={14} className="text-teal-500 flex-shrink-0" />, problema: false }
      : stato === 'in-corso' || stato === 'avvio'
        ? { testo: 'In aggiornamento…', icona: <RefreshCw size={14} className="text-gray-400 flex-shrink-0 animate-spin" />, problema: false }
        : { testo: 'Non connesso', icona: <CloudOff size={14} className="text-amber-500 flex-shrink-0" />, problema: true }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 text-xs border px-3 py-2 rounded-xl',
        voce.problema
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400',
      )}
      title="Sincronizzazione con l'app sul telefono (Impostazioni → App mobile e sincronizzazione)"
    >
      {voce.icona}
      <span>{voce.testo}</span>
    </div>
  )
}
