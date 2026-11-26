/**
 * La chiave dell'archivio sul telefono (CR §9): dopo il primo inserimento del
 * codice di recupero resta in IndexedDB come `CryptoKey` NON esportabile. Il
 * browser la usa per decifrare ma nessun codice JS può rileggerne i byte, e
 * il codice di recupero non viene conservato.
 *
 * Una chiave per account Google (uid di Firebase).
 */

const DATABASE = 'mmf-mobile'
const ARCHIVIO = 'chiavi'

function apri(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(DATABASE, 1)
    richiesta.onupgradeneeded = () => richiesta.result.createObjectStore(ARCHIVIO)
    richiesta.onsuccess = () => risolvi(richiesta.result)
    richiesta.onerror = () => rifiuta(richiesta.error)
  })
}

async function operazione<T>(modo: IDBTransactionMode, lavoro: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await apri()
  try {
    return await new Promise<T>((risolvi, rifiuta) => {
      const r = lavoro(db.transaction(ARCHIVIO, modo).objectStore(ARCHIVIO))
      r.onsuccess = () => risolvi(r.result)
      r.onerror = () => rifiuta(r.error)
    })
  } finally {
    db.close()
  }
}

export async function chiaveSalvata(uid: string): Promise<CryptoKey | null> {
  try {
    const k = await operazione('readonly', (s) => s.get(uid) as IDBRequest<CryptoKey | undefined>)
    return k instanceof CryptoKey ? k : null
  } catch {
    // IndexedDB non disponibile (navigazione privata): si richiede il codice
    return null
  }
}

export async function salvaChiave(uid: string, chiave: CryptoKey): Promise<void> {
  try {
    await operazione('readwrite', (s) => s.put(chiave, uid))
  } catch {
    // Senza IndexedDB la chiave vale per questa apertura: al prossimo avvio si richiede il codice
  }
}

export async function dimenticaChiave(uid: string): Promise<void> {
  try {
    await operazione('readwrite', (s) => s.delete(uid))
  } catch {
    // Nulla da dimenticare
  }
}
