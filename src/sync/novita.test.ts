import { describe, expect, it } from 'vitest'
import { novitaArrivate } from './novita'

const archivio = (o: { pazienti?: object[]; appuntamenti?: object[]; fatture?: object[] }) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)]))

const lisa = { id: 'p1', firstName: 'Lisa', lastName: 'Lecca' }
const appuntamento = { id: 'a1', patientFirstName: 'Lisa', patientLastName: 'Lecca', appointmentDate: '2026-11-27', appointmentTime: '10:00' }
const fattura = { id: 'f1', invoiceNumber: '1/2026', invoiceType: 'cartacea', patientFirstName: 'Lisa', patientLastName: 'Lecca', amount: 50 }

describe("novità arrivate dall'altro dispositivo", () => {
  const prima = archivio({ pazienti: [lisa], appuntamenti: [appuntamento], fatture: [fattura] })

  it('creazioni: nomi, data, numero e azienda', () => {
    const dopo = archivio({
      pazienti: [lisa, { id: 'p2', firstName: 'Mario', lastName: 'Rossi' }],
      appuntamenti: [appuntamento],
      fatture: [fattura, { id: 'f2', invoiceNumber: '2/2026', invoiceType: 'elettronica', azienda: 'ASL Cagliari' }],
    })
    expect(novitaArrivate(prima, dopo)).toEqual([
      { tipo: 'paziente', azione: 'creato', testo: 'Paziente creato: Rossi Mario' },
      { tipo: 'fattura', azione: 'creato', testo: 'Fattura 2/2026 creata · ASL Cagliari' },
    ])
  })

  it('modifiche: stesso id, contenuto diverso', () => {
    const dopo = archivio({
      pazienti: [lisa],
      appuntamenti: [{ ...appuntamento, appointmentTime: '11:30' }],
      fatture: [{ ...fattura, amount: 60 }],
    })
    expect(novitaArrivate(prima, dopo)).toEqual([
      { tipo: 'appuntamento', azione: 'modificato', testo: 'Appuntamento modificato: Lecca Lisa, 27/11 alle 11:30' },
      { tipo: 'fattura', azione: 'modificato', testo: 'Fattura 1/2026 modificata · Lecca Lisa' },
    ])
  })

  it('cancellazioni: il nome si prende dalla versione di prima', () => {
    const dopo = archivio({ pazienti: [], appuntamenti: [], fatture: [] })
    expect(novitaArrivate(prima, dopo)).toEqual([
      { tipo: 'paziente', azione: 'eliminato', testo: 'Paziente eliminato: Lecca Lisa' },
      { tipo: 'appuntamento', azione: 'eliminato', testo: 'Appuntamento eliminato: Lecca Lisa, 27/11 alle 10:00' },
      { tipo: 'fattura', azione: 'eliminato', testo: 'Fattura 1/2026 eliminata · Lecca Lisa' },
    ])
  })

  it('niente notifiche se non è cambiato nulla', () => {
    expect(novitaArrivate(prima, { ...prima })).toEqual([])
  })

  it('tante novità dello stesso tipo e azione diventano una notifica sola', () => {
    const dopo = archivio({
      pazienti: [lisa],
      appuntamenti: [appuntamento, ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }))],
      fatture: [fattura],
    })
    expect(novitaArrivate(prima, dopo)).toEqual([{ tipo: 'appuntamento', azione: 'creato', testo: '12 appuntamenti nuovi' }])
  })

  it('un archivio vuoto o illeggibile non rompe nulla', () => {
    expect(novitaArrivate({}, { fatture: 'non json' })).toEqual([])
  })
})
