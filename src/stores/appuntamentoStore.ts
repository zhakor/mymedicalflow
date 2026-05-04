import { create } from 'zustand'
import { appuntamentoService } from '../lib/appuntamentoService'
import type {
  Appointment,
  AppointmentQuery,
  PaginatedAppointments,
  AppointmentFilters,
  AppointmentInput,
} from '../types/appuntamento'

export type { Appointment }

const DEFAULT_PAGE_SIZE = 10

export const EMPTY_APPOINTMENT_FILTERS: AppointmentFilters = {
  dateFrom: '',
  dateTo: '',
  appointmentType: '',
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
