import { create } from 'zustand'
import { pazienteService } from '../lib/pazienteService'
import type { Patient, PatientsQuery, PaginatedResult, PatientFilters } from '../types/paziente'
import { EMPTY_FILTERS } from '../features/pazienti/pazienteValidation'

const DEFAULT_PAGE_SIZE = 10

interface PazienteStore {
  // Lista paginata corrente
  result: PaginatedResult<Patient>
  // Query corrente
  query: PatientsQuery
  // Feedback
  feedbackMessage: string | null
  feedbackType: 'success' | 'error' | null

  // Azioni
  loadPatients: (query?: Partial<PatientsQuery>) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setFilters: (filters: PatientFilters) => void
  resetFilters: () => void
  deletePatient: (id: string) => void
  showFeedback: (message: string, type?: 'success' | 'error') => void
  clearFeedback: () => void
}

const DEFAULT_RESULT: PaginatedResult<Patient> = {
  data: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
}

export const usePazienteStore = create<PazienteStore>((set, get) => ({
  result: DEFAULT_RESULT,
  query: {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    filters: { ...EMPTY_FILTERS },
  },
  feedbackMessage: null,
  feedbackType: null,

  loadPatients: (partial) => {
    const query = { ...get().query, ...partial }
    const result = pazienteService.getPatients(query)
    set({ query, result })
  },

  setPage: (page) => {
    get().loadPatients({ page })
  },

  setPageSize: (pageSize) => {
    get().loadPatients({ pageSize, page: 1 })
  },

  setFilters: (filters) => {
    get().loadPatients({ filters, page: 1 })
  },

  resetFilters: () => {
    get().loadPatients({ filters: { ...EMPTY_FILTERS }, page: 1 })
  },

  deletePatient: (id) => {
    const ok = pazienteService.delete(id)
    if (ok) {
      // Ricarica dalla pagina corrente (potrebbe cambiare se la pagina si svuota)
      const { query, result } = get()
      const newPage = result.data.length === 1 && query.page > 1
        ? query.page - 1
        : query.page
      get().loadPatients({ page: newPage })
      get().showFeedback('Paziente eliminato.')
    }
  },

  showFeedback: (message, type = 'success') => {
    set({ feedbackMessage: message, feedbackType: type })
    setTimeout(() => {
      set({ feedbackMessage: null, feedbackType: null })
    }, 3000)
  },

  clearFeedback: () => set({ feedbackMessage: null, feedbackType: null }),
}))
