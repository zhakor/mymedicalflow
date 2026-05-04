// ─── Stato e tipo fattura ─────────────────────────────────────────────────────

export type InvoiceStatus = 'in_attesa' | 'pagata'
export type InvoiceType = 'cartacea' | 'elettronica'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  in_attesa: 'In attesa',
  pagata: 'Pagata',
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  cartacea: 'Cartacea',
  elettronica: 'Elettronica',
}

export const INVOICE_STATUS_OPTIONS = Object.entries(INVOICE_STATUS_LABELS)
  .map(([value, label]) => ({ value, label }))

export const INVOICE_TYPE_OPTIONS = Object.entries(INVOICE_TYPE_LABELS)
  .map(([value, label]) => ({ value, label }))

// ─── Costanti bollo ───────────────────────────────────────────────────────────

export const STAMP_DUTY_THRESHOLD = 77.47  // € — soglia obbligo bollo
export const STAMP_DUTY_AMOUNT    = 2.00   // € — valore fisso bollo

// ─── File generato ────────────────────────────────────────────────────────────

export interface GeneratedInvoiceFile {
  fileName: string
  fileBase64: string   // docx come base64
  generatedAt: string  // ISO datetime
  mimeType: string
}

// ─── Fattura ──────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string
  invoiceNumber: string          // progressivo/anno  es. "3/2026"
  patientId?: string             // id paziente nello storage (opzionale per fatture storiche)
  patientFiscalCode: string
  patientFirstName: string
  patientLastName: string
  azienda?: string               // solo per fattura elettronica
  description: string
  amount: number                 // importo in €
  stampDuty: number              // 0 oppure 2.00
  stampDutyNumber?: string       // numero bollo (obbligatorio se stampDuty > 0)
  status: InvoiceStatus
  issueDate: string              // ISO date YYYY-MM-DD
  invoiceType: InvoiceType
  generatedFile?: GeneratedInvoiceFile
  createdAt: string
  updatedAt: string
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>

// ─── Filtri ───────────────────────────────────────────────────────────────────

export interface InvoiceFilters {
  fiscalCode?: string
  invoiceNumber?: string
  patientLastName?: string
  description?: string
  status?: InvoiceStatus | ''
}

// ─── Query paginata ───────────────────────────────────────────────────────────

export interface InvoiceQuery {
  page: number
  pageSize: number
  filters: InvoiceFilters
}

export interface PaginatedInvoices {
  data: Invoice[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
}
