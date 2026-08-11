import { storageService } from './storageService'
import { sistemaTsService } from './sistemaTsService'
import type {
  Invoice,
  InvoiceInput,
  InvoiceFilters,
  InvoiceQuery,
  PaginatedInvoices,
} from '../types/fattura'

export const STORAGE_KEY = 'fatture'

const KEY = STORAGE_KEY

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
  if (filters.status && inv.status !== filters.status) return false
  if (filters.invoiceType && inv.invoiceType !== filters.invoiceType) return false
  // Le date sono in formato ISO "AAAA-MM-GG": il confronto fra stringhe
  // rispetta l'ordine cronologico, estremi inclusi.
  if (filters.issuedFrom && (inv.issueDate ?? '') < filters.issuedFrom) return false
  if (filters.issuedTo && (inv.issueDate ?? '') > filters.issuedTo) return false
  if (filters.sistemaTs && !corrispondeSistemaTs(inv, filters.sistemaTs)) return false
  return true
}

/** Confronto fra la fattura e il filtro sullo stato di trasmissione. */
function corrispondeSistemaTs(
  inv: Invoice,
  filtro: NonNullable<InvoiceFilters['sistemaTs']>,
): boolean {
  const stato = sistemaTsService.statoPerFattura(inv)
  switch (filtro) {
    case 'soggette':
      return stato !== 'non_previsto'
    case 'non_previste':
      return stato === 'non_previsto'
    case 'da_inviare':
      return stato === 'da_inviare'
    // Una variazione è comunque arrivata al Sistema TS
    case 'trasmesse':
      return stato === 'inviata' || stato === 'variata'
    case 'errore':
      return stato === 'errore'
    default:
      return true
  }
}

/**
 * Anno e progressivo di un numero "N/AAAA".
 *
 * Confrontarlo come testo mette "99/2026" fra "102/2026" e "105/2026", perché
 * '9' viene dopo '1': i due pezzi vanno letti come numeri.
 */
function chiaveNumero(invoiceNumber: string): { anno: number; progressivo: number } {
  const [testaProgressivo, testaAnno] = (invoiceNumber ?? '').split('/')
  const progressivo = parseInt(testaProgressivo, 10)
  const anno = parseInt(testaAnno, 10)
  return {
    anno: Number.isNaN(anno) ? 0 : anno,
    progressivo: Number.isNaN(progressivo) ? 0 : progressivo,
  }
}

// ─── Servizio fatture ─────────────────────────────────────────────────────────

export const fatturaService = {
  getInvoices(query: InvoiceQuery): PaginatedInvoices {
    const { page, pageSize, filters = {} } = query
    const all = getAll()
    const filtered = all.filter((inv) => matchesFilters(inv, filters))

    // Ordine del registro: anno e progressivo decrescenti. Il numero viene
    // prima della data perché è l'ordine con cui le fatture sono state emesse;
    // una fattura retrodatata altrimenti comparirebbe fuori sequenza.
    filtered.sort((a, b) => {
      const ka = chiaveNumero(a.invoiceNumber)
      const kb = chiaveNumero(b.invoiceNumber)
      if (ka.anno !== kb.anno) return kb.anno - ka.anno
      if (ka.progressivo !== kb.progressivo) return kb.progressivo - ka.progressivo
      return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
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
