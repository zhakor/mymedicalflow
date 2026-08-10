/**
 * Copie di sicurezza.
 *
 * Una copia è l'archivio cifrato così com'è: cifrata con la chiave di questa
 * installazione, apribile su qualsiasi computer disponendo del codice di
 * recupero. Non esiste più un formato in chiaro.
 *
 * Le copie vengono scritte da sole alla chiusura dell'app, sia nella cartella
 * dati sia nella cartella scelta dall'utente.
 */

import { isTauri } from './documentService'

export interface CopiaSicurezza {
  percorso: string
  nome: string
  /** Millisecondi epoch. */
  creatoIl: number
  dimensione: number
  /** Falso se la copia si trova nella cartella dati dell'app. */
  esterno: boolean
}

export interface Preferenze {
  cartellaBackup: string | null
  ultimoBackup: number | null
  copieConfigurate: boolean
}

export interface EsitoBackup {
  riuscite: string[]
  fallite: string[]
  creatoIl: number | null
}

async function invoca<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ─── Codice di recupero ───────────────────────────────────────────────────────

/** Il codice che permette di rileggere le copie su un altro computer. */
export async function codiceRecupero(): Promise<string> {
  return invoca<string>('codice_recupero')
}

// ─── Preferenze ───────────────────────────────────────────────────────────────

export async function leggiPreferenze(): Promise<Preferenze> {
  // Nel browser di sviluppo non c'è backend: la configurazione risulta già
  // fatta, così non si finisce bloccati su una schermata inutilizzabile.
  if (!isTauri()) {
    return { cartellaBackup: null, ultimoBackup: null, copieConfigurate: true }
  }
  return invoca<Preferenze>('preferenze_leggi')
}

/** Registra che la configurazione iniziale delle copie è stata completata. */
export async function segnaCopieConfigurate(): Promise<void> {
  if (!isTauri()) return
  await invoca<void>('segna_copie_configurate')
}

export async function impostaCartellaBackup(cartella: string | null): Promise<void> {
  await invoca<void>('imposta_cartella_backup', { cartella })
}

/** Cartelle che tipicamente portano i file fuori dal computer. */
export async function destinazioniSuggerite(): Promise<string[]> {
  if (!isTauri()) return []
  return invoca<string[]>('destinazioni_suggerite')
}

/** Dialogo nativo per scegliere la cartella delle copie. */
export async function scegliCartella(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const scelta = await open({
    directory: true,
    multiple: false,
    title: 'Scegli dove conservare le copie di sicurezza',
  })
  return typeof scelta === 'string' ? scelta : null
}

// ─── Copie ────────────────────────────────────────────────────────────────────

export async function elencaCopie(): Promise<CopiaSicurezza[]> {
  if (!isTauri()) return []
  return invoca<CopiaSicurezza[]>('backup_elenca')
}

/** Forza una copia immediata, senza attendere la chiusura dell'app. */
export async function creaCopiaOra(): Promise<EsitoBackup> {
  return invoca<EsitoBackup>('backup_crea')
}

/**
 * Apre una copia restituendo il contenuto dell'archivio.
 * Senza codice si usa la chiave di questa installazione; il codice serve per
 * le copie provenienti da un altro computer.
 */
export async function apriCopia(percorso: string, codice?: string): Promise<string> {
  return invoca<string>('backup_apri', { percorso, codice: codice ?? null })
}

/** Sceglie un file di copia, per ripristinarne uno esterno all'elenco. */
export async function scegliFileCopia(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const scelta = await open({
    directory: false,
    multiple: false,
    title: 'Seleziona una copia di sicurezza',
    filters: [{ name: 'Copia MyMedicalFlow', extensions: ['mmfbak'] }],
  })
  return typeof scelta === 'string' ? scelta : null
}

// ─── Riepilogo del contenuto ──────────────────────────────────────────────────

export interface RiepilogoCopia {
  pazienti: number
  appuntamenti: number
  fatture: number
  profilo: string | null
}

/**
 * Conta il contenuto di una copia per mostrarlo prima di ripristinarla.
 * L'archivio è una mappa `chiave -> JSON serializzato`.
 */
export function riepilogaArchivio(mappaJson: string): RiepilogoCopia {
  const vuoto: RiepilogoCopia = { pazienti: 0, appuntamenti: 0, fatture: 0, profilo: null }

  let mappa: Record<string, unknown>
  try {
    const letto: unknown = JSON.parse(mappaJson)
    if (typeof letto !== 'object' || letto === null || Array.isArray(letto)) return vuoto
    mappa = letto as Record<string, unknown>
  } catch {
    return vuoto
  }

  const conta = (chiave: string): number => {
    const grezzo = mappa[chiave]
    if (typeof grezzo !== 'string') return 0
    try {
      const v: unknown = JSON.parse(grezzo)
      return Array.isArray(v) ? v.length : 0
    } catch {
      return 0
    }
  }

  let profilo: string | null = null
  if (typeof mappa.profilo === 'string') {
    try {
      const p = JSON.parse(mappa.profilo) as { nome?: string; cognome?: string }
      const nome = `${p?.nome ?? ''} ${p?.cognome ?? ''}`.trim()
      profilo = nome !== '' ? nome : null
    } catch {
      profilo = null
    }
  }

  return {
    pazienti: conta('pazienti'),
    appuntamenti: conta('appuntamenti'),
    fatture: conta('fatture'),
    profilo,
  }
}

export function formattaDimensione(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
