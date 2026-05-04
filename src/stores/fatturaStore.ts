import { create } from 'zustand'
import { fatturaService } from '../lib/fatturaService'
import type {
  Invoice,
  InvoiceQuery,
  PaginatedInvoices,
  InvoiceFilters,
} from '../types/fattura'

export type { Invoice }

const DEFAULT_PAGE_SIZE = 10

const EMPTY_FILTERS: InvoiceFilters = {
  fiscalCode: '',
  invoiceNumber: '',
  patientLastName: '',
  description: '',
  status: '',
}

export interface FatturaStore {
  result: PaginatedInvoices
  query: InvoiceQuery
  feedbackMessage: string | null
  feedbackType: 'success' | 'error' | null

  loadInvoices: (partial?: Partial<InvoiceQuery>) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setFilters: (filters: InvoiceFilters) => void
  resetFilters: () => void
  deleteInvoice: (id: string) => void
  showFeedback: (message: string, type?: 'success' | 'error') => void
  clearFeedback: () => void
}

const DEFAULT_RESULT: PaginatedInvoices = {
  data: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
}

export const useFatturaStore = create<FatturaStore>((set, get) => ({
  result: DEFAULT_RESULT,
  query: {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    filters: { ...EMPTY_FILTERS },
  },
  feedbackMessage: null,
  feedbackType: null,

  loadInvoices: (partial) => {
    const query = { ...get().query, ...partial }
    const result = fatturaService.getInvoices(query)
    set({ query, result })
  },

  setPage: (page) => {
    get().loadInvoices({ page })
  },

  setPageSize: (pageSize) => {
    get().loadInvoices({ pageSize, page: 1 })
  },

  setFilters: (filters) => {
    get().loadInvoices({ filters, page: 1 })
  },

  resetFilters: () => {
    get().loadInvoices({ filters: { ...EMPTY_FILTERS }, page: 1 })
  },

  deleteInvoice: (id: string) => {
    const ok = fatturaService.delete(id)
    if (ok) {
      const { query, result } = get()
      const newPage =
        result.data.length === 1 && query.page > 1 ? query.page - 1 : query.page
      get().loadInvoices({ page: newPage })
      get().showFeedback('Fattura eliminata.')
    }
  },

  showFeedback: (message, type = 'success') => {
    set({ feedbackMessage: message, feedbackType: type })
    setTimeout(() => set({ feedbackMessage: null, feedbackType: null }), 3000)
  },

  clearFeedback: () => set({ feedbackMessage: null, feedbackType: null }),
}))
