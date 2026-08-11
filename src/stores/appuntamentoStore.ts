import { create } from 'zustand'
import { appuntamentoService } from '../lib/appuntamentoService'
import type {
  Appointment,
  AppointmentQuery,
  PaginatedAppointments,
  AppointmentFilters,
  AppointmentInput,
} from '../types/appuntamento'
import type { StatoPresenza } from '../types/appuntamento'

export type { Appointment }

const DEFAULT_PAGE_SIZE = 10

export const EMPTY_APPOINTMENT_FILTERS: AppointmentFilters = {
  dateFrom: '',
  dateTo: '',
  serviceId: '',
  presenza: '',
  patientLastName: '',
}

export interface AppuntamentoStore {
  result: PaginatedAppointments
  query: AppointmentQuery
  feedbackMessage: string | null
  feedbackType: 'success' | 'error' | null

  loadAppointments: (partial?: Partial<AppointmentQuery>) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setFilters: (filters: AppointmentFilters) => void
  resetFilters: () => void
  createAppointment: (input: AppointmentInput) => void
  updateAppointment: (id: string, input: AppointmentInput) => void
  /** Sposta data e ora senza toccare il resto: usato dal trascinamento. */
  spostaAppointment: (id: string, data: string, ora: string) => void
  segnaPresenza: (id: string, stato: StatoPresenza) => void
  deleteAppointment: (id: string) => void
  showFeedback: (message: string, type?: 'success' | 'error') => void
  clearFeedback: () => void
}

const DEFAULT_RESULT: PaginatedAppointments = {
  data: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
}

export const useAppuntamentoStore = create<AppuntamentoStore>((set, get) => ({
  result: DEFAULT_RESULT,
  query: {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    filters: { ...EMPTY_APPOINTMENT_FILTERS },
  },
  feedbackMessage: null,
  feedbackType: null,

  loadAppointments: (partial) => {
    const query = { ...get().query, ...partial }
    const result = appuntamentoService.getAppointments(query)
    set({ query, result })
  },

  setPage: (page) => {
    get().loadAppointments({ page })
  },

  setPageSize: (pageSize) => {
    get().loadAppointments({ page: 1, pageSize })
  },

  setFilters: (filters) => {
    get().loadAppointments({ page: 1, filters })
  },

  resetFilters: () => {
    get().loadAppointments({ page: 1, filters: { ...EMPTY_APPOINTMENT_FILTERS } })
  },

  createAppointment: (input) => {
    appuntamentoService.create(input)
    get().loadAppointments()
    get().showFeedback('Appuntamento creato con successo.')
  },

  updateAppointment: (id, input) => {
    appuntamentoService.update(id, input)
    get().loadAppointments()
    get().showFeedback('Appuntamento aggiornato con successo.')
  },

  // Senza messaggio: il pulsante cambia colore all'istante, e un avviso a ogni
  // spunta diventerebbe rumore quando si segna una giornata intera.
  segnaPresenza: (id, stato) => {
    appuntamentoService.segnaPresenza(id, stato)
    get().loadAppointments()
  },

  // Il messaggio lo compone chi chiama: solo lì si sa se è cambiato l'orario,
  // il giorno o entrambi, e dire "spostato alle 11:00" dopo aver cambiato data
  // sarebbe falso.
  spostaAppointment: (id, data, ora) => {
    if (!appuntamentoService.sposta(id, data, ora)) return
    get().loadAppointments()
  },

  deleteAppointment: (id) => {
    appuntamentoService.delete(id)
    get().loadAppointments()
    get().showFeedback('Appuntamento eliminato.')
  },

  showFeedback: (message, type = 'success') => {
    set({ feedbackMessage: message, feedbackType: type })
    setTimeout(() => {
      set({ feedbackMessage: null, feedbackType: null })
    }, 4000)
  },

  clearFeedback: () => {
    set({ feedbackMessage: null, feedbackType: null })
  },
}))
