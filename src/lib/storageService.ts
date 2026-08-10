/**
 * Servizio di storage locale.
 *
 * Espone un'API **sincrona** (usata da tutti i servizi e store dell'app)
 * appoggiata a una cache in memoria.
 *
 * - In Tauri i dati vengono persistiti in un archivio cifrato gestito dal
 *   backend Rust (DPAPI su Windows). La cifratura richiede una chiamata
 *   asincrona, quindi la cache viene idratata una volta all'avvio da
 *   `inizializzaStorage()` e le scritture vengono propagate in coda.
 * - Nel browser (sviluppo con `npm run dev`) si continua a usare localStorage.
 *
 * Alla prima esecuzione dopo l'aggiornamento i dati presenti in localStorage
 * vengono migrati nell'archivio cifrato e rimossi solo dopo che la rilettura
 * ha confermato la migrazione.
 */

const PREFIX = 'mmf_' // MyMedicalFlow prefix

type Modalita = 'localStorage' | 'cifrato'

let modalita: Modalita = 'localStorage'

/** Cache in memoria: chiave logica → valore JSON serializzato. */
const cache = new Map<string, string>()

/** Coda di scrittura: serializza le persistenze per evitare sovrapposizioni. */
let coda: Promise<void> = Promise.resolve()

/**
 * Se l'archivio non è stato caricato correttamente le scritture vengono
 * bloccate: persistere una cache vuota sovrascriverebbe i dati esistenti.
 */
let scritturaBloccata = false

let ultimoErroreScrittura: string | null = null

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function serializza(): string {
  return JSON.stringify(Object.fromEntries(cache))
}

async function invocaBackend<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

function persisti(): void {
  if (modalita !== 'cifrato' || scritturaBloccata) return
  const daScrivere = serializza()
  coda = coda
    .then(async () => {
      await invocaBackend<void>('secure_store_save', { data: daScrivere })
      ultimoErroreScrittura = null
    })
    .catch((err) => {
      ultimoErroreScrittura = err instanceof Error ? err.message : String(err)
      console.error('[StorageService] Persistenza non riuscita:', err)
    })
}

// ─── Accesso grezzo ───────────────────────────────────────────────────────────

function leggiGrezzo(key: string): string | null {
  if (modalita === 'cifrato') return cache.get(key) ?? null
  return localStorage.getItem(PREFIX + key)
}

function scriviGrezzo(key: string, raw: string | null): void {
  if (modalita === 'cifrato') {
    if (raw === null) cache.delete(key)
    else cache.set(key, raw)
    persisti()
    return
  }
  if (raw === null) localStorage.removeItem(PREFIX + key)
  else localStorage.setItem(PREFIX + key, raw)
}

function chiaviLocalStorage(): string[] {
  return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
}

// ─── Avvio ────────────────────────────────────────────────────────────────────

export interface EsitoInizializzazione {
  /** true se i dati sono conservati nell'archivio cifrato. */
  cifrato: boolean
  /** true se in questo avvio è avvenuta la migrazione da localStorage. */
  migrato: boolean
}

/**
 * Idrata la cache dall'archivio cifrato, migrando i dati da localStorage se
 * l'archivio non esiste ancora.
 *
 * Va attesa **prima** di leggere qualunque dato: fino ad allora la cache è
 * vuota. In caso di errore solleva un'eccezione e blocca le scritture, perché
 * proseguire significherebbe sovrascrivere l'archivio con dati vuoti.
 */
