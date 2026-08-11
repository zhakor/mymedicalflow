import type { DatiSistemaTs } from './sistemaTs'

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
  /**
   * Dati richiesti dal Sistema Tessera Sanitaria.
   * La presenza di questo oggetto significa "soggetta a trasmissione": non è
   * un terzo tipo di fattura, che resta cartacea o elettronica.
   * Lo stato della trasmissione vive a parte, in `TrasmissioneTs`.
   */
  sistemaTs?: DatiSistemaTs
  createdAt: string
  updatedAt: string
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>

// ─── Filtri ───────────────────────────────────────────────────────────────────

/**
 * Filtro sullo stato rispetto al Sistema TS.
 *
 * `soggette` raccoglie tutte le fatture per cui è prevista la trasmissione,
 * qualunque sia il punto in cui si trovano; le altre voci corrispondono a uno
 * stato preciso. `non_previste` serve a trovare le fatture rimaste fuori.
 */
export type InvoiceSistemaTsFilter =
  | ''
  | 'soggette'
  | 'da_inviare'
  | 'trasmesse'
  | 'errore'
  | 'non_previste'

export const INVOICE_SISTEMA_TS_FILTER_OPTIONS = [
  { value: 'soggette', label: 'Soggette alla trasmissione' },
  { value: 'da_inviare', label: 'Da inviare' },
  { value: 'trasmesse', label: 'Trasmesse' },
  { value: 'errore', label: 'In errore' },
  { value: 'non_previste', label: 'Non previste' },
]

export interface InvoiceFilters {
  fiscalCode?: string
  invoiceNumber?: string
  patientLastName?: string
  status?: InvoiceStatus | ''
  invoiceType?: InvoiceType | ''
  sistemaTs?: InvoiceSistemaTsFilter
  /** Estremi inclusi, sulla data di emissione. */
  issuedFrom?: string
  issuedTo?: string
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
