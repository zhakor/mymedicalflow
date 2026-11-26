import { useState } from 'react'
import { FileText } from 'lucide-react'
import { clsx } from 'clsx'
import { fatturaService } from '@desktop/lib/fatturaService'
import type { InvoiceStatus } from '@desktop/types/fattura'
import { useDati } from '../dati/hooks'
import { VoceFattura } from '../componenti/VoceFattura'
import { PulsanteNuovo } from '../componenti/Campi'
import { apri } from '../navigazione'

const FILTRI: { valore: InvoiceStatus | ''; etichetta: string }[] = [
  { valore: '', etichetta: 'Tutte' },
  { valore: 'in_attesa', etichetta: 'In attesa' },
  { valore: 'pagata', etichetta: 'Pagate' },
]

/** Registro delle fatture, con l'emissione di una nuova dal pulsante in basso. */
export function Fatture() {
  useDati()
  const [stato, setStato] = useState<InvoiceStatus | ''>('')
  const [cerca, setCerca] = useState('')
  const elenco = fatturaService.getInvoices({
    page: 1,
    pageSize: 10_000,
    filters: { status: stato || undefined, patientLastName: cerca.trim() || undefined },
  }).data

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 vetro-spesso border-0 border-b px-4 pt-3 pb-2 space-y-2">
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca per cognome del paziente"
          className="input-field text-base"
        />
        <div className="flex items-center gap-2">
          {FILTRI.map((f) => (
            <button
              key={f.valore}
              onClick={() => setStato(f.valore)}
              aria-pressed={stato === f.valore}
              className={clsx(
                'min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors',
                stato === f.valore
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white/60 dark:bg-white/[0.06] border-white/70 dark:border-white/10 text-gray-600 dark:text-gray-300',
              )}
            >
              {f.etichetta}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            {elenco.length} {elenco.length === 1 ? 'fattura' : 'fatture'}
          </span>
        </div>
      </div>

      {elenco.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 text-gray-400">
          <FileText size={36} className="mb-2" />
          <p className="text-sm">Nessuna fattura</p>
        </div>
      ) : (
        <div className="mx-4 mt-1 card py-0 divide-y divide-gray-100 dark:divide-gray-800">
          {elenco.map((f) => (
            <VoceFattura key={f.id} fattura={f} conPaziente />
          ))}
        </div>
      )}

      <PulsanteNuovo etichetta="Nuova fattura" onClick={() => apri({ tipo: 'fattura' })} />
    </div>
  )
}
