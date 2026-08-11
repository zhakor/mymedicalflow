export type AppointmentType = 'valutazione' | 'sessione'

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  valutazione: 'Valutazione',
  sessione: 'Sessione',
}

export const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'valutazione', label: 'Valutazione' },
  { value: 'sessione', label: 'Sessione' },
]

// ─── Presenza ─────────────────────────────────────────────────────────────────

/**
 * Se la seduta è stata effettivamente svolta.
 *
 * Serve a distinguere quanto è stato erogato da quanto era solo in programma:
 * l'importo di una fattura si confronta con le presenze, non con gli
 * appuntamenti fissati.
 */
export type StatoPresenza = 'programmato' | 'presente' | 'assente'

export const STATO_PRESENZA_LABELS: Record<StatoPresenza, string> = {
  programmato: 'Da svolgere',
  presente: 'Presente',
  assente: 'Assente',
}

export const STATO_PRESENZA_DEFAULT: StatoPresenza = 'programmato'

export interface Appointment {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  /**
   * @deprecated sostituito da `serviceId`. Resta sugli appuntamenti salvati
   * prima dei servizi personalizzabili, da cui si risale al servizio
   * corrispondente senza riscrivere i dati.
   */
  appointmentType?: AppointmentType
  /** Servizio erogato, fra quelli configurati nelle Impostazioni. */
  serviceId?: string
  appointmentDate: string   // YYYY-MM-DD
  appointmentTime: string   // HH:MM
  /** Assente sugli appuntamenti registrati prima: vale allora "programmato". */
  presenza?: StatoPresenza
  description?: string
  createdAt: string
  updatedAt: string
}

export type AppointmentInput = Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>

export interface AppointmentFilters {
  dateFrom?: string
  dateTo?: string
  /** Identificativo del servizio, non più il tipo fisso. */
  serviceId?: string
  presenza?: StatoPresenza | ''
  patientLastName?: string
}

export interface AppointmentQuery {
  page: number
  pageSize: number
  filters: AppointmentFilters
}

export interface PaginatedAppointments {
  data: Appointment[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
}
