import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { useAggiornamentoStore } from '../../stores/aggiornamentoStore'
import { AlertTriangle, Download, RefreshCw, X } from 'lucide-react'

function formattaMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Finestra dell'aggiornamento, condivisa da controllo automatico e manuale.
 *
 * Non compare quando l'app è già aggiornata dopo un controllo automatico: in
 * quel caso non c'è nulla da dire all'utente.
 */
export function AggiornamentoModal() {
  const { stato, info, avanzamento, errore, richiestoDaUtente, installa, riavviaApp, chiudi } =
    useAggiornamentoStore()

  const inCorso = stato === 'download' || stato === 'installazione'
  const bloccante = inCorso || stato === 'daRiavviare'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !bloccante) chiudi()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chiudi, bloccante])

  // Silenzioso: nessun aggiornamento, o errore durante il controllo automatico
  if (stato === 'inattivo' || stato === 'controllo') return null
  if (stato === 'aggiornato' && !richiestoDaUtente) return null
  if (stato === 'errore' && !richiestoDaUtente && !info) return null

  const percentuale =
    avanzamento && avanzamento.totale
      ? Math.min(100, Math.round((avanzamento.scaricati / avanzamento.totale) * 100))
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !bloccante) chiudi()
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div
            className={
              stato === 'errore'
                ? 'w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0'
                : 'w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 flex-shrink-0'
            }
          >
            {stato === 'errore' ? <AlertTriangle size={20} /> : <Download size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {stato === 'errore'
                ? 'Aggiornamento non riuscito'
                : stato === 'aggiornato'
                  ? "L'app è aggiornata"
                  : stato === 'daRiavviare'
                    ? 'Aggiornamento installato'
                    : 'Aggiornamento disponibile'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {stato === 'errore'
                ? errore
                : stato === 'aggiornato'
                  ? 'Stai utilizzando la versione più recente.'
                  : stato === 'daRiavviare'
                    ? "L'applicazione deve essere riavviata per completare l'aggiornamento."
                    : "È disponibile una nuova versione dell'app."}
            </p>
          </div>
          {!bloccante && (
            <button
              onClick={chiudi}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Versioni e note */}
        {info && stato !== 'aggiornato' && (
          <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">Versione installata</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {info.versioneCorrente}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">Nuova versione</span>
              <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
                {info.versioneNuova}
              </span>
            </div>
            {info.note && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Novità</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line max-h-40 overflow-y-auto">
                  {info.note}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Avanzamento */}
        {inCorso && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              <span>
                {stato === 'installazione' ? 'Installazione in corso…' : 'Download in corso…'}
              </span>
              {percentuale !== null && <span>{percentuale}%</span>}
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={
                  percentuale === null
                    ? 'h-full w-1/3 bg-teal-500 animate-pulse'
                    : 'h-full bg-teal-500 transition-[width] duration-200'
                }
                style={percentuale === null ? undefined : { width: `${percentuale}%` }}
              />
            </div>
            {avanzamento && avanzamento.totale !== null && (
              <p className="text-xs text-gray-400 mt-1.5">
                {formattaMB(avanzamento.scaricati)} / {formattaMB(avanzamento.totale)}
              </p>
            )}
          </div>
        )}

        {/* Azioni */}
        <div className="flex justify-end gap-3 mt-5">
          {stato === 'disponibile' && (
            <>
              <Button variant="secondary" onClick={chiudi}>
                Più tardi
              </Button>
              <Button onClick={installa}>
                <Download size={16} />
                Aggiorna ora
              </Button>
            </>
          )}

          {inCorso && (
            <Button loading disabled>
              Attendi…
            </Button>
          )}

          {stato === 'daRiavviare' && (
            <Button onClick={riavviaApp}>
              <RefreshCw size={16} />
              Riavvia ora
            </Button>
          )}

          {(stato === 'aggiornato' || stato === 'errore') && (
            <Button variant="secondary" onClick={chiudi}>
              Chiudi
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
