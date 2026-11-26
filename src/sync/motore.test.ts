import { describe, expect, it } from 'vitest'
import { decifraArchivio, importaChiave, type Archivio } from './cifratura'
import { idConflitto, type Conflitto, type Scelta } from './fusione'
import { CloudInMemoria, type Connessione } from './memoria'
import { MotoreSincronizzazione } from './motore'

interface Rec {
  id: string
  nome?: string
  invoiceNumber?: string
}

const chiave = await importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i))

/** Un dispositivo con il proprio archivio locale e la propria connessione. */
function dispositivo(cloud: CloudInMemoria, nome: string, iniziale: Archivio = {}) {
  let locale: Archivio = { ...iniziale }
  const connessione: Connessione = { online: true }
  const conflittiVisti: Conflitto[][] = []
  let scelta: Scelta = 'remoto'
  let durantiIConflitti: (() => void) | null = null

  const motore = new MotoreSincronizzazione({
    ...cloud.client(connessione),
    chiave,
    dispositivo: nome,
    leggiLocale: () => ({ ...locale }),
    scriviLocale: (a) => {
      locale = { ...a }
    },
    risolviConflitti: async (c) => {
      conflittiVisti.push(c)
      durantiIConflitti?.()
      return new Map(c.map((x) => [idConflitto(x), scelta]))
    },
  })

  return {
    motore,
    connessione,
    conflittiVisti,
    lista: (k: string): Rec[] => JSON.parse(locale[k] ?? '[]'),
    scrivi: (k: string, r: Rec[]) => {
      locale = { ...locale, [k]: JSON.stringify(r) }
    },
    scegli: (s: Scelta) => {
      scelta = s
    },
    mentreRisolvi: (f: () => void) => {
      durantiIConflitti = f
    },
  }
}

async function remoto(cloud: CloudInMemoria): Promise<Archivio> {
  return decifraArchivio(cloud.file.get(cloud.puntatore!.fileId)!, chiave)
}

const listaRemota = async (cloud: CloudInMemoria, k: string): Promise<Rec[]> =>
  JSON.parse((await remoto(cloud))[k] ?? '[]')

/** Desktop con due pazienti già pubblicati e mobile collegato. */
async function scenario() {
  const cloud = new CloudInMemoria()
  const desktop = dispositivo(cloud, 'desktop', {
    pazienti: JSON.stringify([{ id: 'p1', nome: 'Rossi' }, { id: 'p2', nome: 'Bianchi' }]),
  })
  await desktop.motore.inizializzaRemoto()
  const mobile = dispositivo(cloud, 'mobile')
  await mobile.motore.collega()
  return { cloud, desktop, mobile }
}

const notifiche = () => new Promise((r) => setTimeout(r, 0))

describe('configurazione', () => {
  it('il desktop pubblica la revisione 1 e il mobile la riceve', async () => {
    const { cloud, mobile } = await scenario()
    expect(cloud.puntatore).toMatchObject({ revisione: 1, dispositivo: 'desktop' })
    expect(mobile.lista('pazienti').map((p) => p.nome)).toEqual(['Rossi', 'Bianchi'])
    expect(mobile.motore.revisione).toBe(1)
  })

  it('non crea un secondo archivio e non collega se non ne esiste uno', async () => {
    const { cloud } = await scenario()
    await expect(dispositivo(cloud, 'altro').motore.inizializzaRemoto()).rejects.toThrow('Esiste già')
    expect(cloud.file.size).toBe(1)
    await expect(dispositivo(new CloudInMemoria(), 'x').motore.collega()).rejects.toThrow('Nessun archivio')
  })
})

describe('tempo reale', () => {
  it('una modifica sul mobile arriva al desktop con la notifica', async () => {
    const { desktop, mobile } = await scenario()
    const smetti = desktop.motore.ascolta()

    mobile.scrivi('pazienti', [...mobile.lista('pazienti'), { id: 'p3', nome: 'Verdi' }])
    const esito = await mobile.motore.sincronizza()
    expect(esito).toMatchObject({ tipo: 'allineato', revisione: 2, pubblicato: true })

    await notifiche()
    await desktop.motore.inattivo()
    expect(desktop.lista('pazienti').map((p) => p.nome)).toEqual(['Rossi', 'Bianchi', 'Verdi'])
    expect(desktop.motore.revisione).toBe(2)
    smetti()
  })

  it('senza modifiche non pubblica nulla', async () => {
    const { cloud, desktop } = await scenario()
    expect(await desktop.motore.sincronizza()).toMatchObject({ pubblicato: false, revisione: 1 })
    expect(cloud.file.size).toBe(1)
  })
})

describe('desktop offline', () => {
  it('accumula le modifiche e le fonde con quelle del mobile al ritorno della rete', async () => {
    const { cloud, desktop, mobile } = await scenario()

    desktop.connessione.online = false
    desktop.scrivi('pazienti', [{ id: 'p1', nome: 'Rossi Mario' }, { id: 'p2', nome: 'Bianchi' }])
    expect(await desktop.motore.sincronizza()).toMatchObject({ tipo: 'offline' })
    expect(desktop.motore.inAttesa).toBe(true)

    mobile.scrivi('pazienti', [{ id: 'p1', nome: 'Rossi' }])
    await mobile.motore.sincronizza()

    desktop.connessione.online = true
    expect(await desktop.motore.sincronizza()).toMatchObject({ revisione: 3, pubblicato: true })
    expect(desktop.conflittiVisti).toEqual([])
    // p2 eliminato dal mobile, p1 modificato dal desktop: valgono entrambi.
    expect(await listaRemota(cloud, 'pazienti')).toEqual([{ id: 'p1', nome: 'Rossi Mario' }])
    expect(desktop.motore.inAttesa).toBe(false)
  })

  it('le operazioni delicate richiedono la connessione', async () => {
    const { desktop } = await scenario()
    desktop.connessione.online = false
    await expect(desktop.motore.allineaPerOperazioneDelicata()).rejects.toThrow('Serve la connessione')
  })
})

