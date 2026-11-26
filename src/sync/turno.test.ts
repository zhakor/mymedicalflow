import { describe, expect, it } from 'vitest'
import { importaChiave, type Archivio } from './cifratura'
import { CloudInMemoria, type Connessione } from './memoria'
import { MotoreSincronizzazione } from './motore'
import { TurnoFatturazione, TurnoNonDisponibile, type Ruolo } from './turno'
import { numeraBozze, type FatturaNumerabile } from './bozze'

interface Rec {
  id: string
  nome?: string
  invoiceNumber?: string
  issueDate?: string
  createdAt?: string
  bozza?: boolean
}

const chiave = await importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i))

function dispositivo(
  cloud: CloudInMemoria,
  nome: string,
  ruolo: Ruolo,
  opz: { iniziale?: Archivio; connessione?: Connessione; tenutoAllAvvio?: boolean } = {},
) {
  let locale: Archivio = { ...(opz.iniziale ?? {}) }
  const connessione = opz.connessione ?? { online: true }
  const client = cloud.client(connessione)
  const salvato = { tenuto: opz.tenutoAllAvvio ?? false }

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
  })

  const nuovoTurno = (tenutoAllAvvio: boolean): TurnoFatturazione =>
    new TurnoFatturazione({
      registro: client.registro,
      motore,
      dispositivo: nome,
      ruolo,
      tenutoAllAvvio,
      attesaMs: 300,
      salva: (t) => {
        salvato.tenuto = t
      },
      bozze: {
        inSospeso: () => lista('fatture').some((f) => f.bozza),
        numera: async () => {
          const fatture = lista('fatture') as FatturaNumerabile[]
          scrivi('fatture', numeraBozze(fatture, '2026-11-26', '2026-11-26T08:00:00.000Z').fatture)
        },
      },
      onErrore: (e) => console.error('[turno]', nome, e),
    })

  const d = {
    motore,
    connessione,
    salvato,
    turno: nuovoTurno(salvato.tenuto),
    smetti: () => {},
    lista,
    scrivi,
    /** Avvia l'unico ascolto del documento, condiviso da motore e turno. */
    ascolta: () => {
      d.smetti = motore.ascolta(d.turno.suCambio)
    },
    /** Simula il riavvio del programma: il turno riparte dallo stato salvato. */
    riavvia: () => {
      d.smetti()
      d.turno = nuovoTurno(salvato.tenuto)
      d.ascolta()
    },
    /** L'ascolto Firestore si ricollega dopo un periodo offline e riceve lo stato attuale. */
    riconnetti: () => {
      d.smetti()
      d.ascolta()
    },
    /** Salva una fattura senza numero, come farà il modulo quando serve la verifica sul cloud. */
    salvaBozza: (id: string) => {
      const bozza: Rec = { id, invoiceNumber: '', issueDate: '2026-11-26', createdAt: '2026-11-26T07:30:00.000Z', bozza: true }
      d.scrivi('fatture', [...d.lista('fatture'), bozza])
    },
    /** Emette una fattura col prossimo numero NUM/ANNO calcolato sui dati locali. */
    emetti: () =>
      d.turno.usa(async () => {
        const fatture = d.lista('fatture')
        const emesse = fatture.filter((f) => !f.bozza)
        const max = Math.max(0, ...emesse.map((f) => parseInt(f.invoiceNumber!, 10)))
        const numero = `${max + 1}/2026`
        const fattura: Rec = {
          id: `${nome}-${max + 1}`,
          invoiceNumber: numero,
          issueDate: '2026-11-25',
          createdAt: '2026-11-25T10:00:00.000Z',
        }
        d.scrivi('fatture', [...fatture, fattura])
        return numero
      }),
  }
  return d
}

