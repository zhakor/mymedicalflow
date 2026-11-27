import { useState } from 'react'
import { ShieldCheck, WifiOff } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { accediGoogle, leggiLicenza } from '../../lib/cloudService'
import { motivoBlocco, salvaVerifica } from '../../lib/abbonamentoService'
import { ErroreConnessione } from '../../sync/contratti'

interface VerificaAbbonamentoProps {
  /** Perché si è arrivati qui, se non è la solita verifica periodica (es. licenza scaduta). */
  motivo?: string | null
  onVerificato: () => void
}

/**
 * Accesso Google obbligatorio all'avvio, ogni 30 giorni (CR §7.2): controlla
 * l'email verificata e la licenza su Firestore. Finché non riesce l'app non
 * si apre.
 */
export function VerificaAbbonamento({ motivo, onVerificato }: VerificaAbbonamentoProps) {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(motivo ?? null)
  const [senzaRete, setSenzaRete] = useState(false)

  async function accedi() {
    setInCorso(true)
    setErrore(null)
    setSenzaRete(false)
    try {
      await accediGoogle()
      const licenza = await leggiLicenza()
      const blocco = motivoBlocco(licenza, Date.now())
      if (blocco) {
        setErrore(blocco)
        return
      }
      salvaVerifica({ email: licenza.email, verificataIl: Date.now(), scadenza: licenza.scadenza })
      onVerificato()
    } catch (err) {
      if (err instanceof ErroreConnessione) {
        setSenzaRete(true)
        setErrore("Serve la connessione a internet per verificare l'abbonamento.")
      } else {
        setErrore(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
      <Card className="w-full max-w-md text-center">
        <div className="mx-auto w-12 h-12 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
          <ShieldCheck size={24} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Verifica dell'abbonamento</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Accedi con il tuo account Google per confermare l'abbonamento a MyMedicalFlow.
        </p>

        <Button className="mt-6 w-full" onClick={accedi} loading={inCorso} disabled={inCorso}>
          Accedi con Google
        </Button>
        {inCorso && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Completa l'accesso nella finestra del browser che si è aperta.</p>
        )}

        {errore && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            {senzaRete && <WifiOff size={16} className="mt-0.5 flex-shrink-0" />}
            <span>{errore}</span>
          </div>
        )}
      </Card>
    </div>
  )
}
