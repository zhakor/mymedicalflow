import { storageService } from './storageService'
import type {
  Invoice,
  InvoiceInput,
  InvoiceFilters,
  InvoiceQuery,
  PaginatedInvoices,
} from '../types/fattura'

const KEY = 'fatture'

// ─── Helpers interni ─────────────────────────────────────────────────────────

function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getAll(): Invoice[] {
  return (storageService.get<Invoice[]>(KEY) ?? []).filter(Boolean)
}

function saveAll(invoices: Invoice[]): void {
  storageService.set(KEY, invoices)
}

function matchesFilters(inv: Invoice, filters: InvoiceFilters): boolean {
  if (!inv) return false
  if (
    filters.fiscalCode &&
    !inv.patientFiscalCode?.toLowerCase().includes(filters.fiscalCode.toLowerCase())
  )
    return false
  if (
    filters.invoiceNumber &&
    !inv.invoiceNumber?.toLowerCase().includes(filters.invoiceNumber.toLowerCase())
  )
    return false
  if (
    filters.patientLastName &&
    !inv.patientLastName?.toLowerCase().includes(filters.patientLastName.toLowerCase())
  )
    return false
  if (
    filters.description &&
    !inv.description?.toLowerCase().includes(filters.description.toLowerCase())
  )
    return false
  if (filters.status && inv.status !== filters.status) return false
  return true
}

// ─── Servizio fatture ─────────────────────────────────────────────────────────

export const fatturaService = {
  getInvoices(query: InvoiceQuery): PaginatedInvoices {
    const { page, pageSize, filters = {} } = query
    const all = getAll()
    const filtered = all.filter((inv) => matchesFilters(inv, filters))

    // Ordina per data emissione desc, poi per numero fattura desc
    filtered.sort((a, b) => {
      const dateDiff =
        new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
      if (dateDiff !== 0) return dateDiff
      return b.invoiceNumber.localeCompare(a.invoiceNumber)
    })

    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize
    const data = filtered.slice(start, start + pageSize)

    return { data, totalItems, totalPages, page: safePage, pageSize }
  },

  getById(id: string): Invoice | null {
    return getAll().find((inv) => inv.id === id) ?? null
  },

  /**
   * Restituisce il prossimo numero fattura disponibile nel formato "N/YYYY".
   */
  getNextInvoiceNumber(): string {
    const year = new Date().getFullYear()
    const all = getAll()
    const thisYear = all.filter((inv) =>
      inv.invoiceNumber?.endsWith(`/${year}`),
    )
    if (thisYear.length === 0) return `1/${year}`
    const maxNum = Math.max(
      ...thisYear.map((inv) => {
        const n = parseInt(inv.invoiceNumber.split('/')[0], 10)
        return isNaN(n) ? 0 : n
      }),
    )
    return `${maxNum + 1}/${year}`
  },

  /**
   * Verifica se un numero fattura è già usato (esclude opzionalmente un id).
   */
  isDuplicateNumber(invoiceNumber: string, excludeId?: string): boolean {
    return getAll().some(
      (inv) => inv.invoiceNumber === invoiceNumber && inv.id !== excludeId,
    )
  },

  create(input: InvoiceInput): Invoice {
    const now = new Date().toISOString()
    const invoice: Invoice = { ...input, id: generateId(), createdAt: now, updatedAt: now }
    saveAll([...getAll(), invoice])
    return invoice
  },

  update(id: string, input: Partial<InvoiceInput>): Invoice | null {
    const all = getAll()
    const idx = all.findIndex((inv) => inv.id === id)
    if (idx === -1) return null
    const updated: Invoice = { ...all[idx], ...input, id, updatedAt: new Date().toISOString() }
    all[idx] = updated
    saveAll(all)
    return updated
  },

  delete(id: string): boolean {
    const all = getAll()
    const filtered = all.filter((inv) => inv.id !== id)
    if (filtered.length === all.length) return false
    saveAll(filtered)
    return true
  },

  /** Salva il file generato nell'invoice. */
  saveGeneratedFile(id: string, file: Invoice['generatedFile']): Invoice | null {
    return fatturaService.update(id, { generatedFile: file })
  },

  getCount(): number {
    return getAll().length
  },

  /** Restituisce tutte le fatture di un paziente (per id o codice fiscale). */
  getByPatient(patientId?: string, fiscalCode?: string): Invoice[] {
    const fc = fiscalCode?.trim().toUpperCase()
    return getAll()
      .filter((inv) =>
        (patientId && inv.patientId === patientId) ||
        (fc && inv.patientFiscalCode?.toUpperCase() === fc),
      )
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
  },
}
