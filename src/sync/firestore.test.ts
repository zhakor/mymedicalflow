/**
 * Adattatore Firestore e regole di sicurezza contro l'emulatore ufficiale.
 * Si eseguono con `npm run test:firestore`, che avvia l'emulatore (serve
 * Java); senza emulatore `npm test` li salta.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, initializeFirestore, setDoc, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { registroFirestore } from './firestore'
import { ErroreConnessione, ErroreLicenza, type Puntatore, type StatoRegistro } from './contratti'
import { importaChiave, type Archivio } from './cifratura'
import { CloudInMemoria } from './memoria'
import { MotoreSincronizzazione } from './motore'

const EMULATORE = process.env.FIRESTORE_EMULATOR_HOST
const PROGETTO = 'demo-mmf'

const puntatore = (revisione: number, dispositivo = 'pc'): Puntatore => ({
  revisione,
  fileId: `file-${revisione}-${dispositivo}`,
  dispositivo,
  aggiornatoIl: '2026-11-26T18:00:00.000Z',
})

describe.skipIf(!EMULATORE)('Firestore (emulatore)', () => {
  let ambiente: RulesTestEnvironment
  const app: FirebaseApp[] = []
  let contatore = 0

  /** Un dispositivo collegato come l'utente indicato. */
  function client(uid: string, email = `${uid}@esempio.it`, verificata = true, irraggiungibile = false): Firestore {
    const a = initializeApp({ projectId: PROGETTO, apiKey: 'finta' }, `client-${++contatore}`)
    app.push(a)
    const db = initializeFirestore(a, {})
    const [host, porta] = EMULATORE!.split(':')
    // Irraggiungibile: una porta dove non risponde nessuno, come senza rete.
    connectFirestoreEmulator(db, host, irraggiungibile ? 1 : Number(porta), {
      mockUserToken: { user_id: uid, email, email_verified: verificata },
    })
    return db
  }

  const licenza = (email: string, dati: Record<string, unknown>) =>
    ambiente.withSecurityRulesDisabled((ctx) => ctx.firestore().collection('licenze').doc(email).set(dati))

  beforeAll(async () => {
    const [host, porta] = EMULATORE!.split(':')
    ambiente = await initializeTestEnvironment({
      projectId: PROGETTO,
      firestore: { host, port: Number(porta), rules: readFileSync('firestore.rules', 'utf8') },
    })
  })
  afterAll(() => ambiente?.cleanup())
  beforeEach(async () => {
    await ambiente.clearFirestore()
    await licenza('anna@esempio.it', { attiva: true })
  })
  afterEach(async () => {
    await Promise.all(app.splice(0).map((a) => deleteApp(a)))
  })

  describe('contratto Registro', () => {
    it('legge, pubblica la revisione 1 e rifiuta chi arriva in ritardo', async () => {
      const registro = registroFirestore(client('anna'), 'anna')
      expect(await registro.leggi()).toEqual({ puntatore: null })

      expect(await registro.pubblica(0, puntatore(1))).toBe(true)
      expect(await registro.pubblica(0, puntatore(1, 'telefono'))).toBe(false)
      expect(await registro.leggi()).toEqual({ puntatore: puntatore(1) })
    })

    it('due dispositivi che pubblicano insieme: ne vince esattamente uno', async () => {
      const pc = registroFirestore(client('anna'), 'anna')
      const telefono = registroFirestore(client('anna'), 'anna')
      await pc.pubblica(0, puntatore(1))

      const esiti = await Promise.all([pc.pubblica(1, puntatore(2, 'pc')), telefono.pubblica(1, puntatore(2, 'telefono'))])
      expect(esiti.filter(Boolean)).toHaveLength(1)
      const vincitore = esiti[0] ? 'pc' : 'telefono'
      expect((await pc.leggi()).puntatore).toEqual(puntatore(2, vincitore))
    })

    it("l'ascolto riceve lo stato attuale e poi le pubblicazioni dell'altro dispositivo", async () => {
      const pc = registroFirestore(client('anna'), 'anna')
      const telefono = registroFirestore(client('anna'), 'anna')
      await pc.pubblica(0, puntatore(1))

      const ricevuti: StatoRegistro[] = []
      const arrivato = (revisione: number) =>
        expect.poll(() => ricevuti[ricevuti.length - 1]?.puntatore?.revisione, { timeout: 5000 }).toBe(revisione)
      const smetti = telefono.ascolta((s) => ricevuti.push(s))
      await arrivato(1)
      await pc.pubblica(1, puntatore(2))
      await arrivato(2)
      smetti()
      // Mai uno stato dalla cache: nessun "puntatore: null" prima del primo vero
      expect(ricevuti.every((s) => s.puntatore !== null)).toBe(true)
    })

    it("aperto senza rete, l'ascolto tace invece di dire \"nessun archivio\"", async () => {
      const ricevuti: StatoRegistro[] = []
      const smetti = registroFirestore(client('anna', undefined, true, true), 'anna').ascolta((s) => ricevuti.push(s))
      await new Promise((r) => setTimeout(r, 12_000))
      smetti()
      expect(ricevuti).toEqual([])
    }, 30_000)

    it('il motore di sincronizzazione funziona sopra Firestore reale', async () => {
      const chiave = await importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i))
      const { deposito } = new CloudInMemoria().client()
      const dispositivo = (nome: string, iniziale: Archivio) => {
        let locale = { ...iniziale }
        const motore = new MotoreSincronizzazione({
          deposito,
          registro: registroFirestore(client('anna'), 'anna'),
          chiave,
          dispositivo: nome,
          leggiLocale: () => ({ ...locale }),
          scriviLocale: (a) => {
            locale = { ...a }
          },
          risolviConflitti: async () => new Map(),
        })
        return { motore, leggi: () => locale, scrivi: (a: Archivio) => (locale = a) }
      }

      const pc = dispositivo('pc', { pazienti: '[{"id":"p1","updatedAt":"1"}]' })
      await pc.motore.inizializzaRemoto()
      const telefono = dispositivo('telefono', {})
      await telefono.motore.collega()
      expect(telefono.leggi()).toEqual(pc.leggi())

      telefono.scrivi({ pazienti: '[{"id":"p1","updatedAt":"1"},{"id":"p2","updatedAt":"2"}]' })
      expect(await telefono.motore.sincronizza()).toMatchObject({ tipo: 'allineato', revisione: 2, pubblicato: true })
      await pc.motore.sincronizza({ fresco: true })
      expect(JSON.parse(pc.leggi().pazienti)).toHaveLength(2)
    })

    it('senza rete la lettura e la pubblicazione falliscono come connessione assente', async () => {
      const registro = registroFirestore(client('anna', undefined, true, true), 'anna')
      await expect(registro.leggi()).rejects.toThrow(ErroreConnessione)
      await expect(registro.pubblica(0, puntatore(1))).rejects.toThrow(ErroreConnessione)
    }, 60_000)
  })

  describe('regole di sicurezza', () => {
    it('senza licenza, con licenza disattivata o scaduta: ErroreLicenza', async () => {
      await licenza('bruno@esempio.it', { attiva: false })
      await licenza('carla@esempio.it', { attiva: true, scadenza: new Date('2026-01-01') })
      await licenza('dario@esempio.it', { attiva: true, scadenza: new Date('2099-01-01') })

      for (const uid of ['ezio', 'bruno', 'carla']) {
        const registro = registroFirestore(client(uid), uid)
        await expect(registro.leggi()).rejects.toThrow(ErroreLicenza)
        await expect(registro.pubblica(0, puntatore(1))).rejects.toThrow(ErroreLicenza)
      }
      expect(await registroFirestore(client('dario'), 'dario').pubblica(0, puntatore(1))).toBe(true)
    })

    it('email non verificata: nessun accesso', async () => {
      const registro = registroFirestore(client('anna', 'anna@esempio.it', false), 'anna')
      await expect(registro.leggi()).rejects.toThrow(ErroreLicenza)
    })

    it("nessuno legge o scrive il documento di un altro utente", async () => {
      await registroFirestore(client('anna'), 'anna').pubblica(0, puntatore(1))
      await licenza('bruno@esempio.it', { attiva: true })
      const intruso = registroFirestore(client('bruno'), 'anna')
      await expect(intruso.leggi()).rejects.toThrow(ErroreLicenza)
      await expect(intruso.pubblica(1, puntatore(2))).rejects.toThrow(ErroreLicenza)
    })

    it('la revisione avanza solo di uno, i campi sono quelli previsti e il documento non si cancella', async () => {
      const db = client('anna')
      const documento = doc(db, 'archivi', 'anna')
      await expect(setDoc(documento, { puntatore: puntatore(5) })).rejects.toThrow()
      await setDoc(documento, { puntatore: puntatore(1) })

      await expect(setDoc(documento, { puntatore: puntatore(3) })).rejects.toThrow()
      await expect(setDoc(documento, { puntatore: puntatore(1) })).rejects.toThrow()
      await expect(setDoc(documento, { puntatore: puntatore(2), pazienti: 'no' })).rejects.toThrow()
      await expect(setDoc(documento, { puntatore: { ...puntatore(2), nome: 'Mario Rossi' } })).rejects.toThrow()
      await expect(deleteDoc(documento)).rejects.toThrow()
      await setDoc(documento, { puntatore: puntatore(2) })
    })

    it('ognuno legge solo la propria licenza e nessuno la modifica', async () => {
      const db = client('anna')
      expect((await getDoc(doc(db, 'licenze', 'anna@esempio.it'))).data()).toEqual({ attiva: true })
      await licenza('bruno@esempio.it', { attiva: true })
      await expect(getDoc(doc(db, 'licenze', 'bruno@esempio.it'))).rejects.toThrow()
      await expect(setDoc(doc(db, 'licenze', 'anna@esempio.it'), { attiva: true, scadenza: null })).rejects.toThrow()
    })
  })
})
