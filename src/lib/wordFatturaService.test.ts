import { describe, expect, it } from 'vitest'
import { nomeWord, wordDaAggiornare } from './wordFatturaService'
import type { Invoice } from '../types/fattura'

const fattura = (numero: string, fileName?: string, tipo: Invoice['invoiceType'] = 'cartacea'): Invoice => ({
  id: 'f1',
  invoiceNumber: numero,
  patientFiscalCode: 'RSSMRA80A01H501U',
  patientFirstName: 'Mario',
  patientLastName: 'Rossi',
  description: 'Seduta',
  amount: 50,
  stampDuty: 0,
  status: 'in_attesa',
  issueDate: '2026-11-26',
  invoiceType: tipo,
  createdAt: '2026-11-26T10:00:00.000Z',
  updatedAt: '2026-11-26T10:00:00.000Z',
  generatedFile: fileName ? { fileName, fileBase64: '', generatedAt: '', mimeType: '' } : undefined,
})

describe('Word della fattura quando il numero cambia', () => {
  it('il nome è lo stesso su PC e telefono', () => {
    expect(nomeWord(fattura('12/2026'))).toBe('Fattura_12-2026_Rossi.docx')
  })

  it('va rigenerato solo se il numero nel nome non è più quello della fattura', () => {
    expect(wordDaAggiornare(fattura('5/2026', 'Fattura_5-2026_Rossi.docx'))).toBe(false)
    // Bozza 5/2026 numerata 6/2026, o rinumerata dopo la fattura del telefono
    expect(wordDaAggiornare(fattura('6/2026', 'Fattura_5-2026_Rossi.docx'))).toBe(true)
    // 1/2026 non deve sembrare l'inizio di 12/2026
    expect(wordDaAggiornare(fattura('12/2026', 'Fattura_1-2026_Rossi.docx'))).toBe(true)
  })

  it('senza Word, o per una fattura elettronica (PDF allegato), non si genera nulla', () => {
    expect(wordDaAggiornare(fattura('6/2026'))).toBe(false)
    expect(wordDaAggiornare(fattura('6/2026', 'preventivo.pdf', 'elettronica'))).toBe(false)
  })
})
