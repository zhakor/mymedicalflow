import { describe, expect, it } from 'vitest'
import { importaChiave, type Archivio } from './cifratura'
import { CloudInMemoria, type Connessione } from './memoria'
import { MotoreSincronizzazione } from './motore'
import { Fatturazione, FatturazioneOffline } from './fatturazione'
import { numeraBozze, type FatturaNumerabile } from './bozze'
import type { Rinumerazione } from './fusione'

interface Rec {
  id: string
  invoiceNumber?: string
  issueDate?: string
  createdAt?: string
  bozza?: boolean
}

const chiave = await importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i))

function dispositivo(cloud: CloudInMemoria, nome: string, opz: { iniziale?: Archivio; connessione?: Connessione } = {}) {
  let locale: Archivio = { ...(opz.iniziale ?? {}) }
  const connessione = opz.connessione ?? { online: true }
  const client = cloud.client(connessione)
  const rinumerate: Rinumerazione[] = []
  let progressivoId = 0

  const lista = (k: string): Rec[] => JSON.parse(locale[k] ?? '[]')
  const scrivi = (k: string, r: Rec[]) => {
    locale = { ...locale, [k]: JSON.stringify(r) }
  }

  const motore = new MotoreSincronizzazione({
    ...client,
    chiave,
    dispositivo: nome,
    leggiLocale: () => ({ ...locale }),
    scriviLocale: (a) => {
      locale = { ...a }
    },
    risolviConflitti: async () => new Map(),
    onEsito: (e) => {
      if (e.tipo === 'allineato') rinumerate.push(...e.rinumerate)
    },
  })

  const fatturazione = new Fatturazione({
    motore,
    bozze: {
      inSospeso: () => lista('fatture').some((f) => f.bozza),
      numera: async () => {
        const fatture = lista('fatture') as FatturaNumerabile[]
        scrivi('fatture', numeraBozze(fatture, '2026-11-26', '2026-11-26T08:00:00.000Z').fatture)
      },
    },
    onErrore: (e) => console.error('[fatturazione]', nome, e),
  })

  const d = {
    motore,
    connessione,
    rinumerate,
    smetti: () => {},
    lista,
    scrivi,
    /** Avvia l'unico ascolto del documento, condiviso da motore e fatturazione. */
    ascolta: () => {
      d.smetti = motore.ascolta(fatturazione.suCambio)
    },
    /** L'ascolto Firestore si ricollega dopo un periodo offline e riceve lo stato attuale. */
    riconnetti: () => {
      d.smetti()
      d.ascolta()
    },
    /** Salva una fattura senza numero, come fa il modulo quando il PC è offline. */
    salvaBozza: (id: string) => {
      const bozza: Rec = { id, invoiceNumber: '', issueDate: '2026-11-26', createdAt: '2026-11-26T07:30:00.000Z', bozza: true }
      d.scrivi('fatture', [...d.lista('fatture'), bozza])
    },
    /**
     * Emette una fattura col prossimo numero NUM/ANNO calcolato sui dati locali
     * e restituisce il numero DEFINITIVO, letto a fatturazione conclusa.
     * `primaDiSalvare` riceve il numero calcolato e può far attendere il salvataggio.
     */
    emetti: async (primaDiSalvare?: (numero: string) => Promise<void> | void): Promise<string> => {
      const id = `${nome}-${++progressivoId}`
      await fatturazione.usa(async () => {
        const fatture = d.lista('fatture')
        const emesse = fatture.filter((f) => !f.bozza)
        const max = Math.max(0, ...emesse.map((f) => parseInt(f.invoiceNumber!, 10)))
        const numero = `${max + 1}/2026`
        await primaDiSalvare?.(numero)
        const fattura: Rec = { id, invoiceNumber: numero, issueDate: '2026-11-25', createdAt: '2026-11-25T10:00:00.000Z' }
        d.scrivi('fatture', [...d.lista('fatture'), fattura])
      })
      return d.lista('fatture').find((f) => f.id === id)!.invoiceNumber!
    },
  }
  return d
}

async function scenario() {
  const cloud = new CloudInMemoria()
  const desktop = dispositivo(cloud, 'desktop', { iniziale: { fatture: '[]' } })
  await desktop.motore.inizializzaRemoto()
  desktop.ascolta()

  const telefono = dispositivo(cloud, 'telefono')
  await telefono.motore.collega()
  telefono.ascolta()

  /** Lascia completare notifiche e lavori in sottofondo. */
  const quiete = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2))
      await desktop.motore.inattivo()
      await telefono.motore.inattivo()
    }
  }
  await quiete()
  return { cloud, desktop, telefono, quiete }
}

const numeri = (d: { lista(k: string): Rec[] }) =>
  d
    .lista('fatture')
    .map((f) => f.invoiceNumber)
    .sort()

