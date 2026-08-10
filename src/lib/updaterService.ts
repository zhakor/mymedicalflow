/**
 * Aggiornamenti dell'applicazione.
 *
 * Usa esclusivamente il plugin ufficiale Tauri Updater: il pacchetto viene
 * scaricato dalla release GitHub e installato solo se la **firma** corrisponde
 * alla chiave pubblica compilata nell'app. Nessun download o esecuzione di file
 * viene fatto a mano.
 *
 * L'app è pensata per funzionare offline: qualunque errore qui è accessorio e
 * non deve mai impedire l'avvio o l'uso del gestionale.
 */

import type { Update } from '@tauri-apps/plugin-updater'
import { isTauri } from './documentService'

export interface InfoAggiornamento {
  versioneCorrente: string
  versioneNuova: string
  /** Note di rilascio; può mancare. */
  note?: string
  data?: string
}

export interface AvanzamentoDownload {
  scaricati: number
  totale: number | null
}

/** Errore già tradotto per l'utente, con il dettaglio tecnico conservato a parte. */
export class ErroreAggiornamento extends Error {
  constructor(
    message: string,
    readonly dettaglio: string,
  ) {
    super(message)
    this.name = 'ErroreAggiornamento'
  }
}

function log(messaggio: string, extra?: unknown) {
  // Non registra mai contenuti sensibili: solo stato e versioni.
  if (extra === undefined) console.info(`[updater] ${messaggio}`)
  else console.info(`[updater] ${messaggio}`, extra)
}

function dettaglioDi(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * Traduce l'errore tecnico del plugin in un messaggio comprensibile.
 * Il dettaglio originale resta nei log e dentro `ErroreAggiornamento`.
 */
function traduci(err: unknown, fase: 'controllo' | 'download' | 'installazione'): ErroreAggiornamento {
  const dettaglio = dettaglioDi(err)
  const t = dettaglio.toLowerCase()

  let messaggio: string
  if (
    t.includes('network') ||
    t.includes('dns') ||
    t.includes('connect') ||
    t.includes('timed out') ||
    t.includes('timeout') ||
    t.includes('offline') ||
    t.includes('unreachable') ||
    t.includes('sending request')
  ) {
    messaggio = 'Impossibile raggiungere il server degli aggiornamenti. Controlla la connessione Internet e riprova.'
  } else if (t.includes('signature') || t.includes('sign')) {
    messaggio =
      "L'aggiornamento scaricato non ha una firma valida e non è stato installato. Riprova più tardi."
  } else if (t.includes('404') || t.includes('not found')) {
    messaggio = 'Nessuna informazione di aggiornamento disponibile al momento.'
  } else if (fase === 'download') {
    messaggio = "Impossibile scaricare l'aggiornamento. Controlla la connessione Internet e riprova."
  } else if (fase === 'installazione') {
    messaggio = "Impossibile installare l'aggiornamento. Riprova, oppure scarica manualmente l'ultima versione."
  } else {
    messaggio = 'Controllo degli aggiornamenti non riuscito.'
  }

  console.error(`[updater] errore in fase di ${fase}:`, dettaglio)
  return new ErroreAggiornamento(messaggio, dettaglio)
}

/** Versione dell'app, letta dal runtime e mai scritta a mano nei componenti. */
export async function versioneApp(): Promise<string> {
  if (!isTauri()) return 'sviluppo'
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}

/**
 * Cerca un aggiornamento. Restituisce `null` se l'app è già aggiornata
 * oppure se non siamo in ambiente desktop.
 */
export async function cercaAggiornamento(): Promise<
  { info: InfoAggiornamento; update: Update } | null
> {
  if (!isTauri()) return null

  log('controllo avviato')
  let update: Update | null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    update = await check()
  } catch (err) {
    throw traduci(err, 'controllo')
  }

  if (!update) {
    log('nessun aggiornamento disponibile')
    return null
  }

  const info: InfoAggiornamento = {
    versioneCorrente: update.currentVersion,
    versioneNuova: update.version,
    note: update.body?.trim() ? update.body.trim() : undefined,
    data: update.date,
  }
  log(`aggiornamento trovato: ${info.versioneCorrente} → ${info.versioneNuova}`)
  return { info, update }
}

/**
 * Scarica e installa l'aggiornamento, riportando l'avanzamento.
 * Al termine l'app va riavviata con `riavvia()`.
 */
export async function installaAggiornamento(
  update: Update,
  onAvanzamento?: (a: AvanzamentoDownload) => void,
): Promise<void> {
  let scaricati = 0
  let totale: number | null = null

  try {
    log('download avviato')
    await update.downloadAndInstall((evento) => {
      switch (evento.event) {
        case 'Started':
          totale = evento.data.contentLength ?? null
          onAvanzamento?.({ scaricati: 0, totale })
          break
        case 'Progress':
          scaricati += evento.data.chunkLength
          onAvanzamento?.({ scaricati, totale })
          break
        case 'Finished':
          log('download completato, installazione avviata')
          onAvanzamento?.({ scaricati: totale ?? scaricati, totale })
          break
      }
    })
    log('installazione completata')
  } catch (err) {
    // Il plugin unisce download e installazione: si distingue dallo stato
    // raggiunto, non dal tipo di eccezione.
    throw traduci(err, scaricati > 0 ? 'installazione' : 'download')
  }
}

/** Riavvia l'app per completare l'aggiornamento. */
export async function riavvia(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
