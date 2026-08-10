import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  sistemaTsService,
  trasmetti,
  validaPerTrasmissione,
} from '../../lib/sistemaTsService'
import type { ErroreTrasmissione } from '../../lib/sistemaTsService'
import { OPERAZIONE_TS_LABELS, STATO_STS_LABELS } from '../../types/sistemaTs'
import type { OperazioneTs, StatoSistemaTS } from '../../types/sistemaTs'
import type { Invoice } from '../../types/fattura'
import { AlertTriangle, CheckCircle, Clock, Send, Upload } from 'lucide-react'

interface StatoSistemaTsBoxProps {
  /** Fattura già salvata: senza id non si può trasmettere nulla. */
  invoice: Invoice
  onAggiornato?: () => void
}

const COLORE_STATO: Record<StatoSistemaTS, 'success' | 'warning' | 'muted' | 'info'> = {
  non_previsto: 'muted',
  da_inviare: 'warning',
  inviata: 'success',
  errore: 'warning',
  variata: 'success',
  cancellata: 'muted',
}

/**
 * Stato della trasmissione e azioni consentite.
 *
 * L'invio è un'azione separata dal salvataggio: salvare una fattura non deve
 * mai trasmetterla da solo.
 */
export function StatoSistemaTsBox({ invoice, onAggiornato }: StatoSistemaTsBoxProps) {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<ErroreTrasmissione | null>(null)
  const [ultimoEsito, setUltimoEsito] = useState<string | null>(null)

  const trasmissione = sistemaTsService.perFattura(invoice.id)
  const stato = sistemaTsService.statoPerFattura(invoice)
  const operazioni = sistemaTsService.operazioniAmmessePerFattura(invoice)
  const validazione = validaPerTrasmissione(invoice)

  if (stato === 'non_previsto') return null

  async function esegui(operazione: OperazioneTs) {
    // Doppia protezione contro il doppio invio: qui e nel backend
    if (inCorso) return
    setInCorso(true)
    setErrore(null)
    setUltimoEsito(null)
    try {
      const esito = await trasmetti(invoice, operazione)
      if (esito.accettata) {
        setUltimoEsito(
          `${OPERAZIONE_TS_LABELS[operazione]} accettata${esito.protocollo ? ` — protocollo ${esito.protocollo}` : ''}`,
        )
      } else {
        setErrore({
          genere: 'rifiutato',
          messaggio: esito.descrizione ?? 'Documento non accettato dal Sistema TS.',
          codice: esito.codice ?? undefined,
        })
      }
      onAggiornato?.()
    } catch (err) {
      setErrore(err as ErroreTrasmissione)
      onAggiornato?.()
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Trasmissione Sistema TS
        </p>
        <Badge variant={COLORE_STATO[stato]}>{STATO_STS_LABELS[stato]}</Badge>
      </div>

      {/* Esito dell'ultima trasmissione riuscita */}
      {trasmissione?.protocollo && (
        <div className="flex items-start gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl">
          <CheckCircle size={16} className="text-teal-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 text-xs text-teal-700 dark:text-teal-400">
            <p>
              Protocollo <span className="font-mono font-medium">{trasmissione.protocollo}</span>
            </p>
            {trasmissione.dataInvio && (
              <p className="mt-0.5">
                Inviata il {new Date(trasmissione.dataInvio).toLocaleString('it-IT')}
              </p>
            )}
          </div>
        </div>
      )}

      {ultimoEsito && !errore && (
        <div className="flex items-start gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl">
          <CheckCircle size={16} className="text-teal-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-teal-700 dark:text-teal-400 break-words">{ultimoEsito}</p>
        </div>
      )}

      {/* Dati mancanti: si vedono prima di provare, non dopo un errore di rete */}
      {!validazione.valido && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Impossibile trasmettere la fattura. Mancano:
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 list-disc pl-4 space-y-0.5">
              {validazione.mancanti.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {errore && (
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 text-xs text-red-700 dark:text-red-400">
            <p className="break-words">{errore.messaggio}</p>
            {errore.codice && <p className="mt-0.5">Codice: {errore.codice}</p>}
            {errore.mancanti && errore.mancanti.length > 0 && (
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {errore.mancanti.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {errore.esitoIncerto && (
              <p className="mt-1 font-medium">
                Prima di ritentare verifica sul portale se il documento risulta già registrato:
                un secondo invio creerebbe un duplicato.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Solo le operazioni ammesse dallo stato corrente */}
      <div className="flex flex-wrap gap-2">
        {operazioni.map((op) => (
          <Button
            key={op}
            type="button"
            variant={op === 'inserimento' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => esegui(op)}
            loading={inCorso}
            disabled={inCorso || !validazione.valido}
            title={!validazione.valido ? 'Completa i dati mancanti' : undefined}
          >
            {op === 'inserimento' ? <Send size={15} /> : <Upload size={15} />}
            {op === 'inserimento' ? 'Invia al Sistema TS' : OPERAZIONE_TS_LABELS[op]}
          </Button>
        ))}
      </div>

      {/* Storico: serve all'utente e al supporto per ricostruire cosa è successo */}
      {trasmissione && trasmissione.tentativi.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            Dettagli ({trasmissione.tentativi.length}{' '}
            {trasmissione.tentativi.length === 1 ? 'tentativo' : 'tentativi'})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {[...trasmissione.tentativi].reverse().map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-gray-500 dark:text-gray-400">
                <Clock size={12} className="flex-shrink-0 mt-0.5" />
                <span className="min-w-0">
                  {new Date(t.istante).toLocaleString('it-IT')} — {OPERAZIONE_TS_LABELS[t.operazione]}{' '}
                  <Badge variant={t.riuscito ? 'success' : 'warning'}>
                    {t.riuscito ? 'accettata' : 'errore'}
                  </Badge>
                  {t.protocollo && <span className="font-mono"> {t.protocollo}</span>}
                  {t.codice && <span> — {t.codice}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