describe('fatturazione da più dispositivi', () => {
  it('online fatturano tutti e due senza aspettarsi, con numeri consecutivi', async () => {
    const { desktop, telefono, quiete } = await scenario()
    expect(await desktop.emetti()).toBe('1/2026')
    expect(await telefono.emetti()).toBe('2/2026')
    // Nessuna attesa: la notifica del telefono può non essere ancora arrivata,
    // ma prima di numerare il PC scarica l'ultima versione.
    expect(await desktop.emetti()).toBe('3/2026')
    await quiete()
    expect(numeri(desktop)).toEqual(['1/2026', '2/2026', '3/2026'])
    expect(numeri(telefono)).toEqual(numeri(desktop))
  })

  it('stesso numero nello stesso istante: lo tiene la fattura pubblicata per prima, l\'altra passa al successivo prima di essere mostrata', async () => {
    const { desktop, telefono, quiete } = await scenario()
    // Entrambi calcolano il numero sugli stessi dati e salvano insieme.
    const calcolati: string[] = []
    let via!: () => void
    const insieme = new Promise<void>((r) => (via = r))
    const sullaStessaBase = async (numero: string) => {
      calcolati.push(numero)
      if (calcolati.length === 2) via()
      await insieme
    }

    const definitivi = await Promise.all([desktop.emetti(sullaStessaBase), telefono.emetti(sullaStessaBase)])

    expect(calcolati).toEqual(['1/2026', '1/2026'])
    expect([...definitivi].sort()).toEqual(['1/2026', '2/2026'])
    await quiete()
    expect(numeri(desktop)).toEqual(['1/2026', '2/2026'])
    expect(numeri(telefono)).toEqual(['1/2026', '2/2026'])
  })

  it('il telefono fattura anche con il PC offline', async () => {
    const { desktop, telefono } = await scenario()
    desktop.connessione.online = false
    const prima = Date.now()
    expect(await telefono.emetti()).toBe('1/2026')
    expect(Date.now() - prima).toBeLessThan(100)
  })

  it('due fatture insieme dallo stesso dispositivo non si sovrappongono', async () => {
    const { desktop } = await scenario()
    expect(await Promise.all([desktop.emetti(), desktop.emetti()])).toEqual(['1/2026', '2/2026'])
  })

  it('offline il PC non numera: salva una bozza e la numera da solo al ritorno della rete, dopo le fatture del telefono', async () => {
    const { desktop, telefono, quiete } = await scenario()
    expect(await desktop.emetti()).toBe('1/2026')

    desktop.connessione.online = false
    await expect(desktop.emetti()).rejects.toThrow(FatturazioneOffline)
    expect(desktop.lista('fatture')).toHaveLength(1)
    desktop.salvaBozza('b1')

    expect(await telefono.emetti()).toBe('2/2026')
    expect(await telefono.emetti()).toBe('3/2026')

    desktop.connessione.online = true
    desktop.riconnetti()
    await quiete()

    const numerata = desktop.lista('fatture').find((f) => f.id === 'b1')!
    expect(numerata.invoiceNumber).toBe('4/2026')
    expect(numerata.bozza).toBeUndefined()
    expect(desktop.motore.inAttesa).toBe(false)
    expect(numeri(telefono)).toEqual(['1/2026', '2/2026', '3/2026', '4/2026'])
  })

  it('se il telefono fattura mentre il PC si ricollega con una bozza, i numeri restano unici e consecutivi', async () => {
    const { desktop, telefono, quiete } = await scenario()
    desktop.connessione.online = false
    desktop.salvaBozza('b1')

    desktop.connessione.online = true
    desktop.riconnetti()
    const delTelefono = await telefono.emetti()
    await quiete()

    expect(numeri(desktop)).toEqual(['1/2026', '2/2026'])
    expect(['1/2026', '2/2026']).toContain(delTelefono)
    expect(desktop.lista('fatture').some((f) => f.bozza)).toBe(false)
    expect(numeri(telefono)).toEqual(numeri(desktop))
  })

  it('se la rete cade fra salvataggio e pubblicazione, al ritorno la fattura passa al primo numero libero e lo segnala', async () => {
    const { desktop, telefono, quiete } = await scenario()
    expect(
      await desktop.emetti(() => {
        desktop.connessione.online = false
      }),
    ).toBe('1/2026')
    expect(desktop.motore.inAttesa).toBe(true)

    // Il telefono non può vederla e usa lo stesso numero: sul cloud arriva prima lui.
    expect(await telefono.emetti()).toBe('1/2026')

    desktop.connessione.online = true
    await desktop.motore.sincronizza()
    await quiete()

    expect(desktop.rinumerate).toEqual([{ id: 'desktop-1', da: '1/2026', a: '2/2026' }])
    expect(numeri(desktop)).toEqual(['1/2026', '2/2026'])
    expect(numeri(telefono)).toEqual(['1/2026', '2/2026'])
  })
})

describe('consumi Firestore', () => {
  const azzera = (cloud: CloudInMemoria) => {
    cloud.consumo.letture = 0
    cloud.consumo.scritture = 0
  }

  it('sincronizzare senza modifiche non costa nulla', async () => {
    const { cloud, desktop, telefono } = await scenario()
    azzera(cloud)
    for (let i = 0; i < 5; i++) {
      await desktop.motore.sincronizza()
      await telefono.motore.sincronizza()
    }
    expect(cloud.consumo).toEqual({ letture: 0, scritture: 0 })
  })

  it('ogni salvataggio costa 1 scrittura e 1 lettura, più 1 lettura per dispositivo collegato', async () => {
    const { cloud, desktop, telefono, quiete } = await scenario()
    azzera(cloud)
    for (let i = 0; i < 10; i++) {
      desktop.scrivi('pazienti', [...desktop.lista('pazienti'), { id: `p${i}` }])
      await desktop.motore.sincronizza()
      await quiete()
    }
    expect(telefono.lista('pazienti')).toHaveLength(10)
    expect(cloud.consumo).toEqual({ letture: 30, scritture: 10 })
  })

  it('una fattura dal telefono con il PC acceso costa 1 scrittura e 4 letture', async () => {
    const { cloud, telefono, quiete } = await scenario()
    azzera(cloud)
    await telefono.emetti()
    await quiete()
    // lettura fresca prima del numero, pubblicazione (transazione), una notifica per dispositivo
    expect(cloud.consumo).toEqual({ letture: 4, scritture: 1 })
  })
})
