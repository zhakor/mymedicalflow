import { useMemo, useState } from 'react'
import { Repeat } from 'lucide-react'
import { giornoFissoService } from '@desktop/lib/giornoFissoService'
import { WEEKDAY_LABELS, type Patient } from '@desktop/types/paziente'
import { dataBreve } from '../schermate/formato'
import { Conferma } from './Conferma'

/** Stessa regola del desktop: si propone di eliminare anche gli appuntamenti futuri della serie. */
export function RimuoviGiornoFisso({
  paziente,
  onRimosso,
  onAnnulla,
}: {
  paziente: Patient
  onRimosso: (messaggio: string) => void
  onAnnulla: () => void
}) {
  const slot = paziente.fixedSlot!
  const futuri = useMemo(() => giornoFissoService.appuntamentiFuturi(paziente.id, slot), [paziente.id, slot])
  const [eliminaFuturi, setEliminaFuturi] = useState(true)

  function conferma() {
    const eliminati = giornoFissoService.rimuovi(paziente.id, eliminaFuturi && futuri.length > 0)
    onRimosso(
      eliminati > 0
        ? `Giorno fisso rimosso ed eliminat${eliminati === 1 ? 'o 1 appuntamento futuro' : `i ${eliminati} appuntamenti futuri`}.`
        : 'Giorno fisso rimosso.',
    )
  }

  return (
    <Conferma
      titolo="Rimuovi giorno fisso"
      etichetta="Rimuovi"
      pericolo={false}
      icona={<Repeat size={20} />}
      onConferma={conferma}
      onAnnulla={onAnnulla}
    >
      <p>
        {paziente.firstName} {paziente.lastName} non avrà più un giorno fisso (
        <span className="font-medium text-gray-900 dark:text-white">
          {WEEKDAY_LABELS[slot.weekday]} alle {slot.time}
        </span>
        ).
      </p>
      {futuri.length > 0 && (
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={eliminaFuturi}
            onChange={(e) => setEliminaFuturi(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span>
            Elimina anche {futuri.length === 1 ? "l'appuntamento futuro" : `i ${futuri.length} appuntamenti futuri`} della serie
            <span className="block text-xs text-gray-400 mt-0.5">
              {futuri.slice(0, 4).map((a) => dataBreve(a.appointmentDate)).join(', ')}
              {futuri.length > 4 ? '…' : ''}
            </span>
          </span>
        </label>
      )}
    </Conferma>
  )
}
