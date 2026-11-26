import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  chiaveInCodice,
  cifra,
  cifraArchivio,
  codiceInChiave,
  decifra,
  decifraArchivio,
  importaChiave,
} from './cifratura'

const BYTE_CHIAVE = Uint8Array.from({ length: 32 }, (_, i) => i)
const CODICE = 'AAAT-EA2E-AYDA-RCAK-BJFT-2DJR-B6JB-CETX-CTMV-PF22-DEQB-0HA7-D2ST'

/** Prodotto da `crypto::cifra` in Rust con la chiave 0..31 (testo: {"fatture":"[]"}). */
const DAL_DESKTOP =
  '4d4d463201ce8463489646c4e47ff94b977d5d1cd1f9835912e1257597f1c4a0cf23b77b9b4c4dbfdc650bd7a5e54b4495'

const daEsadecimale = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'))
const testo = (s: string) => new TextEncoder().encode(s)

describe('codice di recupero', () => {
  it('coincide con quello mostrato dal desktop', () => {
    expect(chiaveInCodice(BYTE_CHIAVE)).toBe(CODICE)
    expect(codiceInChiave(CODICE)).toEqual(BYTE_CHIAVE)
  })

  it('accetta il codice trascritto con spazi e minuscole', () => {
    expect(codiceInChiave(`  ${CODICE.toLowerCase().replace(/-/g, ' ')} `)).toEqual(BYTE_CHIAVE)
  })

  it('rifiuta codici incompleti o con caratteri ambigui', () => {
    expect(() => codiceInChiave(CODICE.slice(0, -5))).toThrow('non è completo')
    expect(() => codiceInChiave(CODICE.replace('A', 'O'))).toThrow('carattere non valido')
  })

  it('torna alla chiave di partenza per chiavi casuali', () => {
    for (let i = 0; i < 50; i++) {
      const k = Uint8Array.from(randomBytes(32))
      expect(codiceInChiave(chiaveInCodice(k))).toEqual(k)
    }
  })
})

describe('formato MMF2', () => {
  it('legge un archivio cifrato dal desktop', async () => {
    const chiave = await importaChiave(codiceInChiave(CODICE))
    expect(await decifraArchivio(daEsadecimale(DAL_DESKTOP), chiave)).toEqual({ fatture: '[]' })
  })

  it('produce file leggibili da un AES-256-GCM indipendente (node:crypto)', async () => {
    const chiave = await importaChiave(BYTE_CHIAVE)
    const raw = await cifra(testo('dati riservati'), chiave)

    expect(Buffer.from(raw.subarray(0, 5))).toEqual(Buffer.from([0x4d, 0x4d, 0x46, 0x32, 1]))
    const nonce = raw.subarray(5, 17)
    const tag = raw.subarray(raw.length - 16)
    const d = createDecipheriv('aes-256-gcm', BYTE_CHIAVE, nonce)
    d.setAuthTag(tag)
    const chiaro = Buffer.concat([d.update(raw.subarray(17, raw.length - 16)), d.final()])
    expect(chiaro.toString()).toBe('dati riservati')
  })

  it('legge file scritti da un AES-256-GCM indipendente (node:crypto)', async () => {
    const nonce = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', BYTE_CHIAVE, nonce)
    const corpo = Buffer.concat([c.update('ciao'), c.final(), c.getAuthTag()])
    const raw = Uint8Array.from(Buffer.concat([Buffer.from('MMF2'), Buffer.from([1]), nonce, corpo]))

    const chiaro = await decifra(raw, await importaChiave(BYTE_CHIAVE))
    expect(new TextDecoder().decode(chiaro)).toBe('ciao')
  })

  it('rifiuta chiave sbagliata, file manomessi e formati sconosciuti', async () => {
    const chiave = await importaChiave(BYTE_CHIAVE)
    const raw = await cifraArchivio({ pazienti: '[]' }, chiave)

    const altra = await importaChiave(Uint8Array.from(randomBytes(32)))
    await expect(decifra(raw, altra)).rejects.toThrow('codice di recupero errato')

    const manomesso = raw.slice()
    manomesso[manomesso.length - 1] ^= 0xff
    await expect(decifra(manomesso, chiave)).rejects.toThrow('codice di recupero errato')

    const futuro = raw.slice()
    futuro[4] = 2
    await expect(decifra(futuro, chiave)).rejects.toThrow('versione più recente')

    await expect(decifra(testo('PK\u0003\u0004'), chiave)).rejects.toThrow('non riconosciuto')
  })

  it('cifra due volte lo stesso archivio in modo diverso', async () => {
    const chiave = await importaChiave(BYTE_CHIAVE)
    const a = await cifraArchivio({ x: '1' }, chiave)
    const b = await cifraArchivio({ x: '1' }, chiave)
    expect(a).not.toEqual(b)
    expect(await decifraArchivio(a, chiave)).toEqual(await decifraArchivio(b, chiave))
  })
})
