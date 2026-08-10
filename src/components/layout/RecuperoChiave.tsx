import { useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { chiaveRecuperaDaCodice } from '../../lib/chiaveService'

interface RecuperoChiaveProps {
  onRecuperato: () => void
}

function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Si è verificato un errore imprevisto.'
}

/**
 * Schermata mostrata quando la chiave locale non è leggibile su questo
 * account o PC (la cartella dati è stata copiata altrove). L'archivio resta
 * intatto: serve il codice di recupero per riottenere l'accesso qui.
 */
export function RecuperoChiave({ onRecuperato }: RecuperoChiaveProps) {
  const [codice, setCodice] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function handleConferma() {
    if (!codice.trim()) return
    setInCorso(true)
    setErrore(null)
    try {
      await chiaveRecuperaDaCodice(codice.trim())
      onRecuperato()
    } catch (err) {
      setErrore(messaggioErrore(err))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
      <Card className="w-full max-w-lg">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-500 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Serve il codice di recupero
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              La chiave che protegge i tuoi dati non è leggibile su questo account o PC.
            </p>
          </div>
        </div>

        <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            I tuoi dati <span className="font-medium text-gray-900 dark:text-white">non sono stati modificati</span>.
            Inserisci il codice di recupero mostrato a suo tempo nella sezione "Copie di
            sicurezza" per riottenere l'accesso qui.
          </p>
        </div>

        <div className="mt-5">
          <Input
            label="Codice di recupero"
            autoComplete="off"
            placeholder="XXXX-XXXX-XXXX-…"
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            className="font-mono"
          />
          {errore && <p className="text-sm text-red-500 mt-2">{errore}</p>}
          <Button onClick={handleConferma} loading={inCorso} className="mt-3">
            <KeyRound size={14} />
            Ripristina l'accesso
          </Button>
        </div>
      </Card>
    </div>
  )
}
