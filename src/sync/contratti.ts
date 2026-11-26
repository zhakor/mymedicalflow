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

/** Il modello Word delle fatture cartacee. */
export interface FileModello {
  nomeFile: string
  dati: Byte
}

/**
 * Il modello Word su Drive, IN CHIARO in `template/` (CR §4.1). Lo carica il
 * PC alla configurazione (§8), estraendolo dalle impostazioni; il telefono lo
 * scarica per generare le fatture cartacee. Non contiene dati di pazienti.
 */
export interface DepositoModello {
  /** Sostituisce il modello su Drive. */
  carica(modello: FileModello): Promise<void>
  /** null se il PC non ha caricato nessun modello. */
  scarica(): Promise<FileModello | null>
}

/**
 * L'intero documento Firestore dell'utente: UN solo documento, così un solo
 * ascolto basta a tutto e ogni cambiamento costa una lettura per dispositivo
 * collegato.
 */
export interface StatoRegistro {
  puntatore: Puntatore | null
}

/** Registro della versione corrente (Firestore). La pubblicazione è una transazione. */
export interface Registro {
  leggi(): Promise<StatoRegistro>
  /**
   * Pubblica `nuovo` solo se la revisione corrente è ancora `attesa`.
   * Restituisce false se un altro dispositivo è arrivato prima.
   */
  pubblica(attesa: number, nuovo: Puntatore): Promise<boolean>
  /** Notifica ogni cambio del documento. Restituisce la funzione per smettere. */
  ascolta(callback: (stato: StatoRegistro) => void): () => void
}

/** Errore di rete o di servizio non raggiungibile: le modifiche restano in coda. */
export class ErroreConnessione extends Error {
  constructor(messaggio = 'Connessione assente') {
    super(messaggio)
    this.name = 'ErroreConnessione'
  }
}
