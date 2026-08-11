/**
 * Servizi del professionista.
 *
 * Sostituiscono i due tipi fissi "valutazione" e "sessione": ogni studio ha le
 * proprie prestazioni, con durate e tariffe diverse. La durata smette così di
 * essere una convenzione dell'interfaccia e diventa un dato, che è ciò che
 * permette di calcolare davvero l'occupazione dell'agenda.
 */

import type { AppointmentType } from './appuntamento'

/**
 * Tavolozza chiusa: Tailwind genera le classi a compilazione, quindi non si
 * possono comporre a runtime da un colore libero.
 */
export type ColoreServizio = 'teal' | 'ambra' | 'indaco' | 'rosa' | 'verde' | 'viola'

export interface ClassiColore {
  /** Riquadro nel dettaglio della giornata. */
  blocco: string
  /** Anteprima compatta nella casella del mese. */
  anteprima: string
  /** Pallino nei riepiloghi. */
  punto: string
}

export const COLORI_SERVIZIO: Record<ColoreServizio, ClassiColore> = {
  teal: {
    blocco: 'border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-900/20',
    anteprima: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    punto: 'bg-teal-500',
  },
  ambra: {
    blocco: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20',
    anteprima: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    punto: 'bg-amber-500',
  },
  indaco: {
    blocco: 'border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-900/20',
    anteprima: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    punto: 'bg-indigo-500',
  },
  rosa: {
    blocco: 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-900/20',
    anteprima: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    punto: 'bg-rose-500',
  },
  verde: {
    blocco: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20',
    anteprima: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    punto: 'bg-emerald-500',
  },
  viola: {
    blocco: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-900/20',
    anteprima: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    punto: 'bg-violet-500',
  },
}

export const COLORE_SERVIZIO_OPTIONS: { value: ColoreServizio; label: string }[] = [
  { value: 'teal', label: 'Verde acqua' },
  { value: 'ambra', label: 'Ambra' },
  { value: 'indaco', label: 'Indaco' },
  { value: 'rosa', label: 'Rosa' },
  { value: 'verde', label: 'Verde' },
  { value: 'viola', label: 'Viola' },
]

export interface Servizio {
  id: string
  nome: string
  /** Quanto occupa in agenda. Determina gli slot liberi e le sovrapposizioni. */
  durataMinuti: number
  /** Tariffa a seduta. Serve a confrontare le presenze con l'importo in fattura. */
  prezzo: number
  colore: ColoreServizio
  /**
   * Un servizio dismesso non si propone più nei nuovi appuntamenti, ma resta
   * per quelli passati: cancellarlo renderebbe illeggibile lo storico.
   */
  attivo: boolean
  createdAt: string
  updatedAt: string
}

export type ServizioInput = Omit<Servizio, 'id' | 'createdAt' | 'updatedAt'>

// ─── Continuità con i due tipi storici ────────────────────────────────────────

/**
 * Identificativi stabili dei servizi seminati alla prima apertura.
 *
 * Gli appuntamenti già salvati portano `appointmentType` e non `serviceId`:
 * invece di riscriverli tutti — operazione che su dati reali non si fa a
 * cuor leggero — si risalgono per convenzione a questi due identificativi.
 */
export const SERVIZIO_DA_TIPO: Record<AppointmentType, string> = {
  valutazione: 'srv_valutazione',
  sessione: 'srv_sessione',
}

/** Durate di partenza, modificabili dalle Impostazioni. */
export const SERVIZI_INIZIALI: { id: string; nome: string; durataMinuti: number; colore: ColoreServizio }[] = [
  { id: SERVIZIO_DA_TIPO.valutazione, nome: 'Valutazione', durataMinuti: 60, colore: 'ambra' },
  { id: SERVIZIO_DA_TIPO.sessione, nome: 'Sessione', durataMinuti: 45, colore: 'teal' },
]

/** Durata usata quando un appuntamento non ha un servizio riconoscibile. */
export const DURATA_DI_RIPIEGO = 45

export const DURATA_OPTIONS = [15, 30, 45, 60, 75, 90, 120].map((m) => ({
  value: String(m),
  label: m >= 60 ? `${m} minuti (${(m / 60).toFixed(m % 60 ? 1 : 0)}h)` : `${m} minuti`,
}))
