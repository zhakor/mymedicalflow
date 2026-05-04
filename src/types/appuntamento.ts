export type AppointmentType = 'valutazione' | 'sessione'

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  valutazione: 'Valutazione',
  sessione: 'Sessione',
}

export const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'valutazione', label: 'Valutazione' },
  { value: 'sessione', label: 'Sessione' },
]

export interface Appointment {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  appointmentType: AppointmentType
  appointmentDate: string   // YYYY-MM-DD
  appointmentTime: string   // HH:MM
  description?: string
  createdAt: string
  updatedAt: string
}

export type AppointmentInput = Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>

export interface AppointmentFilters {
  dateFrom?: string
  dateTo?: string
  appointmentType?: AppointmentType | ''
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
