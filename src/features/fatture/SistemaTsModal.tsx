import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SistemaTsSection } from './SistemaTsSection'
import { StatoSistemaTsBox } from './StatoSistemaTsBox'
import { fatturaService } from '../../lib/fatturaService'
import { configurazioneSistemaTs, sistemaTsService } from '../../lib/sistemaTsService'
import { AMBIENTE_TS_LABELS, AMBIENTE_TS_NOTE, ambienteReale } from '../../types/sistemaTs'
import type { AmbienteTs, DatiSistemaTs } from '../../types/sistemaTs'
import type { Invoice } from '../../types/fattura'
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react'

interface SistemaTsModalProps {
  /** Fattura già salvata: la trasmissione ha bisogno di un identificativo. */
  invoice: Invoice
  onClose: () => void
  /** Chiamata quando la fattura cambia, per far rileggere l'elenco. */
  onAggiornato: () => void
}

function formatImporto(n: number): string {
  return `€ ${n.toFixed(2).replace('.', ',')}`
}

function formatData(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT')
}

/** Confronto strutturale: basta a capire se ci sono modifiche non salvate. */
function uguali(a: DatiSistemaTs | undefined, b: DatiSistemaTs | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Trasmissione al Sistema TS di una fattura già emessa.
 *
 * Sta fuori dalla creazione e dalla modifica di proposito: si trasmette quando
 * la fattura è definitiva, non mentre la si scrive. I dati della fattura
 * arrivano da chi apre la modale e qui si vedono soltanto, non si modificano:
 * numero, data e importo restano di competenza della fattura.
 */
export function SistemaTsModal({ invoice, onClose, onAggiornato }: SistemaTsModalProps) {
  // Copia locale: dopo un salvataggio deve aggiornarsi senza chiudere la modale.
  const [fattura, setFattura] = useState<Invoice>(invoice)
  const [dati, setDati] = useState<DatiSistemaTs | undefined>(invoice.sistemaTs)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Fa rileggere lo stato della trasmissione dopo un invio.
  const [versione, setVersione] = useState(0)
  const [ambiente, setAmbiente] = useState<AmbienteTs | null>(null)

  // Chi preme "Invia" deve sapere dove sta mandando: in produzione la spesa
  // finisce davvero nella posizione fiscale del professionista.
  useEffect(() => {
    let vivo = true
    configurazioneSistemaTs()
      .then((c) => vivo && setAmbiente(c.ambiente))
      .catch(() => vivo && setAmbiente(null))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    function suTasto(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [onClose])

  const stato = sistemaTsService.statoPerFattura(fattura)
  // Dopo un invio riuscito i dati restano correggibili: e' esattamente il
  // lavoro della variazione. Non si puo' invece togliere la fattura dalla
  // trasmissione, perche' il documento presso il Sistema TS resterebbe li'
  // mentre l'archivio locale se ne dimenticherebbe.
  const trasmessa = stato === 'inviata' || stato === 'variata'
  const modificato = !uguali(dati, fattura.sistemaTs)

  function salva() {
    setSalvataggio(true)
    setErrore(null)
    try {
      const aggiornata = fatturaService.update(fattura.id, { sistemaTs: dati })
      if (!aggiornata) {
        setErrore('Fattura non trovata: potrebbe essere stata eliminata.')
        return
      }
      // Tolta la trasmissione, sparisce anche lo stato che la accompagnava —
      // ma solo se non è mai partito nulla, altrimenti si perderebbe la traccia.
      if (!dati) sistemaTsService.rimuoviSeNonInviata(fattura.id)
      setFattura(aggiornata)
      setVersione((v) => v + 1)
      onAggiornato()
    } finally {
      setSalvataggio(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sistema Tessera Sanitaria
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              Fattura {fattura.invoiceNumber} — {fattura.patientFirstName}{' '}
              {fattura.patientLastName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Solo fuori dalla produzione: là l'invio reale è ciò che ci si
              aspetta, e ripeterlo a ogni fattura sarebbe rumore. Qui invece
              serve sapere che quel che si trasmette non conta davvero. */}
          {ambiente && !ambienteReale(ambiente) && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  Ambiente di prova: {AMBIENTE_TS_LABELS[ambiente]}
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                  {AMBIENTE_TS_NOTE[ambiente]}
                </p>
              </div>
            </div>
          )}

          {/* Dati che partono così come sono: si leggono, non si toccano. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            {[
              { etichetta: 'Numero', valore: fattura.invoiceNumber },
              { etichetta: 'Data emissione', valore: formatData(fattura.issueDate) },
              { etichetta: 'Importo', valore: formatImporto(fattura.amount) },
              { etichetta: 'Cod. fiscale', valore: fattura.patientFiscalCode || '—' },
            ].map((campo) => (
              <div key={campo.etichetta} className="min-w-0">
                <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">
                  {campo.etichetta}
                </p>
                <p className="text-gray-900 dark:text-white mt-0.5 text-sm font-medium truncate">
                  {campo.valore}
                </p>
              </div>
            ))}
          </div>

          {fattura.stampDuty > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Al Sistema TS viene trasmesso{' '}
              <strong className="text-gray-700 dark:text-gray-300">
                {formatImporto(fattura.amount + fattura.stampDuty)}
              </strong>
              : è il totale pagato dall'assistito, prestazione più imposta di bollo di{' '}
              {formatImporto(fattura.stampDuty)}.
            </p>
          )}

          {errore && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">{errore}</p>
            </div>
          )}

          <SistemaTsSection
            dati={dati}
            onChange={setDati}
            dataEmissione={fattura.issueDate}
            bloccaAttivazione={trasmessa}
          />

          {/* Le modifiche non salvate non partono: si trasmette ciò che è
              nell'archivio, non ciò che si vede a schermo. */}
          {modificato && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ci sono modifiche non salvate. Salvale prima di trasmettere: al Sistema TS
                vanno i dati registrati nell'archivio.
              </p>
            </div>
          )}

          {/* Salvare non basta: finché la variazione non parte, il ministero
              conserva i valori vecchi. */}
          {trasmessa && !modificato && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Il documento è già stato trasmesso. Correggendo questi dati, il Sistema TS
              continuerà a conoscere i valori precedenti finché non trasmetti una
              variazione.
            </p>
          )}

          {/* Stato e invio, solo quando la fattura è davvero soggetta */}
          {!modificato && fattura.sistemaTs && (
            <StatoSistemaTsBox
              key={versione}
              invoice={fattura}
              onAggiornato={() => {
                setVersione((v) => v + 1)
                onAggiornato()
              }}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button type="button" variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <Button
              type="button"
              onClick={salva}
              loading={salvataggio}
              disabled={salvataggio || !modificato}
            >
              <Check size={16} />
              Salva dati
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
