import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { CloudUpload, LogOut, RefreshCw, Smartphone } from 'lucide-react'
import {
  accediGoogle,
  accountCollegato,
  configuraSincronizzazione,
  esciGoogle,
  leggiConfigurazione,
  type AccountGoogle,
} from '../../lib/cloudService'

interface SincronizzazioneCardProps {
  onFeedback: (testo: string, tipo?: 'success' | 'error') => void
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const messaggio = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * «App mobile e sincronizzazione» (CR §8): accesso Google e configurazione
 * di Drive, perché l'app sul telefono possa aprire l'archivio dello studio.
 */
export function SincronizzazioneCard({ onFeedback }: SincronizzazioneCardProps) {
  const [account, setAccount] = useState<AccountGoogle | null | undefined>(undefined)
  const [configurazione, setConfigurazione] = useState(leggiConfigurazione)
  const [attesa, setAttesa] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

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

  const accedi = () => esegui("Completa l'accesso nella finestra del browser…", async () => setAccount(await accediGoogle()))

  const configura = () =>
    esegui('Configurazione in corso…', async () => {
      const esito = await configuraSincronizzazione((p) => setAttesa(`${p}…`))
      setConfigurazione(leggiConfigurazione())
      onFeedback(
        esito.tipo === 'nuova'
          ? "Archivio caricato su Google Drive e verificato: l'app sul telefono può collegarsi."
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
