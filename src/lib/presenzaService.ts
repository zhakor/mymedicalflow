/**
 * Presenze — riepilogo di quanto è stato effettivamente svolto.
 *
 * Serve a confrontare una fattura con il lavoro che copre: si contano le
 * sedute a cui l'assistito era presente, non gli appuntamenti fissati. Un
 * appuntamento saltato o ancora da fare non entra nell'importo.
 */

import { appuntamentoService } from './appuntamentoService'
import { servizioService } from './servizioService'
import type { Appointment } from '../types/appuntamento'
import { STATO_PRESENZA_DEFAULT } from '../types/appuntamento'
import type { Servizio } from '../types/servizio'

export interface VoceRiepilogo {
  nome: string
  quantita: number
  prezzoUnitario: number
  totale: number
  /** Il servizio non ha una tariffa: la voce non contribuisce al totale. */
  senzaPrezzo: boolean
}

export interface RiepilogoMensile {
  /** Mese osservato, in formato `AAAA-MM`. */
  mese: string
  presenti: number
  assenti: number
  daSvolgere: number
  voci: VoceRiepilogo[]
  totale: number
  /**
   * Vero se almeno una seduta svolta appartiene a un servizio senza tariffa:
   * il totale è allora parziale e va dichiarato come tale, non spacciato per
   * completo.
   */
  totaleParziale: boolean
}

/** Mese di una data `AAAA-MM-GG`. */
export function meseDi(data: string): string {
  return (data ?? '').slice(0, 7)
}

export function presenzaDi(a: Appointment) {
  return a.presenza ?? STATO_PRESENZA_DEFAULT
}

/**
 * Riepilogo di un paziente in un mese.
 *
 * `mese` è nel formato `AAAA-MM`. Il paziente si identifica per `patientId`;
 * gli appuntamenti che non lo portano — registrati senza collegamento alla
 * scheda — restano fuori, perché attribuirli per nome sarebbe un'ipotesi.
 */
export function riepilogoMensile(
  patientId: string,
  mese: string,
  appuntamenti: Appointment[] = appuntamentoService.getAllAppointments(),
  servizi: Servizio[] = servizioService.getAll(),
): RiepilogoMensile {
  const delMese = appuntamenti.filter(
    (a) => a?.patientId === patientId && meseDi(a.appointmentDate) === mese,
  )

  let presenti = 0
  let assenti = 0
  let daSvolgere = 0

  // Le sedute svolte si raggruppano per servizio, che è il livello a cui
  // esiste una tariffa.
  const perServizio = new Map<string, { nome: string; prezzo: number; quantita: number }>()

  for (const a of delMese) {
    const stato = presenzaDi(a)
    if (stato === 'assente') {
      assenti++
      continue
    }
    if (stato === 'programmato') {
      daSvolgere++
      continue
    }

    presenti++
    const servizio = servizioService.servizioDi(a, servizi)
    const chiave = servizio?.id ?? 'sconosciuto'
    const voce = perServizio.get(chiave)
    if (voce) {
      voce.quantita++
    } else {
      perServizio.set(chiave, {
        nome: servizioService.nomeDi(a, servizi),
        prezzo: servizio?.prezzo ?? 0,
        quantita: 1,
      })
    }
  }

  const voci: VoceRiepilogo[] = [...perServizio.values()]
    .map((v) => ({
      nome: v.nome,
      quantita: v.quantita,
      prezzoUnitario: v.prezzo,
      totale: arrotondaCentesimi(v.prezzo * v.quantita),
      senzaPrezzo: v.prezzo <= 0,
    }))
    .sort((a, b) => b.quantita - a.quantita || a.nome.localeCompare(b.nome))

  const totale = arrotondaCentesimi(voci.reduce((somma, v) => somma + v.totale, 0))

  return {
    mese,
    presenti,
    assenti,
    daSvolgere,
    voci,
    totale,
    totaleParziale: voci.some((v) => v.senzaPrezzo),
  }
}

/** Sommare prezzi in virgola mobile può produrre un centesimo dal nulla. */
function arrotondaCentesimi(valore: number): number {
  return Math.round(valore * 100) / 100
}
