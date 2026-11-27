import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Check, Cloud, CloudUpload, LogOut, RefreshCw, Smartphone } from 'lucide-react'
import {
  accediGoogle,
  accountCollegato,
  configuraSincronizzazione,
  esciGoogle,
  leggiConfigurazione,
  riprovaSincronizzazione,
  type AccountGoogle,
} from '../../lib/cloudService'
import { useSincronizzazioneStore, type StatoSync } from '../../stores/sincronizzazioneStore'

interface SincronizzazioneCardProps {
  onFeedback: (testo: string, tipo?: 'success' | 'error') => void
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const messaggio = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Lo stato in parole: connesso, in aggiornamento, non connesso (o cosa serve per ripartire). */
function statoInParole(stato: StatoSync): { testo: string; tono: 'ok' | 'attesa' | 'problema' } {
  switch (stato) {
    case 'allineato':
      return { testo: 'Connesso: i dati sono allineati con il telefono.', tono: 'ok' }
    case 'in-corso':
    case 'avvio':
      return { testo: 'In aggiornamento…', tono: 'attesa' }
    case 'offline':
      return { testo: 'Non connesso: le modifiche restano su questo PC e partono al ritorno della rete.', tono: 'attesa' }
    case 'accesso':
      return { testo: "Non connesso: l'accesso a Google è scaduto, accedi di nuovo.", tono: 'problema' }
    case 'errore':
      return { testo: 'Non connesso: la sincronizzazione si è interrotta.', tono: 'problema' }
    default:
      return { testo: 'Non connesso.', tono: 'attesa' }
  }
}

/**
 * «App mobile e sincronizzazione» (CR §8): accesso Google e configurazione
 * di Drive, perché l'app sul telefono possa aprire l'archivio dello studio.
 */
export function SincronizzazioneCard({ onFeedback }: SincronizzazioneCardProps) {
  const [account, setAccount] = useState<AccountGoogle | null | undefined>(undefined)
  const [configurazione, setConfigurazione] = useState(leggiConfigurazione)
  const [attesa, setAttesa] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const sync = useSincronizzazioneStore()

  useEffect(() => {
    if (!isTauri()) return
    accountCollegato().then(setAccount, () => setAccount(null))
  }, [])

  if (!isTauri()) return null

  const esegui = async (inAttesa: string, lavoro: () => Promise<void>) => {
    setErrore(null)
    setAttesa(inAttesa)
    try {
      await lavoro()
    } catch (err) {
      setErrore(messaggio(err))
    } finally {
      setAttesa(null)
    }
  }

  const accedi = () =>
    esegui("Completa l'accesso nella finestra del browser…", async () => {
      setAccount(await accediGoogle())
      // Con la configurazione già fatta riparte la sincronizzazione
      if (leggiConfigurazione()?.radice) await riprovaSincronizzazione()
    })

  const configura = () =>
    esegui('Configurazione in corso…', async () => {
      const esito = await configuraSincronizzazione((p) => setAttesa(`${p}…`))
      setConfigurazione(leggiConfigurazione())
      await riprovaSincronizzazione()
      onFeedback(
        esito.tipo === 'nuova'
          ? "Archivio caricato su Google Drive e verificato: l'app sul telefono può collegarsi."
          : esito.datiDaDrive
            ? "PC collegato all'archivio già presente su Google Drive. I dati del PC sono stati sostituiti con quelli di Drive; quelli di prima sono in una copia di sicurezza."
            : esito.tipo === 'adozione'
              ? "PC collegato all'archivio già presente su Google Drive."
              : 'Collegamento a Google Drive verificato.',
      )
    })

  const esci = () =>
    esegui('Uscita in corso…', async () => {
      await esciGoogle()
      setAccount(null)
      setConfigurazione(leggiConfigurazione())
    })

  const configurata = !!configurazione?.radice && configurazione.email === account?.email

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">App mobile e sincronizzazione</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Porta l'archivio dello studio sul tuo Google Drive, cifrato con il codice di recupero, per usarlo anche dall'app
        sul telefono.
      </p>

      {account === undefined ? (
        <p className="text-sm text-gray-400">Verifica dell'accesso…</p>
      ) : !account ? (
        <Button onClick={accedi} loading={!!attesa} disabled={!!attesa}>
          Accedi con Google
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{account.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {configurata
                  ? `Archivio su Drive configurato il ${new Date(configurazione!.configurataIl!).toLocaleDateString('it-IT')}`
                  : 'Archivio non ancora caricato su Drive'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={esci} disabled={!!attesa} className="flex-shrink-0">
              <LogOut size={15} /> Esci
            </Button>
          </div>

          <Button onClick={configura} loading={!!attesa} disabled={!!attesa} variant={configurata ? 'secondary' : 'primary'}>
            {configurata ? <RefreshCw size={16} /> : <CloudUpload size={16} />}
            {configurata ? 'Verifica il collegamento' : "Carica l'archivio su Google Drive"}
          </Button>

          {configurata && <StatoSincronizzazione {...sync} onAccedi={accedi} inAttesa={!!attesa} />}

          {configurata && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-sm text-teal-800 dark:text-teal-300">
              <Smartphone size={18} className="flex-shrink-0 mt-0.5" />
              <p>
                Sul telefono accedi con lo stesso account Google. Per aprire l'archivio ti servirà il{' '}
                <strong>codice di recupero</strong>, che trovi qui sotto in «Copie di sicurezza».
              </p>
            </div>
          )}
        </div>
      )}

      {attesa && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{attesa}</p>}
      {errore && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errore}</p>}
    </Card>
  )
}

function StatoSincronizzazione({
  stato,
  errore,
  onAccedi,
  inAttesa,
}: {
  stato: StatoSync
  errore: string | null
  onAccedi: () => void
  inAttesa: boolean
}) {
  const { testo, tono } = statoInParole(stato)
  return (
    <div
      className={
        tono === 'problema'
          ? 'p-4 rounded-xl border text-sm bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
          : 'p-4 rounded-xl border text-sm bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
      }
    >
      <p className="flex items-center gap-2">
        {tono === 'ok' ? <Check size={16} className="text-teal-600 flex-shrink-0" /> : <Cloud size={16} className="flex-shrink-0" />}
        {testo}
      </p>
      {stato === 'errore' && errore && <p className="mt-1 text-xs opacity-80">{errore}</p>}
      {stato === 'accesso' && (
        <Button size="sm" className="mt-3" onClick={onAccedi} disabled={inAttesa}>
          Accedi di nuovo
        </Button>
      )}
      {stato === 'errore' && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void riprovaSincronizzazione()}>
          <RefreshCw size={14} /> Riprova
        </Button>
      )}
    </div>
  )
}
