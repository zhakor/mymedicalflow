/**
 * Cosa è cambiato per mano dell'altro dispositivo: pazienti, appuntamenti e
 * fatture creati, modificati o eliminati, per le notifiche del PC. Si
 * confronta l'archivio di prima con quello appena arrivato dal cloud: le
 * modifiche fatte sul PC non passano di qui, quindi non vengono segnalate.
 *
 * - creato: un id che prima non c'era;
 * - modificato: lo stesso id con un contenuto diverso;
 * - eliminato: un id che c'era e ora manca (il nome si prende da prima).
 */

import type { Archivio } from './cifratura'

export type TipoNovita = 'paziente' | 'appuntamento' | 'fattura'
export type AzioneNovita = 'creato' | 'modificato' | 'eliminato'

export interface Novita {
  tipo: TipoNovita
  azione: AzioneNovita
  testo: string
}

/** Oltre questo numero per tipo e azione, una sola notifica riassuntiva. */
const MASSIMO_PER_GRUPPO = 3

interface Record {
  id: string
  [campo: string]: unknown
}

function elenco(archivio: Archivio, chiave: string): Map<string, Record> {
  try {
    const v = JSON.parse(archivio[chiave] ?? '[]') as unknown
    if (!Array.isArray(v)) return new Map()
    return new Map(
      (v.filter((r) => r && typeof (r as Record).id === 'string') as Record[]).map((r) => [r.id, r]),
    )
  } catch {
    return new Map()
  }
}

const nome = (r: Record, cognome = 'patientLastName', nomeProprio = 'patientFirstName') =>
  [r[cognome], r[nomeProprio]].filter((x) => typeof x === 'string' && x.trim()).join(' ')

const dataBreve = (iso: unknown) => (typeof iso === 'string' && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

const intestatario = (r: Record) =>
  (r.invoiceType === 'elettronica' && typeof r.azienda === 'string' && r.azienda.trim()) || nome(r)

/** Testi al singolare e al plurale, per tipo e azione. */
const DESCRIZIONE: { [T in TipoNovita]: { chiave: string; una: (r: Record, a: AzioneNovita) => string; molte: (n: number, a: AzioneNovita) => string } } = {
  paziente: {
    chiave: 'pazienti',
    una: (r, a) => `Paziente ${a}: ${nome(r, 'lastName', 'firstName') || 'senza nome'}`,
    molte: (n, a) => `${n} pazienti ${a === 'creato' ? 'nuovi' : a === 'modificato' ? 'modificati' : 'eliminati'}`,
  },
  appuntamento: {
    chiave: 'appuntamenti',
    una: (r, a) =>
      `Appuntamento ${a}: ${nome(r) || 'senza paziente'}, ${dataBreve(r.appointmentDate)} alle ${String(r.appointmentTime ?? '')}`.trim(),
    molte: (n, a) => `${n} appuntamenti ${a === 'creato' ? 'nuovi' : a === 'modificato' ? 'modificati' : 'eliminati'}`,
  },
  fattura: {
    chiave: 'fatture',
    una: (r, a) => {
      const chi = intestatario(r)
      return `Fattura ${String(r.invoiceNumber ?? '')} ${a === 'creato' ? 'creata' : a === 'modificato' ? 'modificata' : 'eliminata'}${chi ? ` · ${chi}` : ''}`
    },
    molte: (n, a) => `${n} fatture ${a === 'creato' ? 'nuove' : a === 'modificato' ? 'modificate' : 'eliminate'}`,
  },
}

export function novitaArrivate(prima: Archivio, dopo: Archivio): Novita[] {
  const risultato: Novita[] = []
  for (const tipo of ['paziente', 'appuntamento', 'fattura'] as const) {
    const d = DESCRIZIONE[tipo]
    const vecchi = elenco(prima, d.chiave)
    const nuovi = elenco(dopo, d.chiave)
    const gruppi: { [A in AzioneNovita]: Record[] } = { creato: [], modificato: [], eliminato: [] }
    for (const [id, r] of nuovi) {
      const prec = vecchi.get(id)
      if (!prec) gruppi.creato.push(r)
      else if (JSON.stringify(prec) !== JSON.stringify(r)) gruppi.modificato.push(r)
    }
    for (const [id, r] of vecchi) if (!nuovi.has(id)) gruppi.eliminato.push(r)

    for (const azione of ['creato', 'modificato', 'eliminato'] as const) {
      const g = gruppi[azione]
      if (g.length > MASSIMO_PER_GRUPPO) risultato.push({ tipo, azione, testo: d.molte(g.length, azione) })
      else for (const r of g) risultato.push({ tipo, azione, testo: d.una(r, azione) })
    }
  }
  return risultato
}
