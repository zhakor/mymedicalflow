import { useCallback, useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { RipristinoConfirm } from './RipristinoConfirm'
import {
  apriCopia,
  codiceRecupero,
  creaCopiaOra,
  destinazioniSuggerite,
  elencaCopie,
  formattaDimensione,
  impostaCartellaBackup,
  leggiPreferenze,
  riepilogaArchivio,
  scegliCartella,
  scegliFileCopia,
} from '../../lib/backupService'
import type { CopiaSicurezza, RiepilogoCopia } from '../../lib/backupService'
import { sostituisciArchivio } from '../../lib/storageService'
import { useProfiloStore } from '../../stores/profiloStore'
import { useImpostazioniStore } from '../../stores/impostazioniStore'
import { usePazienteStore } from '../../stores/pazienteStore'
import { useAppuntamentoStore } from '../../stores/appuntamentoStore'
import { useFatturaStore } from '../../stores/fatturaStore'
import {
  AlertTriangle,
  Check,
  Copy,
  FolderOpen,
  History,
  KeyRound,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'

interface CopieCardProps {
  onFeedback: (testo: string, tipo?: 'success' | 'error') => void
}

interface DaRipristinare {
  percorso: string
  etichetta: string
  creatoIl: number | null
  riepilogo: RiepilogoCopia
  contenuto: string
}

function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Si è verificato un errore imprevisto.'
}

function cartellaDi(percorso: string): string {
  const taglio = Math.max(percorso.lastIndexOf('\\'), percorso.lastIndexOf('/'))
  return taglio > 0 ? percorso.slice(0, taglio) : percorso
}

/** Una copia salvata, con tutte le cartelle in cui è finita. */
interface GruppoCopie {
  creatoIl: number
  dimensione: number
  cartelle: string[]
  /** File usato per il ripristino: si preferisce quello locale, sempre raggiungibile. */
  percorso: string
}

/**
 * Raggruppa per istante di creazione: la stessa copia viene scritta in più
 * destinazioni, e mostrarla una volta per cartella confonderebbe.
 */
function raggruppa(copie: CopiaSicurezza[]): GruppoCopie[] {
  const per_istante = new Map<number, CopiaSicurezza[]>()
  for (const c of copie) {
    const gruppo = per_istante.get(c.creatoIl)
    if (gruppo) gruppo.push(c)
    else per_istante.set(c.creatoIl, [c])
  }

  return [...per_istante.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([creatoIl, voci]) => ({
      creatoIl,
      dimensione: voci[0].dimensione,
      cartelle: voci.map((v) => cartellaDi(v.percorso)),
      percorso: (voci.find((v) => !v.esterno) ?? voci[0]).percorso,
    }))
}

/** Riallinea gli store dopo la sostituzione dell'archivio. */
function ricaricaStore() {
  useProfiloStore.getState().caricaProfilo()
  useImpostazioniStore.getState().caricaImpostazioni()
  const { impostazioni, applicaTema } = useImpostazioniStore.getState()
  applicaTema(impostazioni.tema)
  usePazienteStore.getState().resetFilters()
  useAppuntamentoStore.getState().resetFilters()
  useFatturaStore.getState().resetFilters()
}

export function CopieCard({ onFeedback }: CopieCardProps) {
  const [copie, setCopie] = useState<CopiaSicurezza[]>([])
  const [cartella, setCartella] = useState<string | null>(null)
  const [suggerite, setSuggerite] = useState<string[]>([])
  const [codice, setCodice] = useState<string | null>(null)
  const [codiceVisibile, setCodiceVisibile] = useState(false)
  const [copiaInCorso, setCopiaInCorso] = useState(false)

  const [daRipristinare, setDaRipristinare] = useState<DaRipristinare | null>(null)
  const [ripristinando, setRipristinando] = useState(false)
  const [mostraTutte, setMostraTutte] = useState(false)

  // Codice richiesto per le copie provenienti da un altro computer
  const [fileEsterno, setFileEsterno] = useState<string | null>(null)
  const [codiceInserito, setCodiceInserito] = useState('')
  const [aprendo, setAprendo] = useState(false)

  const aggiorna = useCallback(() => {
    elencaCopie().then(setCopie).catch(() => setCopie([]))
    leggiPreferenze()
      .then((p) => setCartella(p.cartellaBackup))
      .catch(() => setCartella(null))
    destinazioniSuggerite().then(setSuggerite).catch(() => setSuggerite([]))
  }, [])

  useEffect(() => {
    aggiorna()
  }, [aggiorna])

  // ─── Cartella di destinazione ───────────────────────────────────────────────

  async function salvaCartella(scelta: string | null) {
    try {
      await impostaCartellaBackup(scelta)
      setCartella(scelta)
      aggiorna()
      onFeedback(
        scelta
          ? `Le copie verranno salvate anche in ${scelta}`
          : 'Cartella esterna rimossa: le copie restano solo su questo computer.',
      )
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  async function handleSfoglia() {
    try {
      const scelta = await scegliCartella()
      if (scelta) await salvaCartella(scelta)
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  // ─── Copia immediata ────────────────────────────────────────────────────────

  async function handleCopiaOra() {
    setCopiaInCorso(true)
    try {
      const esito = await creaCopiaOra()
      if (esito.creatoIl === null) {
        onFeedback('Non ci sono ancora dati da salvare.')
      } else if (esito.fallite.length > 0) {
        onFeedback(`Copia non riuscita in: ${esito.fallite.join(', ')}`, 'error')
      } else {
        onFeedback(`Copia salvata in ${esito.riuscite.length} destinazioni.`)
      }
      aggiorna()
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    } finally {
      setCopiaInCorso(false)
    }
  }

  // ─── Codice di recupero ─────────────────────────────────────────────────────

  async function mostraCodice() {
    try {
      const c = await codiceRecupero()
      setCodice(c)
      setCodiceVisibile(true)
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  async function copiaCodice() {
    if (!codice) return
    try {
      await navigator.clipboard.writeText(codice)
      onFeedback('Codice di recupero copiato negli appunti.')
    } catch {
      onFeedback('Copia non riuscita: selezionalo e copialo a mano.', 'error')
    }
  }

  async function salvaCodiceSuFile() {
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
      onFeedback(`Codice salvato in ${percorso}`)
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  // ─── Ripristino ─────────────────────────────────────────────────────────────

  async function preparaRipristino(
    percorso: string,
    etichetta: string,
    creatoIl: number | null,
    codiceCopia?: string,
  ) {
    const contenuto = await apriCopia(percorso, codiceCopia)
    setDaRipristinare({
      percorso,
      etichetta,
      creatoIl,
      contenuto,
      riepilogo: riepilogaArchivio(contenuto),
    })
  }

  async function handleRipristinaDaElenco(g: GruppoCopie) {
    try {
      await preparaRipristino(
        g.percorso,
        `Copia del ${new Date(g.creatoIl).toLocaleString('it-IT')}`,
        g.creatoIl,
      )
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  async function handleScegliFile() {
    try {
      const percorso = await scegliFileCopia()
      if (!percorso) return
      try {
        // Prima si tenta con la chiave locale: se la copia viene da questo
        // computer non serve chiedere nulla.
        await preparaRipristino(percorso, percorso.split(/[/\\]/).pop() ?? percorso, null)
      } catch {
        setFileEsterno(percorso)
        setCodiceInserito('')
      }
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    }
  }

  async function handleApriConCodice() {
    if (!fileEsterno) return
    setAprendo(true)
    try {
      await preparaRipristino(
        fileEsterno,
        fileEsterno.split(/[/\\]/).pop() ?? fileEsterno,
        null,
        codiceInserito,
      )
      setFileEsterno(null)
      setCodiceInserito('')
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    } finally {
      setAprendo(false)
    }
  }

  async function handleConfermaRipristino() {
    if (!daRipristinare) return
    setRipristinando(true)
    try {
      await sostituisciArchivio(daRipristinare.contenuto)
      ricaricaStore()
      const r = daRipristinare.riepilogo
      setDaRipristinare(null)
      onFeedback(
        `Ripristino completato: ${r.pazienti} pazienti, ${r.appuntamenti} appuntamenti, ${r.fatture} fatture.`,
      )
      aggiorna()
    } catch (err) {
      onFeedback(messaggioErrore(err), 'error')
    } finally {
      setRipristinando(false)
    }
  }

  const cartellaImpostata = cartella !== null && cartella !== ''
  const gruppi = raggruppa(copie)

  return (
    <>
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          Copie di sicurezza
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          A ogni chiusura l'app salva da sola una copia cifrata dei tuoi dati. Non devi
          fare nulla.
        </p>

        {/* Destinazione */}
        {cartellaImpostata ? (
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <FolderOpen size={20} className="text-teal-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {cartella}
              </p>
              <p className="text-xs text-gray-400">Copia aggiuntiva salvata qui</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={handleSfoglia}>
                Cambia
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => salvaCartella(null)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Le copie sono solo su questo computer
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Se il disco si guasta o il PC viene rubato perderai anche le copie.
                  Scegli una cartella che porti i file fuori dal computer: una cartella
                  sincronizzata, una chiavetta USB o un disco esterno.
                </p>
              </div>
            </div>

            {suggerite.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {suggerite.map((s) => (
                  <Button key={s} variant="secondary" size="sm" onClick={() => salvaCartella(s)}>
                    <FolderOpen size={14} />
                    {s.split(/[/\\]/).pop()}
                  </Button>
                ))}
              </div>
            )}

            <Button variant="secondary" size="sm" onClick={handleSfoglia} className="mt-3">
              Scegli un'altra cartella…
            </Button>
          </div>
        )}

        {/* Codice di recupero */}
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={16} className="text-gray-400 flex-shrink-0" />
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
              Codice di recupero
            </h4>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Serve solo per rileggere le copie su un altro computer, ad esempio dopo un
            guasto. Conservalo fuori da questo PC.
          </p>

          {codiceVisibile && codice ? (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="font-mono text-sm text-gray-900 dark:text-white break-all select-all">
                {codice}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="secondary" size="sm" onClick={copiaCodice}>
                  <Copy size={14} />
                  Copia
                </Button>
                <Button variant="secondary" size="sm" onClick={salvaCodiceSuFile}>
                  <Save size={14} />
                  Salva su file
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCodiceVisibile(false)}>
                  Nascondi
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={mostraCodice}>
              <KeyRound size={14} />
              Mostra il codice
            </Button>
          )}
        </div>

        {/* Elenco copie */}
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <History size={16} className="text-gray-400 flex-shrink-0" />
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                Copie disponibili
              </h4>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopiaOra} loading={copiaInCorso}>
              <Check size={14} />
              Salva una copia ora
            </Button>
          </div>

          {gruppi.length > 0 ? (
            <>
              <ul className="space-y-2">
                {(mostraTutte ? gruppi : gruppi.slice(0, 1)).map((g) => (
                  <li
                    key={g.creatoIl}
                    className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {new Date(g.creatoIl).toLocaleString('it-IT')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formattaDimensione(g.dimensione)}
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {g.cartelle.map((cartella) => (
                          <li
                            key={cartella}
                            className="flex items-center gap-1.5 min-w-0 text-xs text-gray-500 dark:text-gray-400"
                          >
                            <FolderOpen size={12} className="flex-shrink-0 text-gray-400" />
                            <span className="truncate" title={cartella}>
                              {cartella}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRipristinaDaElenco(g)}
                      title="Ripristina questa copia"
                      className="flex-shrink-0"
                    >
                      <RotateCcw size={15} />
                      Ripristina
                    </Button>
                  </li>
                ))}
              </ul>

              {gruppi.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostraTutte((v) => !v)}
                  className="mt-2"
                >
                  {mostraTutte
                    ? "Mostra solo l'ultima"
                    : `Mostra le copie precedenti (${gruppi.length - 1})`}
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">Nessuna copia ancora presente.</p>
          )}

          {fileEsterno ? (
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {fileEsterno.split(/[/\\]/).pop()}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Questa copia arriva da un altro computer: serve il suo codice di recupero.
              </p>
              <div className="flex items-end gap-3 mt-3">
                <div className="flex-1 min-w-0">
                  <Input
                    label="Codice di recupero"
                    autoComplete="off"
                    placeholder="XXXX-XXXX-XXXX-…"
                    value={codiceInserito}
                    onChange={(e) => setCodiceInserito(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <Button onClick={handleApriConCodice} loading={aprendo} className="flex-shrink-0">
                  Apri
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setFileEsterno(null)}
                  className="flex-shrink-0"
                >
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleScegliFile} className="mt-3">
              <FolderOpen size={15} />
              Ripristina da un file…
            </Button>
          )}
        </div>
      </Card>

      {daRipristinare && (
        <RipristinoConfirm
          etichetta={daRipristinare.etichetta}
          creatoIl={daRipristinare.creatoIl}
          riepilogo={daRipristinare.riepilogo}
          loading={ripristinando}
          onConfirm={handleConfermaRipristino}
          onCancel={() => setDaRipristinare(null)}
        />
      )}
    </>
  )
}
