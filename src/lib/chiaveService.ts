/**
 * Stato della chiave locale che cifra l'archivio.
 *
 * La chiave è protetta con DPAPI, legata all'account Windows corrente. Se la
 * cartella dati viene copiata su un altro account o PC, DPAPI non riesce più
 * a leggerla: in quel caso serve il codice di recupero per riottenere
 * l'accesso su questo computer.
 */

import { isTauri } from './documentService'

export type StatoChiave = { tipo: 'ok' } | { tipo: 'richiedeCodiceRecupero' }

async function invoca<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Nel browser di sviluppo non c'è DPAPI: la chiave si considera sempre leggibile. */
export async function chiaveStato(): Promise<StatoChiave> {
  if (!isTauri()) return { tipo: 'ok' }
  return invoca<StatoChiave>('chiave_stato')
}

/** Ripristina l'accesso alla chiave locale a partire dal codice di recupero. */
export async function chiaveRecuperaDaCodice(codice: string): Promise<void> {
  await invoca<void>('chiave_recupera_da_codice', { codice })
}
