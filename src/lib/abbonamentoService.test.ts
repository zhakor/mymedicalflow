import { describe, expect, it } from 'vitest'
import { motivoBlocco, valutaVerifica, type Licenza } from './abbonamentoService'

const GIORNO = 86_400_000
const oggi = Date.UTC(2026, 10, 27)

describe('verifica dell\'abbonamento ogni 30 giorni', () => {
  it('senza verifica serve l\'accesso', () => {
    expect(valutaVerifica(null, oggi)).toEqual({ tipo: 'da-rifare' })
  })

  it('vale 30 giorni dall\'accesso, poi va rifatta', () => {
    const v = { email: 'a@b.it', verificataIl: oggi, scadenza: null }
    expect(valutaVerifica(v, oggi + 10 * GIORNO)).toEqual({ tipo: 'valida', giorniRimasti: 20 })
    expect(valutaVerifica(v, oggi + 29.5 * GIORNO)).toEqual({ tipo: 'valida', giorniRimasti: 1 })
    expect(valutaVerifica(v, oggi + 30 * GIORNO)).toEqual({ tipo: 'da-rifare' })
  })

  it('un orologio spostato indietro non allunga la validità', () => {
    expect(valutaVerifica({ email: 'a@b.it', verificataIl: oggi, scadenza: null }, oggi - GIORNO)).toEqual({ tipo: 'da-rifare' })
  })

  it('la scadenza della licenza blocca anche dentro i 30 giorni', () => {
    const v = { email: 'a@b.it', verificataIl: oggi, scadenza: oggi + 5 * GIORNO }
    expect(valutaVerifica(v, oggi + 4 * GIORNO).tipo).toBe('valida')
    expect(valutaVerifica(v, oggi + 5 * GIORNO)).toEqual({ tipo: 'scaduta', scadenza: oggi + 5 * GIORNO })
  })
})

describe('lettura della licenza', () => {
  const licenza = (l: Partial<Licenza> = {}): Licenza => ({ email: 'a@b.it', emailVerificata: true, attiva: true, scadenza: null, ...l })

  it('apre con email verificata e licenza attiva non scaduta', () => {
    expect(motivoBlocco(licenza(), oggi)).toBeNull()
    expect(motivoBlocco(licenza({ scadenza: oggi + GIORNO }), oggi)).toBeNull()
  })

  it('blocca e dice perché', () => {
    expect(motivoBlocco(licenza({ emailVerificata: false }), oggi)).toMatch(/non è verificata/)
    expect(motivoBlocco(licenza({ attiva: false }), oggi)).toMatch(/Nessun abbonamento attivo/)
    expect(motivoBlocco(licenza({ scadenza: oggi - GIORNO }), oggi)).toMatch(/è scaduto il/)
  })
})
