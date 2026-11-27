import { describe, expect, it } from 'vitest'
import type { Archivio } from './cifratura'
import { fondi, idConflitto, rinumeraFattureDuplicate } from './fusione'

interface Rec {
  id: string
  nome?: string
  invoiceNumber?: string
  updatedAt?: string
  bozza?: boolean
}

const arr = (...r: Rec[]) => JSON.stringify(r)
const lista = (a: Archivio, k: string) => JSON.parse(a[k]) as Rec[]

const BASE: Archivio = {
  pazienti: arr({ id: 'p1', nome: 'Rossi' }, { id: 'p2', nome: 'Bianchi' }),
  profilo: JSON.stringify({ nome: 'Anna' }),
}

describe('fusione a tre vie', () => {
  it('tiene le modifiche di entrambi su record diversi', () => {
    const locale = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi M.' }, { id: 'p2', nome: 'Bianchi' }) }
    const remoto = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi' }, { id: 'p2', nome: 'Bianchi L.' }) }

    const { archivio, conflitti } = fondi(BASE, locale, remoto)
    expect(conflitti).toEqual([])
    expect(lista(archivio, 'pazienti')).toEqual([
      { id: 'p1', nome: 'Rossi M.' },
      { id: 'p2', nome: 'Bianchi L.' },
    ])
  })

  it('unisce i record nuovi creati sui due dispositivi', () => {
    const locale = { ...BASE, pazienti: arr(...lista(BASE, 'pazienti'), { id: 'p3', nome: 'Verdi' }) }
    const remoto = { ...BASE, pazienti: arr(...lista(BASE, 'pazienti'), { id: 'p4', nome: 'Neri' }) }

    const { archivio } = fondi(BASE, locale, remoto)
    expect(lista(archivio, 'pazienti').map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p3'])
  })

  it('applica una cancellazione fatta su un solo dispositivo', () => {
    const locale = { ...BASE, pazienti: arr({ id: 'p2', nome: 'Bianchi' }) }
    const remoto = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi' }, { id: 'p2', nome: 'Bianchi' }, { id: 'p5' }) }

    const { archivio, conflitti } = fondi(BASE, locale, remoto)
    expect(conflitti).toEqual([])
    expect(lista(archivio, 'pazienti').map((p) => p.id)).toEqual(['p2', 'p5'])
  })

  it('segnala il conflitto sullo stesso record e di default tiene il remoto', () => {
    const locale = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi Mario' }, { id: 'p2', nome: 'Bianchi' }) }
    const remoto = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi Marco' }, { id: 'p2', nome: 'Bianchi' }) }

    const { archivio, conflitti } = fondi(BASE, locale, remoto)
    expect(conflitti).toEqual([
      { chiave: 'pazienti', id: 'p1', locale: { id: 'p1', nome: 'Rossi Mario' }, remoto: { id: 'p1', nome: 'Rossi Marco' } },
    ])
    expect(lista(archivio, 'pazienti')[0].nome).toBe('Rossi Marco')

    const scelte = new Map([[idConflitto(conflitti[0]), 'locale' as const]])
    expect(lista(fondi(BASE, locale, remoto, scelte).archivio, 'pazienti')[0].nome).toBe('Rossi Mario')
  })

  it('modifica da una parte e cancellazione dall\'altra sono un conflitto', () => {
    const locale = { ...BASE, pazienti: arr({ id: 'p1', nome: 'Rossi M.' }, { id: 'p2', nome: 'Bianchi' }) }
    const remoto = { ...BASE, pazienti: arr({ id: 'p2', nome: 'Bianchi' }, { id: 'p9' }) }

    const { conflitti } = fondi(BASE, locale, remoto)
    expect(conflitti).toHaveLength(1)
    expect(conflitti[0]).toMatchObject({ id: 'p1', remoto: null })
  })

  it('la stessa modifica fatta su entrambi non è un conflitto', () => {
    const uguale = { ...BASE, pazienti: arr({ id: 'p1', nome: 'X' }, { id: 'p2', nome: 'Bianchi' }), profilo: '{"nome":"B"}' }
    const remoto = { ...uguale, pazienti: arr({ id: 'p1', nome: 'X' }, { id: 'p2', nome: 'Bianchi' }, { id: 'p7' }) }
    expect(fondi(BASE, uguale, remoto).conflitti).toEqual([])
  })

  it('tratta profilo e impostazioni come un unico record', () => {
    const locale = { ...BASE, profilo: JSON.stringify({ nome: 'Anna M.' }) }
    const remoto = { ...BASE, profilo: JSON.stringify({ nome: 'Anna R.' }) }
    const { conflitti } = fondi(BASE, locale, remoto)
    expect(conflitti).toEqual([{ chiave: 'profilo', id: null, locale: { nome: 'Anna M.' }, remoto: { nome: 'Anna R.' } }])
  })

  it('gestisce chiavi presenti solo da una parte', () => {
    const locale = { ...BASE, servizi: arr({ id: 's1' }) }
    const remoto = { ...BASE, fatture: arr({ id: 'f1' }) }
    const { archivio } = fondi(BASE, locale, remoto)
    expect(Object.keys(archivio).sort()).toEqual(['fatture', 'pazienti', 'profilo', 'servizi'])
  })
})

describe('fatture con lo stesso numero', () => {
  const adesso = () => '2026-11-25T10:00:00.000Z'

  it('rinumera la fattura nata qui e tiene quella già pubblicata', () => {
    const remoto: Archivio = { fatture: arr({ id: 'a', invoiceNumber: '14/2026' }, { id: 'b', invoiceNumber: '15/2026' }) }
    const fuso: Archivio = {
      fatture: arr(
        { id: 'a', invoiceNumber: '14/2026' },
        { id: 'b', invoiceNumber: '15/2026' },
        { id: 'c', invoiceNumber: '15/2026' },
      ),
    }

    const { archivio, rinumerate } = rinumeraFattureDuplicate(fuso, remoto, adesso)
    expect(rinumerate).toEqual([{ id: 'c', da: '15/2026', a: '16/2026' }])
    expect(lista(archivio, 'fatture')[2]).toEqual({ id: 'c', invoiceNumber: '16/2026', updatedAt: adesso() })
  })

  it('assegna numeri distinti a più fatture doppie dello stesso anno', () => {
    const remoto: Archivio = { fatture: arr({ id: 'a', invoiceNumber: '9/2026' }, { id: 'b', invoiceNumber: '10/2026' }) }
    const fuso: Archivio = {
      fatture: arr(
        { id: 'a', invoiceNumber: '9/2026' },
        { id: 'b', invoiceNumber: '10/2026' },
        { id: 'c', invoiceNumber: '9/2026' },
        { id: 'd', invoiceNumber: '10/2026' },
      ),
    }
    const { rinumerate } = rinumeraFattureDuplicate(fuso, remoto, adesso)
    expect(rinumerate.map((r) => r.a)).toEqual(['11/2026', '12/2026'])
  })

  it('ignora le bozze del PC: niente buchi nella serie e nessuna bozza rinumerata (caso del 26/11)', () => {
    // PC offline: elettronica 5 salvata ma non pubblicata, cartacea bozza 6 provvisoria.
    // Intanto il telefono ha pubblicato la sua 5.
    const remoto: Archivio = { fatture: arr({ id: 'tel', invoiceNumber: '5/2026' }) }
    const fuso: Archivio = {
      fatture: arr(
        { id: 'tel', invoiceNumber: '5/2026' },
        { id: 'pc-e', invoiceNumber: '5/2026' },
        { id: 'pc-bozza', invoiceNumber: '6/2026', bozza: true },
        { id: 'pc-bozza-2', invoiceNumber: '5/2026', bozza: true },
      ),
    }
    const { archivio, rinumerate } = rinumeraFattureDuplicate(fuso, remoto, adesso)
    expect(rinumerate).toEqual([{ id: 'pc-e', da: '5/2026', a: '6/2026' }])
    const bozze = lista(archivio, 'fatture').filter((f) => f.bozza)
    expect(bozze.map((f) => f.invoiceNumber)).toEqual(['6/2026', '5/2026'])
  })

  it('non tocca nulla senza doppioni', () => {
    const fuso: Archivio = { fatture: arr({ id: 'a', invoiceNumber: '1/2026' }, { id: 'b', invoiceNumber: '1/2025' }) }
    const esito = rinumeraFattureDuplicate(fuso, {}, adesso)
    expect(esito.rinumerate).toEqual([])
    expect(esito.archivio).toBe(fuso)
  })
})