describe('conflitti', () => {
  async function stessoPaziente() {
    const s = await scenario()
    s.mobile.scrivi('pazienti', [{ id: 'p1', nome: 'Rossi Marco' }, { id: 'p2', nome: 'Bianchi' }])
    await s.mobile.motore.sincronizza()
    s.desktop.scrivi('pazienti', [{ id: 'p1', nome: 'Rossi Mario' }, { id: 'p2', nome: 'Bianchi' }])
    return s
  }

  it('chiede all\'utente e, se sceglie di sovrascrivere, pubblica la sua versione', async () => {
    const { cloud, desktop, mobile } = await stessoPaziente()
    desktop.scegli('locale')

    await desktop.motore.sincronizza()
    expect(desktop.conflittiVisti[0]).toEqual([
      { chiave: 'pazienti', id: 'p1', locale: { id: 'p1', nome: 'Rossi Mario' }, remoto: { id: 'p1', nome: 'Rossi Marco' } },
    ])
    expect((await listaRemota(cloud, 'pazienti'))[0].nome).toBe('Rossi Mario')

    await mobile.motore.sincronizza()
    expect(mobile.lista('pazienti')[0].nome).toBe('Rossi Mario')
  })

  it('se tiene la versione dell\'altro dispositivo non pubblica nulla', async () => {
    const { cloud, desktop } = await stessoPaziente()
    desktop.scegli('remoto')
    expect(await desktop.motore.sincronizza()).toMatchObject({ pubblicato: false, revisione: 2 })
    expect(desktop.lista('pazienti')[0].nome).toBe('Rossi Marco')
    expect(cloud.puntatore!.revisione).toBe(2)
  })

  it('conserva le modifiche fatte mentre l\'utente decide', async () => {
    const { cloud, desktop } = await stessoPaziente()
    desktop.mentreRisolvi(() => desktop.scrivi('servizi', [{ id: 's1', nome: 'Logopedia' }]))

    const esito = await desktop.motore.sincronizza()
    expect(esito).toMatchObject({ tipo: 'allineato', inAttesa: false })
    expect(desktop.lista('servizi')).toEqual([{ id: 's1', nome: 'Logopedia' }])
    expect(await listaRemota(cloud, 'servizi')).toEqual([{ id: 's1', nome: 'Logopedia' }])
  })
})

describe('scritture contemporanee', () => {
  it('due dispositivi che pubblicano insieme convergono senza perdere dati né lasciare file orfani', async () => {
    const { cloud, desktop, mobile } = await scenario()
    desktop.scrivi('pazienti', [...desktop.lista('pazienti'), { id: 'p3', nome: 'Verdi' }])
    mobile.scrivi('pazienti', [...mobile.lista('pazienti'), { id: 'p4', nome: 'Neri' }])

    await Promise.all([desktop.motore.sincronizza(), mobile.motore.sincronizza()])
    await mobile.motore.sincronizza()
    await desktop.motore.sincronizza()

    const ids = (await listaRemota(cloud, 'pazienti')).map((p) => p.id).sort()
    expect(ids).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(cloud.puntatore!.revisione).toBe(3)
    // Quattro caricamenti: il file del perdente (2-3) è finito nel cestino.
    expect([...cloud.file.keys()]).toEqual(['archivio-1-1', 'archivio-2-2', 'archivio-3-4'])
    expect(desktop.lista('pazienti')).toEqual(mobile.lista('pazienti'))
  })

  it('una risposta persa della transazione non duplica la revisione', async () => {
    const { cloud, desktop } = await scenario()
    desktop.scrivi('pazienti', [{ id: 'p1', nome: 'Rossi' }])
    desktop.connessione.perdiRispostaPubblica = true

    expect(await desktop.motore.sincronizza()).toMatchObject({ tipo: 'offline' })
    expect(await desktop.motore.sincronizza()).toMatchObject({ revisione: 2, pubblicato: false })
    expect(cloud.puntatore!.revisione).toBe(2)
    expect(desktop.motore.inAttesa).toBe(false)
  })

  it('una fattura creata offline con un numero già usato viene rinumerata', async () => {
    const { cloud, desktop, mobile } = await scenario()

    desktop.connessione.online = false
    desktop.scrivi('fatture', [{ id: 'f-desktop', invoiceNumber: '15/2026' }])
    mobile.scrivi('fatture', [{ id: 'f-mobile', invoiceNumber: '15/2026' }])
    await mobile.motore.sincronizza()

    desktop.connessione.online = true
    const esito = await desktop.motore.sincronizza()
    expect(esito).toMatchObject({ rinumerate: [{ id: 'f-desktop', da: '15/2026', a: '16/2026' }] })
    expect((await listaRemota(cloud, 'fatture')).map((f) => `${f.id}=${f.invoiceNumber}`)).toEqual([
      'f-mobile=15/2026',
      'f-desktop=16/2026',
    ])
  })
})
