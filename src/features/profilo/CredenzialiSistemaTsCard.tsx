import { useCallback, useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  credenzialiElimina,
  credenzialiSalva,
  credenzialiStato,
} from '../../lib/sistemaTsService'
import type { StatoCredenzialiTs } from '../../lib/sistemaTsService'
import { AlertTriangle, Check, KeyRound, ShieldCheck, X } from 'lucide-react'

interface CredenzialiSistemaTsCardProps {
  /** Serve come codice identificativo: senza, la trasmissione non parte. */
  codiceFiscale?: string
}

/**
 * Credenziali per la trasmissione al Sistema Tessera Sanitaria.
 *
 * Parola chiave e pincode non passano dall'archivio dell'app: vengono
 * consegnate al portachiavi del sistema operativo, che le restituisce solo al
 * backend. Da qui non tornano mai indietro — l'interfaccia sa unicamente se
 * sono presenti.
 */
export function CredenzialiSistemaTsCard({ codiceFiscale }: CredenzialiSistemaTsCardProps) {
  const [stato, setStato] = useState<StatoCredenzialiTs | null>(null)
  const [parolaChiave, setParolaChiave] = useState('')
  const [pincode, setPincode] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [messaggio, setMessaggio] = useState<{ testo: string; tipo: 'ok' | 'errore' } | null>(null)

  const aggiorna = useCallback(() => {
    credenzialiStato().then(setStato).catch(() => setStato(null))
  }, [])

  useEffect(() => {
    aggiorna()
  }, [aggiorna])

  async function handleSalva() {
    setSalvando(true)
    setMessaggio(null)
    try {
      setStato(await credenzialiSalva(parolaChiave, pincode))
      // I valori non restano nei campi: da qui in poi vivono solo nel portachiavi
      setParolaChiave('')
      setPincode('')
      setMessaggio({ testo: 'Credenziali salvate nel portachiavi del sistema.', tipo: 'ok' })
    } catch (err) {
      const e = err as { messaggio?: string }
      setMessaggio({ testo: e.messaggio ?? 'Salvataggio non riuscito.', tipo: 'errore' })
    } finally {
      setSalvando(false)
    }
  }

  async function handleElimina() {
    try {
      setStato(await credenzialiElimina())
      setMessaggio({ testo: 'Credenziali rimosse.', tipo: 'ok' })
    } catch (err) {
      const e = err as { messaggio?: string }
      setMessaggio({ testo: e.messaggio ?? 'Rimozione non riuscita.', tipo: 'errore' })
    }
  }

  const complete = stato?.complete ?? false
  const puoSalvare = parolaChiave.trim().length > 0 && pincode.trim().length > 0

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={16} className="text-gray-400 flex-shrink-0" />
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Sistema Tessera Sanitaria
        </h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Servono per trasmettere le fatture al Sistema TS. Si trovano sul portale{' '}
        <span className="font-medium">sistemats.it</span>: accedi con SPID, CIE o credenziali
        e apri <span className="font-medium">Profilo Utente</span>. Il pincode è sotto{' '}
        <span className="font-medium">Stampa pincode</span>, la parola chiave è quella che
        usi per accedere.
      </p>

      {messaggio && (
        <div
          className={`flex items-start gap-2 p-3 mb-4 rounded-xl border text-xs ${
            messaggio.tipo === 'ok'
              ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          }`}
        >
          {messaggio.tipo === 'ok' ? (
            <Check size={14} className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          )}
          <span className="min-w-0 break-words">{messaggio.testo}</span>
        </div>
      )}

      {/* Il codice identificativo è il codice fiscale, già nel profilo */}
      {!codiceFiscale?.trim() && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Compila prima il <span className="font-medium">codice fiscale</span> qui sopra: è
            il codice identificativo con cui il Sistema TS riconosce l'erogatore.
          </p>
        </div>
      )}

      {complete ? (
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <ShieldCheck size={20} className="text-teal-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Credenziali configurate
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Conservate nel portachiavi del sistema, fuori dall'archivio e dalle copie di
              sicurezza.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleElimina}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
          >
            <X size={16} />
            Rimuovi
          </Button>
        </div>
      ) : null}

      {/* I campi restano visibili anche quando è già configurato: la parola
          chiave del Sistema TS scade periodicamente e va riaggiornata. */}
      <div className={complete ? 'mt-4' : ''}>
        {complete && (
          <p className="text-xs text-gray-400 mb-3">
            La parola chiave del Sistema TS scade periodicamente: quando succede, il portale
            ne chiede una nuova e va aggiornata anche qui.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={complete ? 'Nuova parola chiave' : 'Parola chiave'}
            type="password"
            autoComplete="off"
            placeholder="La password del portale"
            value={parolaChiave}
            onChange={(e) => setParolaChiave(e.target.value)}
          />
          <Input
            label={complete ? 'Nuovo pincode' : 'Pincode'}
            type="password"
            autoComplete="off"
            placeholder="Dal PDF di Stampa pincode"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
          />
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={handleSalva} loading={salvando} disabled={!puoSalvare}>
            <Check size={16} />
            {complete ? 'Aggiorna credenziali' : 'Salva credenziali'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