export async function inizializzaStorage(): Promise<EsitoInizializzazione> {
  if (!isTauri()) {
    // Sviluppo nel browser: nessun backend nativo, si resta su localStorage.
    modalita = 'localStorage'
    return { cifrato: false, migrato: false }
  }

  let esistente: string | null
  try {
    esistente = await invocaBackend<string | null>('secure_store_load')
  } catch (err) {
    scritturaBloccata = true
    throw new Error(
      `Impossibile aprire l'archivio dei dati. ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  cache.clear()

  if (esistente !== null && esistente !== undefined && esistente !== '') {
    let contenuto: unknown
    try {
      contenuto = JSON.parse(esistente)
    } catch {
      scritturaBloccata = true
      throw new Error("L'archivio dei dati risulta danneggiato e non è stato possibile leggerlo.")
    }
    if (contenuto && typeof contenuto === 'object' && !Array.isArray(contenuto)) {
      for (const [k, v] of Object.entries(contenuto as Record<string, unknown>)) {
        if (typeof v === 'string') cache.set(k, v)
      }
    }
    modalita = 'cifrato'
    return { cifrato: true, migrato: false }
  }

  // ── Prima esecuzione: migrazione dei dati in chiaro da localStorage ──
  const chiavi = chiaviLocalStorage()
  for (const chiaveCompleta of chiavi) {
    const valore = localStorage.getItem(chiaveCompleta)
    if (valore !== null) cache.set(chiaveCompleta.slice(PREFIX.length), valore)
  }

  const atteso = serializza()
  try {
    await invocaBackend<void>('secure_store_save', { data: atteso })
    // Verifica prima di cancellare l'originale: se la rilettura non coincide
    // i dati in chiaro restano dove sono.
    const riletto = await invocaBackend<string | null>('secure_store_load')
    if (riletto !== atteso) {
      throw new Error('la verifica dopo la scrittura non è andata a buon fine')
    }
  } catch (err) {
    scritturaBloccata = true
    throw new Error(
      `Migrazione dell'archivio non riuscita, i dati non sono stati modificati. ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  // Migrazione confermata: rimuove le copie in chiaro da localStorage.
  for (const chiaveCompleta of chiavi) localStorage.removeItem(chiaveCompleta)

  modalita = 'cifrato'
  return { cifrato: true, migrato: chiavi.length > 0 }
}

/**
 * Sostituisce l'intero archivio con il contenuto di una copia di sicurezza.
 *
 * Riceve la mappa `chiave -> JSON serializzato` così com'era al momento della
 * copia. Attende la scrittura su disco: un errore deve emergere subito, non
 * dopo che l'utente ha già visto "ripristino completato".
 */
export async function sostituisciArchivio(mappaJson: string): Promise<void> {
  let contenuto: unknown
  try {
    contenuto = JSON.parse(mappaJson)
  } catch {
    throw new Error('La copia di sicurezza non è leggibile.')
  }
  if (typeof contenuto !== 'object' || contenuto === null || Array.isArray(contenuto)) {
    throw new Error('La copia di sicurezza non contiene dati validi.')
  }

  const voci = Object.entries(contenuto as Record<string, unknown>).filter(
    ([, v]) => typeof v === 'string',
  ) as [string, string][]

  if (modalita === 'cifrato') {
    if (scritturaBloccata) {
      throw new Error("L'archivio non è disponibile in scrittura.")
    }
    cache.clear()
    for (const [k, v] of voci) cache.set(k, v)
    persisti()
    await flushStorage()
    return
  }

  chiaviLocalStorage().forEach((k) => localStorage.removeItem(k))
  for (const [k, v] of voci) localStorage.setItem(PREFIX + k, v)
}

/**
 * Attende che tutte le scritture in coda siano state completate.
 * Solleva un'eccezione se l'ultima persistenza è fallita.
 */
export async function flushStorage(): Promise<void> {
  await coda
  if (ultimoErroreScrittura) {
    const messaggio = ultimoErroreScrittura
    ultimoErroreScrittura = null
    throw new Error(`Salvataggio su disco non riuscito. ${messaggio}`)
  }
}

// ─── API pubblica ─────────────────────────────────────────────────────────────

export const storageService = {
  get<T>(key: string): T | null {
    try {
      const raw = leggiGrezzo(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },

  /** Restituisce true se il salvataggio è andato a buon fine. */
  set<T>(key: string, value: T): boolean {
    try {
      scriviGrezzo(key, JSON.stringify(value))
      return true
    } catch (err) {
      console.error('[StorageService] Errore nel salvataggio:', err)
      return false
    }
  },

  remove(key: string): void {
    scriviGrezzo(key, null)
  },

  clear(): void {
    if (modalita === 'cifrato') {
      cache.clear()
      persisti()
      return
    }
    chiaviLocalStorage().forEach((k) => localStorage.removeItem(k))
  },

  /**
   * Legge il valore grezzo (non deserializzato) di una chiave.
   * Usato dal backup per fotografare lo stato esatto prima di un ripristino.
   */
  getRaw(key: string): string | null {
    return leggiGrezzo(key)
  },

  /**
   * Scrive il valore grezzo di una chiave, o la rimuove se `raw` è null.
   * A differenza di `set` propaga l'eccezione: il chiamante deve poter
   * distinguere una scrittura riuscita da una fallita (es. quota esaurita).
   */
  setRaw(key: string, raw: string | null): void {
    scriviGrezzo(key, raw)
  },
}
