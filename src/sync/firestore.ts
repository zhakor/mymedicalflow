/**
 * Firestore reale per il contratto `Registro` (CR §4.2): un solo documento
 * `archivi/{uid}` con il puntatore all'archivio corrente su Drive.
 *
 * Nessun dato sanitario passa di qui: solo revisione, id del file su Drive,
 * id casuale del dispositivo e orario.
 *
 * Il login (§7.1) è di chi chiama: qui arrivano l'istanza di Firestore già
 * autenticata e l'uid dell'utente.
 */

import {
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  type DocumentSnapshot,
  type Firestore,
  type FirestoreError,
} from 'firebase/firestore'
import { ErroreAccesso, ErroreConnessione, ErroreLicenza, type Registro, type StatoRegistro } from './contratti'

export interface OpzioniRegistroFirestore {
  /** L'ascolto si è interrotto (licenza revocata, accesso scaduto). */
  onErrore?: (err: Error) => void
}

const stato = (snap: DocumentSnapshot): StatoRegistro => ({
  puntatore: (snap.data()?.puntatore as StatoRegistro['puntatore'] | undefined) ?? null,
})

/**
 * Gli errori di Firestore tradotti in quelli del nucleo: rete e limiti di
 * Google si ritentano più tardi, accesso e licenza no.
 */
export function traduciErrore(err: unknown): Error {
  // Riconosciuto dal nome e non con `instanceof`: se nel bundle finiscono due
  // copie dell'SDK (per esempio ESM e CommonJS) la classe non è la stessa.
  if (!(err instanceof Error)) return new Error(String(err))
  const errore = err as FirestoreError
  if (errore.name !== 'FirebaseError' || typeof errore.code !== 'string') return err
  switch (errore.code) {
    case 'unavailable':
    case 'deadline-exceeded':
    case 'resource-exhausted':
    case 'aborted':
    case 'cancelled':
      return new ErroreConnessione(`Firestore non raggiungibile (${errore.code}).`)
    case 'unauthenticated':
      return new ErroreAccesso()
    case 'permission-denied':
      return new ErroreLicenza()
    default:
      return new Error(`Firestore: ${errore.message}`)
  }
}

async function traducendo<T>(lavoro: () => Promise<T>): Promise<T> {
  try {
    return await lavoro()
  } catch (err) {
    throw traduciErrore(err)
  }
}

export function registroFirestore(db: Firestore, uid: string, o: OpzioniRegistroFirestore = {}): Registro {
  const documento = doc(db, 'archivi', uid)

  const registro: Registro = {
    // Sempre dal server, mai dalla cache: prima di numerare una fattura serve
    // la revisione vera (§6), e senza rete deve fallire, non rispondere vecchio.
    leggi: () => traducendo(async () => stato(await getDocFromServer(documento))),

    // Una transazione: la lettura e la scrittura condizionata sono atomiche.
    // Se un altro dispositivo scrive nel frattempo Firestore la ripete, e la
    // ripetizione vede la revisione nuova e rinuncia.
    pubblica: async (attesa, nuovo) => {
      try {
        return await runTransaction(db, async (t) => {
          const corrente = stato(await t.get(documento)).puntatore
          if ((corrente?.revisione ?? 0) !== attesa) return false
          t.set(documento, { puntatore: { ...nuovo } })
          return true
        })
      } catch (err) {
        const errore = traduciErrore(err)
        if (!(errore instanceof ErroreLicenza)) throw errore
        // Le regole si valutano sul documento già aggiornato da chi ha vinto la
        // gara: la revisione `attesa + 1` non è più "+1" e il server risponde
        // "accesso negato" invece di far ripetere la transazione. Se si può
        // ancora leggere e la revisione è cambiata, è solo una gara persa.
        const corrente = (await registro.leggi()).puntatore
        if ((corrente?.revisione ?? 0) !== attesa) return false
        throw errore
      }
    },

    ascolta: (callback) =>
      onSnapshot(
        documento,
        // Con i metadati arriva anche la conferma del server dopo uno stato
        // dalla cache: quello dalla cache si scarta, perché senza rete
        // direbbe "nessun archivio" anche quando c'è.
        { includeMetadataChanges: true },
        (snap) => {
          if (!snap.metadata.fromCache) callback(stato(snap))
        },
        (err) => o.onErrore?.(traduciErrore(err)),
      ),
  }
  return registro
}