async function scenario() {
  const cloud = new CloudInMemoria()
  const desktop = dispositivo(cloud, 'desktop', 'principale', { iniziale: { fatture: '[]' } })
  await desktop.motore.inizializzaRemoto()
  desktop.ascolta()
  await desktop.turno.avvia()

  const telefono = dispositivo(cloud, 'telefono', 'ospite')
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

describe('turno di fatturazione', () => {
  it('il desktop prende il turno all\'avvio e fattura anche offline', async () => {
    const { cloud, desktop, quiete } = await scenario()
    expect(cloud.turno?.dispositivo).toBe('desktop')
    expect(desktop.salvato.tenuto).toBe(true)

    desktop.connessione.online = false
    expect(await desktop.emetti()).toBe('1/2026')
    expect(await desktop.emetti()).toBe('2/2026')

    desktop.connessione.online = true
    await desktop.motore.sincronizza()
    await quiete()
    expect(desktop.motore.inAttesa).toBe(false)
  })

  it('con il PC online il turno passa al telefono e torna indietro, con numeri consecutivi', async () => {
    const { cloud, desktop, telefono, quiete } = await scenario()

    expect(await desktop.emetti()).toBe('1/2026')
    expect(await telefono.emetti()).toBe('2/2026')
    await quiete()
    expect(cloud.turno?.dispositivo).toBe('desktop')
    expect(await desktop.emetti()).toBe('3/2026')
    await quiete()

    expect(telefono.lista('fatture').map((f) => f.invoiceNumber)).toEqual(['1/2026', '2/2026', '3/2026'])
    expect(desktop.lista('fatture')).toEqual(telefono.lista('fatture'))
  })

  it('il PC che fattura subito dopo il telefono vede già la sua fattura', async () => {
    const { desktop, telefono } = await scenario()
    expect(await desktop.emetti()).toBe('1/2026')
    expect(await telefono.emetti()).toBe('2/2026')
    // Nessuna attesa: la notifica del telefono può non essere ancora stata elaborata.
    expect(await desktop.emetti()).toBe('3/2026')
  })

  it('blocca il telefono se il PC tiene il turno ed è offline', async () => {
    const { cloud, desktop, telefono } = await scenario()
    desktop.connessione.online = false
    await desktop.emetti()

    await expect(telefono.emetti()).rejects.toThrow(TurnoNonDisponibile)
    await expect(telefono.emetti()).rejects.toMatchObject({ motivo: 'pc-non-raggiungibile' })
    expect(cloud.richiesta).toBeNull()
    expect(telefono.lista('fatture')).toEqual([])
  })

  it('a PC chiuso dopo la sincronizzazione il telefono fattura senza attendere', async () => {
    const { cloud, desktop, telefono } = await scenario()
    await desktop.emetti()
    await desktop.turno.rilascia()
    expect(cloud.turno).toBeNull()
    expect(desktop.salvato.tenuto).toBe(false)

    const prima = Date.now()
    expect(await telefono.emetti()).toBe('2/2026')
    expect(Date.now() - prima).toBeLessThan(100)
    expect(cloud.turno).toBeNull()
  })

  it('chiuso offline con fatture non caricate, il PC tiene il turno e al riavvio fattura ancora', async () => {
    const { cloud, desktop, telefono } = await scenario()
    desktop.connessione.online = false
    expect(await desktop.emetti()).toBe('1/2026')
    await desktop.turno.rilascia()
    expect(desktop.salvato.tenuto).toBe(true)
    expect(cloud.turno?.dispositivo).toBe('desktop')

    await expect(telefono.emetti()).rejects.toMatchObject({ motivo: 'pc-non-raggiungibile' })

    desktop.riavvia()
    expect(await desktop.emetti()).toBe('2/2026')
  })

  it('avviato offline dopo una chiusura normale, il PC non può sapere se il telefono ha fatturato', async () => {
    const { desktop } = await scenario()
    await desktop.turno.rilascia()
    desktop.riavvia()
    desktop.connessione.online = false
    await expect(desktop.emetti()).rejects.toMatchObject({ motivo: 'verifica-necessaria' })
  })

  it('avviato offline dopo una chiusura normale salva una bozza e la numera da solo al ritorno della rete', async () => {
    const { cloud, desktop, telefono, quiete } = await scenario()
    expect(await desktop.emetti()).toBe('1/2026')
    await desktop.turno.rilascia()
    desktop.smetti() // PC spento

    expect(await telefono.emetti()).toBe('2/2026')

    desktop.connessione.online = false
    desktop.riavvia()
    await expect(desktop.emetti()).rejects.toMatchObject({ motivo: 'verifica-necessaria' })
    desktop.salvaBozza('b1')
    await quiete()
    expect(desktop.lista('fatture').find((f) => f.id === 'b1')).toMatchObject({ bozza: true, invoiceNumber: '' })

    desktop.connessione.online = true
    desktop.riconnetti()
    await quiete()

    // Verificata sul cloud: viene dopo la fattura emessa dal telefono, non al suo posto.
    const numerata = desktop.lista('fatture').find((f) => f.id === 'b1')!
    expect(numerata.invoiceNumber).toBe('3/2026')
    expect(numerata.bozza).toBeUndefined()
    expect(desktop.motore.inAttesa).toBe(false)
    expect(cloud.turno?.dispositivo).toBe('desktop')
    expect(telefono.lista('fatture').map((f) => f.invoiceNumber)).toEqual(['1/2026', '2/2026', '3/2026'])
  })

  it('se il telefono fattura mentre il PC si ricollega con una bozza, i numeri restano unici e consecutivi', async () => {
    const { desktop, telefono, quiete } = await scenario()
    await desktop.turno.rilascia()
    desktop.smetti()
    desktop.connessione.online = false
    desktop.riavvia()
    desktop.salvaBozza('b1')

    desktop.connessione.online = true
    desktop.riconnetti()
    const delTelefono = await telefono.emetti()
    await quiete()

    const numeri = desktop.lista('fatture').map((f) => f.invoiceNumber).sort()
    expect(numeri).toEqual(['1/2026', '2/2026'])
    expect(delTelefono === '1/2026' || delTelefono === '2/2026').toBe(true)
    expect(desktop.lista('fatture').some((f) => f.bozza)).toBe(false)
    expect(telefono.lista('fatture').map((f) => f.invoiceNumber).sort()).toEqual(numeri)
  })

  it('non cede il turno mentre il PC sta emettendo una fattura', async () => {
    const { desktop, telefono, quiete } = await scenario()
    let sblocca!: () => void
    const cancello = new Promise<void>((r) => (sblocca = r))

    const delDesktop = desktop.turno.usa(async () => {
      await cancello
      desktop.scrivi('fatture', [{ id: 'desktop-1', invoiceNumber: '1/2026' }])
      return '1/2026'
    })
    const delTelefono = telefono.emetti()
    await new Promise((r) => setTimeout(r, 20))
    sblocca()

    expect(await delDesktop).toBe('1/2026')
    expect(await delTelefono).toBe('2/2026')
    await quiete()
    expect(desktop.lista('fatture').map((f) => f.invoiceNumber)).toEqual(['1/2026', '2/2026'])
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

  it('una fattura dal telefono con il PC acceso costa 5 scritture e 18 letture', async () => {
    const { cloud, telefono, quiete } = await scenario()
    azzera(cloud)
    await telefono.emetti()
    await quiete()
    // chiedi, cedi, pubblica, libera, riprendi; le letture includono le notifiche ai due dispositivi
    expect(cloud.consumo).toEqual({ letture: 18, scritture: 5 })
  })
})
