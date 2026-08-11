import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Clock, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import {
  ORA_APERTURA,
  ORA_CHIUSURA,
  appuntamentiDelGiorno,
  etichettaGiorno,
  fuoriOrario,
  slotDelGiorno,
} from '../../lib/agendaService'
import { servizioService } from '../../lib/servizioService'
import { accettaRilascio, idTrascinato, iniziaTrascinamento } from './trascinamento'
import type { Appointment } from '../../types/appuntamento'

interface GiornataSlotProps {
  appuntamenti: Appointment[]
  giorno: string
  onNuovo: (ora: string) => void
  onModifica: (a: Appointment) => void
  onElimina: (a: Appointment) => void
  /** Rilascio del trascinamento su un orario della stessa giornata. */
  onSposta: (id: string, ora: string) => void
}

/** Riga di un appuntamento, condivisa fra slot orari e fuori orario. */
function RigaAppuntamento({
  appuntamento,
  onModifica,
  onElimina,
}: {
  appuntamento: Appointment
  onModifica: (a: Appointment) => void
  onElimina: (a: Appointment) => void
}) {
  const [inMovimento, setInMovimento] = useState(false)
  const classi = servizioService.classiDi(appuntamento)
  const durata = servizioService.durataDi(appuntamento)

  return (
    <div
      draggable
      onDragStart={(e) => {
        iniziaTrascinamento(e, appuntamento.id)
        setInMovimento(true)
      }}
      onDragEnd={() => setInMovimento(false)}
      title="Trascina per spostare l'orario"
      className={clsx(
        'group flex cursor-grab items-start gap-3 rounded-xl border px-3 py-2.5 transition-all active:cursor-grabbing',
        classi.blocco,
        // Mentre viaggia resta visibile ma arretra, così si segue il puntatore
        inMovimento && 'opacity-40',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {appuntamento.patientLastName} {appuntamento.patientFirstName}
        </p>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {appuntamento.appointmentTime} · {servizioService.nomeDi(appuntamento)} · {durata}′
        </p>
        {appuntamento.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {appuntamento.description}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onModifica(appuntamento)}
          aria-label={`Modifica appuntamento di ${appuntamento.patientLastName}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-teal-600 dark:hover:bg-gray-800"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onElimina(appuntamento)}
          aria-label={`Elimina appuntamento di ${appuntamento.patientLastName}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-red-600 dark:hover:bg-gray-800"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export function GiornataSlot({
  appuntamenti,
  giorno,
  onNuovo,
  onModifica,
  onElimina,
  onSposta,
}: GiornataSlotProps) {
  /** Slot sotto il puntatore durante un trascinamento. */
  const [bersaglio, setBersaglio] = useState<string | null>(null)
  const slot = useMemo(() => slotDelGiorno(appuntamenti, giorno), [appuntamenti, giorno])
  const fuori = useMemo(() => fuoriOrario(appuntamenti, giorno), [appuntamenti, giorno])
  const totale = useMemo(
    () => appuntamentiDelGiorno(appuntamenti, giorno).length,
    [appuntamenti, giorno],
  )

  const liberi = slot.filter((s) => s.libero).length

  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Intestazione della giornata */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white first-letter:uppercase">
          {etichettaGiorno(giorno)}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {totale === 0
            ? 'Nessun appuntamento'
            : `${totale} ${totale === 1 ? 'appuntamento' : 'appuntamenti'}`}
          {' · '}
          {liberi} {liberi === 1 ? 'slot libero' : 'slot liberi'}
        </p>
      </div>

      {/* Slot della giornata */}
      <div className="max-h-[520px] overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
          {slot.map((s) => (
            <li key={s.ora} className="flex items-start gap-3">
              <span className="w-12 flex-shrink-0 pt-2 text-right text-xs font-medium tabular-nums text-gray-400">
                {s.ora}
              </span>

              <div className="min-w-0 flex-1">
                {s.libero ? (
                  <button
                    type="button"
                    onClick={() => onNuovo(s.ora)}
                    // Solo gli slot liberi accolgono un rilascio: su uno già
                    // occupato lo spostamento creerebbe la sovrapposizione che
                    // il resto della schermata serve a evitare.
                    onDragOver={(e) => {
                      if (accettaRilascio(e)) setBersaglio(s.ora)
                    }}
                    onDragLeave={() =>
                      setBersaglio((precedente) => (precedente === s.ora ? null : precedente))
                    }
                    onDrop={(e) => {
                      e.preventDefault()
                      setBersaglio(null)
                      const id = idTrascinato(e)
                      if (id) onSposta(id, s.ora)
                    }}
                    className={clsx(
                      'group flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-left text-xs transition-colors',
                      bersaglio === s.ora
                        ? 'border-teal-500 bg-teal-100 text-teal-800 dark:border-teal-500 dark:bg-teal-900/40 dark:text-teal-300'
                        : 'border-gray-200 text-gray-400 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 dark:border-gray-800 dark:hover:border-teal-700 dark:hover:bg-teal-900/20 dark:hover:text-teal-400',
                    )}
                  >
                    <Plus size={14} className="flex-shrink-0" />
                    <span
                      className={clsx(
                        'transition-opacity',
                        bersaglio === s.ora ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                    >
                      {bersaglio === s.ora ? `Sposta alle ${s.ora}` : 'Fissa un appuntamento'}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-1">
                    {/* Più di uno nello stesso slot: va detto, non nascosto */}
                    {s.appuntamenti.length > 1 && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <TriangleAlert size={13} className="flex-shrink-0" />
                        {s.appuntamenti.length} appuntamenti sovrapposti
                      </p>
                    )}
                    {s.appuntamenti.map((a) => (
                      <RigaAppuntamento
                        key={a.id}
                        appuntamento={a}
                        onModifica={onModifica}
                        onElimina={onElimina}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Chi cade fuori dall'orario di lavoro resta comunque visibile */}
        {fuori.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Clock size={13} />
              Fuori orario ({ORA_APERTURA}:00 – {ORA_CHIUSURA}:00)
            </p>
            <div className="space-y-1">
              {fuori.map((a) => (
                <RigaAppuntamento
                  key={a.id}
                  appuntamento={a}
                  onModifica={onModifica}
                  onElimina={onElimina}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
