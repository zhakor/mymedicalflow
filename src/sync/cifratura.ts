/**
 * Cifratura dell'archivio con la WebCrypto del browser, compatibile byte per
 * byte con `src-tauri/src/crypto.rs`.
 *
 * Formato: "MMF2" | versione (1) | nonce (12 byte) | testo cifrato AES-256-GCM
 * con il tag di 16 byte in coda, senza dati aggiuntivi autenticati.
 * Un file in questo formato è anche una copia `.mmfbak` valida.
 *
 * La chiave è quella dell'installazione desktop: il mobile la ottiene dal
 * codice di recupero inserito dall'utente.
 */

const MAGIC = [0x4d, 0x4d, 0x46, 0x32] // "MMF2"
const VERSIONE = 1
const HEADER_LEN = 5
const NONCE_LEN = 12
const CHIAVE_LEN = 32

/** Stesso alfabeto del codice di recupero in Rust: niente I, L, O, U. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'

/** Byte su un ArrayBuffer normale: è ciò che la WebCrypto accetta. */
export type Byte = Uint8Array<ArrayBuffer>

/** Archivio in chiaro: chiave logica → valore JSON serializzato (come `storageService`). */
export type Archivio = Record<string, string>

/** Converte il codice di recupero nei 32 byte della chiave. Tollera spazi, trattini e minuscole. */
export function codiceInChiave(codice: string): Byte {
  let bit = 0
  let disponibili = 0
  const byte: number[] = []

  for (const c of codice) {
    if (c === '-' || /\s/.test(c)) continue
    const valore = ALFABETO.indexOf(c.toUpperCase())
    if (valore < 0) throw new Error(`il codice contiene un carattere non valido: '${c}'`)
    bit = ((bit << 5) | valore) & 0xffff
    disponibili += 5
    if (disponibili >= 8) {
      disponibili -= 8
      byte.push((bit >> disponibili) & 0xff)
    }
  }

  if (byte.length !== CHIAVE_LEN) {
    throw new Error('il codice di recupero non è completo')
  }
  return new Uint8Array(byte)
}

/** Inverso di `codiceInChiave`, nello stesso formato a gruppi di 4 mostrato dal desktop. */
export function chiaveInCodice(chiave: Uint8Array): string {
  let bit = 0
  let disponibili = 0
  let caratteri = ''
  for (const b of chiave) {
    bit = ((bit << 8) | b) & 0xffff
    disponibili += 8
    while (disponibili >= 5) {
      disponibili -= 5
      caratteri += ALFABETO[(bit >> disponibili) & 0x1f]
    }
  }
  if (disponibili > 0) caratteri += ALFABETO[(bit << (5 - disponibili)) & 0x1f]
  return caratteri.match(/.{1,4}/g)!.join('-')
}

/** Chiave non esportabile: una volta importata non si può rileggere dal codice JS. */
export function importaChiave(chiave: Byte): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', chiave, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function cifra(chiaro: Byte, chiave: CryptoKey): Promise<Byte> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
  const testo = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chiave, chiaro),
  )
  const out = new Uint8Array(HEADER_LEN + NONCE_LEN + testo.length)
  out.set(MAGIC, 0)
  out[4] = VERSIONE
  out.set(nonce, HEADER_LEN)
  out.set(testo, HEADER_LEN + NONCE_LEN)
  return out
}

/** La chiave non apre il file (o il file è stato alterato): AES-GCM non lo distingue. */
export class ChiaveErrata extends Error {
  constructor() {
    super('codice di recupero errato oppure file danneggiato')
    this.name = 'ChiaveErrata'
  }
}

export async function decifra(raw: Byte, chiave: CryptoKey): Promise<Byte> {
  if (raw.length < HEADER_LEN || MAGIC.some((b, i) => raw[i] !== b)) {
    throw new Error('file non riconosciuto: non è un backup di MyMedicalFlow')
  }
  if (raw[4] !== VERSIONE) {
    throw new Error(`file creato con una versione più recente dell'app (formato ${raw[4]})`)
  }
  if (raw.length <= HEADER_LEN + NONCE_LEN) throw new Error('file danneggiato o incompleto')

  const nonce = raw.subarray(HEADER_LEN, HEADER_LEN + NONCE_LEN)
  const testo = raw.subarray(HEADER_LEN + NONCE_LEN)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, chiave, testo))
  } catch {
    throw new ChiaveErrata()
  }
}

/** Serializza come `storageService` (`JSON.stringify` della mappa) e cifra. */
export function cifraArchivio(archivio: Archivio, chiave: CryptoKey): Promise<Byte> {
  return cifra(new TextEncoder().encode(JSON.stringify(archivio)), chiave)
}

export async function decifraArchivio(raw: Byte, chiave: CryptoKey): Promise<Archivio> {
  const letto: unknown = JSON.parse(new TextDecoder().decode(await decifra(raw, chiave)))
  if (typeof letto !== 'object' || letto === null || Array.isArray(letto)) {
    throw new Error("l'archivio non contiene dati validi")
  }
  const archivio: Archivio = {}
  for (const [k, v] of Object.entries(letto)) if (typeof v === 'string') archivio[k] = v
  return archivio
}
