import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import {
  codiceRecupero,
  destinazioniSuggerite,
  impostaCartellaBackup,
  scegliCartella,
  segnaCopieConfigurate,
} from '../lib/backupService'
import { iconaBlue, iconaWhite } from '../assets/logos'
import { AlertTriangle, Check, Copy, FolderOpen, KeyRound, Save, X } from 'lucide-react'

interface CopieSetupPageProps {
  onCompletato: () => void
}

/**
 * Configurazione iniziale delle copie di sicurezza, mostrata una sola volta
 * dopo il profilo.
 *
 * Le due domande sono qui e non nelle Impostazioni per un motivo preciso: sono
 * le uniche due decisioni che rendono i dati davvero recuperabili, e un utente
 * non tecnico non andrebbe mai a cercarle da solo.
 */
export function CopieSetupPage({ onCompletato }: CopieSetupPageProps) {
  const [suggerite, setSuggerite] = useState<string[]>([])
  const [cartella, setCartella] = useState<string | null>(null)
  const [codice, setCodice] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [completando, setCompletando] = useState(false)

  useEffect(() => {
    destinazioniSuggerite().then(setSuggerite).catch(() => setSuggerite([]))
    codiceRecupero().then(setCodice).catch((e) => setErrore(String(e)))
  }, [])

  async function scegli(percorso: string) {
    try {
      await impostaCartellaBackup(percorso)
      setCartella(percorso)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleSfoglia() {
    try {
      const scelta = await scegliCartella()
      if (scelta) await scegli(scelta)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }

  async function copiaCodice() {
    if (!codice) return
    try {
      await navigator.clipboard.writeText(codice)
      setSalvato(true)
    } catch {
      setErrore('Copia non riuscita: seleziona il codice e copialo a mano.')
    }
  }

  async function salvaSuFile() {
    if (!codice) return
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const percorso = await save({
        defaultPath: 'MyMedicalFlow-codice-di-recupero.txt',
        title: 'Salva il codice di recupero',
        filters: [{ name: 'Testo', extensions: ['txt'] }],
      })
      if (!percorso) return
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('save_text_file', {
        path: percorso,
        content:
          'MyMedicalFlow — codice di recupero\n\n' +
          `${codice}\n\n` +
          'Serve a rileggere le copie di sicurezza su un altro computer.\n' +
          'Conservalo fuori da questo PC: senza, dopo un guasto i dati non sono recuperabili.\n',
      })
      setSalvato(true)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleContinua() {
    setCompletando(true)
    try {
      await segnaCopieConfigurate()
      onCompletato()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
      setCompletando(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-gray-100 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Intestazione */}
        <div className="flex items-center gap-3">
          <img src={iconaBlue} alt="" className="w-9 h-9 object-contain dark:hidden" />
          <img src={iconaWhite} alt="" className="w-9 h-9 object-contain hidden dark:block" />
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
              Ultimo passaggio
            </p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Metti al sicuro i tuoi dati
            </h1>
          </div>
        </div>

        {errore && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{errore}</span>
          </div>
        )}

        {/* 1. Dove salvare */}
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 flex-shrink-0 font-semibold text-sm">
              1
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Dove conservare le copie
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                A ogni chiusura l'app salverà da sola una copia cifrata. Scegli una
                cartella che porti i file <span className="font-medium">fuori da questo
                computer</span>: se il disco si guasta o il PC viene rubato, è l'unica cosa
                che ti resta.
              </p>
            </div>
          </div>

          {cartella ? (
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <Check size={20} className="text-teal-500 flex-shrink-0" />
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">
                {cartella}
              </p>
              <Button variant="ghost" size="sm" onClick={handleSfoglia} className="flex-shrink-0">
                Cambia
              </Button>
            </div>
          ) : (
            <>
              {suggerite.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {suggerite.map((s) => (
                    <Button key={s} variant="secondary" size="sm" onClick={() => scegli(s)}>
                      <FolderOpen size={14} />
                      {s.split(/[/\\]/).pop()}
                    </Button>
                  ))}
                </div>
              )}
              <Button variant="secondary" size="sm" onClick={handleSfoglia}>
                <FolderOpen size={14} />
                Scegli una cartella…
              </Button>
              <p className="text-xs text-gray-400 mt-3">
                Va bene una cartella sincronizzata (OneDrive, Dropbox, Google Drive), una
                chiavetta USB o un disco esterno. Puoi anche saltare e deciderlo più tardi
                dalle Impostazioni.
              </p>
            </>
          )}
        </Card>

        {/* 2. Codice di recupero */}
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 flex-shrink-0 font-semibold text-sm">
              2
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Il tuo codice di recupero
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Le copie sono cifrate. Questo codice è l'unico modo di rileggerle su un
                altro computer.
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            {codice ? (
              <p className="font-mono text-sm text-gray-900 dark:text-white break-all select-all">
                {codice}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Generazione in corso…</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="primary" size="sm" onClick={salvaSuFile} disabled={!codice}>
                <Save size={14} />
                Salva su file
              </Button>
              <Button variant="secondary" size="sm" onClick={copiaCodice} disabled={!codice}>
                <Copy size={14} />
                Copia
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <KeyRound size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Conservalo <span className="font-medium">fuori da questo computer</span>:
              stampato, su una chiavetta o in un gestore di password. Se lo perdi e il PC
              si guasta, le copie non sono recuperabili in alcun modo — nemmeno da noi.
            </p>
          </div>

          <label className="flex items-center gap-2.5 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={salvato}
              onChange={(e) => setSalvato(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Ho conservato il codice in un luogo sicuro
            </span>
          </label>
        </Card>

        {/* Conclusione */}
        <div className="flex items-center justify-between gap-4">
          {!cartella && (
            <p className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
              <X size={14} className="flex-shrink-0" />
              Nessuna cartella scelta: le copie resteranno solo su questo computer.
            </p>
          )}
          <Button
            onClick={handleContinua}
            loading={completando}
            disabled={!salvato || !codice}
            title={!salvato ? 'Conferma di aver conservato il codice di recupero' : undefined}
            className="ml-auto flex-shrink-0"
          >
            <Check size={16} />
            Inizia a usare MyMedicalFlow
          </Button>
        </div>
      </div>
    </div>
  )
}
