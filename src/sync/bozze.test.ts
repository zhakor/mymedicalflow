import { describe, expect, it } from 'vitest'
import { numeraBozze, type FatturaNumerabile } from './bozze'

const ADESSO = '2026-11-26T08:00:00.000Z'

const emessa = (id: string, invoiceNumber: string, issueDate: string): FatturaNumerabile => ({
  id,
  invoiceNumber,
  issueDate,
  createdAt: `${issueDate}T10:00:00.000Z`,
})

const bozza = (id: string, issueDate: string, createdAt: string): FatturaNumerabile => ({
  id,
  invoiceNumber: '',
  issueDate,
  createdAt,
  bozza: true,
})

describe('numerazione delle bozze', () => {
  it('numera dopo l\'ultima emessa, nell\'ordine di creazione, e toglie il segno di bozza', () => {
    const { fatture, numerate } = numeraBozze(
      [
        emessa('a', '14/2026', '2026-11-24'),
        bozza('y', '2026-11-26', '2026-11-26T09:30:00.000Z'),
        bozza('x', '2026-11-26', '2026-11-26T09:00:00.000Z'),
      ],
      '2026-11-26',
      ADESSO,
    )
    expect(numerate).toEqual([
      { id: 'x', numero: '15/2026', data: '2026-11-26', dataSpostata: false },
      { id: 'y', numero: '16/2026', data: '2026-11-26', dataSpostata: false },
    ])
    expect(fatture.map((f) => f.id)).toEqual(['a', 'y', 'x'])
    expect(fatture[2]).toEqual({
      id: 'x',
      invoiceNumber: '15/2026',
      issueDate: '2026-11-26',
      createdAt: '2026-11-26T09:00:00.000Z',
      updatedAt: ADESSO,
    })
  })

  it('sposta la data se una fattura del telefono è più recente della bozza', () => {
    const { numerate } = numeraBozze(
      [
        emessa('a', '14/2026', '2026-11-24'),
        emessa('tel', '15/2026', '2026-11-25'),
        bozza('x', '2026-11-24', '2026-11-24T18:00:00.000Z'),
      ],
      '2026-11-26',
      ADESSO,
    )
    expect(numerate).toEqual([{ id: 'x', numero: '16/2026', data: '2026-11-26', dataSpostata: true }])
  })

  it('usa la serie dell\'anno della data della bozza', () => {
    const { numerate } = numeraBozze(
      [emessa('a', '30/2026', '2026-12-30'), bozza('x', '2027-01-02', '2027-01-02T09:00:00.000Z')],
      '2027-01-02',
      ADESSO,
    )
    expect(numerate[0].numero).toBe('1/2027')
  })

  it('senza bozze restituisce lo stesso elenco', () => {
    const fatture = [emessa('a', '1/2026', '2026-01-10')]
    expect(numeraBozze(fatture, '2026-11-26', ADESSO).fatture).toBe(fatture)
  })
})
