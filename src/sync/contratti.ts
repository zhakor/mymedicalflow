/**
 * Ciò di cui il motore di sincronizzazione ha bisogno dal mondo esterno.
 * Implementazioni reali (Drive REST, Firestore) arrivano nella Fase 2; nei
 * test si usano quelle in memoria di `memoria.ts`.
 */

import type { Byte } from './cifratura'

/** Versione corrente dell'archivio: l'unico dato conservato su Firestore. */
export interface Puntatore {
  revisione: number
  /** File su Drive con l'archivio cifrato di questa revisione. */
  fileId: string
  dispositivo: string
  aggiornatoIl: string
}

/** Archivio dei file cifrati (Drive). Un file pubblicato non viene mai riscritto. */
export interface DepositoFile {
  /** Crea un NUOVO file e ne restituisce l'id. */
  carica(revisione: number, dati: Byte): Promise<string>
  scarica(fileId: string): Promise<Byte>
  /** Rimuove un file caricato ma mai pubblicato. */
  cestina(fileId: string): Promise<void>
}

/** Dispositivo che in questo momento può assegnare i numeri delle fatture. */
export interface Turno {
  dispositivo: string
  dal: string
}

/** Un dispositivo chiede il turno a chi lo tiene. */
export interface Richiesta {
  dispositivo: string
  il: string
}

/**
 * L'intero documento Firestore dell'utente: UN solo documento, così un solo
 * ascolto copre archivio e turno e ogni cambiamento costa una lettura per
 * dispositivo collegato.
 */
export interface StatoRegistro {
  puntatore: Puntatore | null
  turno: Turno | null
  richiesta: Richiesta | null
}

/** Registro della versione corrente e del turno (Firestore). Le operazioni di scrittura sono transazioni. */
export interface Registro {
  leggi(): Promise<StatoRegistro>
  /**
   * Pubblica `nuovo` solo se la revisione corrente è ancora `attesa`.
   * Restituisce false se un altro dispositivo è arrivato prima.
   */
  pubblica(attesa: number, nuovo: Puntatore): Promise<boolean>
  /** Notifica ogni cambio del documento. Restituisce la funzione per smettere. */
  ascolta(callback: (stato: StatoRegistro) => void): () => void

  /** Prende il turno se è libero (o è già suo). */
  prendiTurno(dispositivo: string): Promise<boolean>
  /** Se il turno è di `da`, lo passa ad `a` (null = libero) e cancella la richiesta. */
  cediTurno(da: string, a: string | null): Promise<boolean>
  /** Prende il turno se è libero, altrimenti registra la richiesta a chi lo tiene. */
  chiediTurno(dispositivo: string): Promise<'preso' | 'richiesto'>
  /** Ritira la propria richiesta rimasta senza risposta. */
  annullaRichiesta(dispositivo: string): Promise<void>
}

/** Errore di rete o di servizio non raggiungibile: le modifiche restano in coda. */
export class ErroreConnessione extends Error {
  constructor(messaggio = 'Connessione assente') {
    super(messaggio)
    this.name = 'ErroreConnessione'
  }
}
