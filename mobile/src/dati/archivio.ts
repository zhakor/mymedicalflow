/**
 * Archivio del telefono: prende il posto di `src/lib/storageService` per i
 * servizi del desktop (alias in `vite.config.ts`), con la stessa API sincrona.
 *
 * I dati stanno SOLO in memoria: il telefono è sempre online e la fonte è
 * l'archivio cifrato su Drive. Nulla di sanitario resta nel browser.
 *
 * Due tipi di cambiamento, tenuti distinti:
 * - scrittura dell'utente (`storageService.set`): aggiorna l'interfaccia e va pubblicata;
 * - arrivo dal cloud (`impostaArchivio`): aggiorna solo l'interfaccia.
 */

import type { Archivio } from '@desktop/sync/cifratura'

const cache = new Map<string, string>()
const allaVista = new Set<() => void>()
const daPubblicare = new Set<() => void>()
let versione = 0

function cambiato(daUtente: boolean): void {
  versione++
  for (const f of allaVista) f()
  if (daUtente) for (const f of daPubblicare) f()
}

function scrivi(key: string, raw: string | null): void {
  if (raw === null) cache.delete(key)
  else cache.set(key, raw)
  cambiato(true)
}

export const storageService = {
  get<T>(key: string): T | null {
    const raw = cache.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): boolean {
    scrivi(key, JSON.stringify(value))
    return true
  },

  remove(key: string): void {
    scrivi(key, null)
  },

  clear(): void {
    cache.clear()
    cambiato(true)
  },

  getRaw(key: string): string | null {
    return cache.get(key) ?? null
  },

  setRaw(key: string, raw: string | null): void {
    scrivi(key, raw)
  },
}

export function leggiArchivio(): Archivio {
  return Object.fromEntries(cache)
}

/** Sostituisce l'archivio con quello ricevuto dal cloud. Non va ripubblicato. */
export function impostaArchivio(archivio: Archivio): void {
  cache.clear()
  for (const [k, v] of Object.entries(archivio)) cache.set(k, v)
  cambiato(false)
}

/** Per l'interfaccia: un numero che cambia a ogni modifica dei dati. */
export const versioneDati = (): number => versione

export function suCambioDati(f: () => void): () => void {
  allaVista.add(f)
  return () => allaVista.delete(f)
}

export function suModificaUtente(f: () => void): () => void {
  daPubblicare.add(f)
  return () => daPubblicare.delete(f)
}
