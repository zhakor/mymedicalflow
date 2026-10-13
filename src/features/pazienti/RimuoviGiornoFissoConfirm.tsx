import { useEffect, useMemo, useState } from 'react'
import { Repeat, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { dataDaChiave } from '../../lib/agendaService'
import { giornoFissoService } from '../../lib/giornoFissoService'
import type { Patient } from '../../types/paziente'
import { WEEKDAY_LABELS } from '../../types/paziente'

interface RimuoviGiornoFissoConfirmProps {
  patient: Patient
  /** Chiamato a rimozione avvenuta, con quanti appuntamenti sono stati eliminati. */
  onRimosso: (eliminati: number) => void
  onAnnulla: () => void
}

function dataBreve(chiave: string): string {
  return dataDaChiave(chiave).toLocaleDateString('it-IT')
}

export function RimuoviGiornoFissoConfirm({
  patient,
  onRimosso,
  onAnnulla,
}: RimuoviGiornoFissoConfirmProps) {
  const slot = patient.fixedSlot!
  const futuri = useMemo(
    () => giornoFissoService.appuntamentiFuturi(patient.id, slot),
    [patient.id, slot],
  )
  // Proposto attivo: chi toglie il giorno fisso di solito non vuole più
  // vedere la serie in calendario. Il numero è dichiarato prima di confermare.
  const [eliminaFuturi, setEliminaFuturi] = useState(true)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Non deve chiudere anche la finestra che sta sotto
        e.stopImmediatePropagation()
        onAnnulla()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onAnnulla])

  function conferma() {
    onRimosso(giornoFissoService.rimuovi(patient.id, eliminaFuturi && futuri.length > 0))
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onAnnulla()
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0">
            <Repeat size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">Rimuovi giorno fisso</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {patient.firstName} {patient.lastName} non avrà più un giorno fisso (
              <span className="font-medium text-gray-900 dark:text-white">
                {WEEKDAY_LABELS[slot.weekday]} alle {slot.time}
              </span>
              ).
            </p>

            {futuri.length > 0 ? (
              <label className="flex items-start gap-2.5 mt-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={eliminaFuturi}
                  onChange={(e) => setEliminaFuturi(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Elimina anche{' '}
                  <span className="font-semibold">
                    {futuri.length} appuntament{futuri.length === 1 ? 'o futuro' : 'i futuri'}
                  </span>{' '}
                  da svolgere in quel giorno e orario
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {futuri.length === 1
                      ? `Il ${dataBreve(futuri[0].appointmentDate)}.`
                      : `Dal ${dataBreve(futuri[0].appointmentDate)} al ${dataBreve(futuri[futuri.length - 1].appointmentDate)}.`}{' '}
                    Le sedute passate o già segnate restano.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Nessun appuntamento futuro da svolgere in quel giorno e orario.
              </p>
            )}
          </div>
          <button
            onClick={onAnnulla}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={onAnnulla}>
            Annulla
          </Button>
          <Button variant="danger" onClick={conferma}>
            Rimuovi
          </Button>
        </div>
      </div>
    </div>
  )
}
