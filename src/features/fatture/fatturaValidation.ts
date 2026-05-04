import type { InvoiceInput, InvoiceFilters } from '../../types/fattura'
import { fatturaService } from '../../lib/fatturaService'

export interface InvoiceFormErrors {
  invoiceType?: string
  invoiceNumber?: string
  patientFirstName?: string
  patientLastName?: string
  patientFiscalCode?: string
  azienda?: string
  description?: string
  amount?: string
  status?: string
  issueDate?: string
  stampDutyNumber?: string
}

export function validateInvoice(
  input: Partial<InvoiceInput>,
  excludeId?: string,
): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {}

  if (!input.invoiceType) errors.invoiceType = 'Il tipo fattura è obbligatorio.'
  if (!input.invoiceNumber?.trim()) {
    errors.invoiceNumber = 'Il numero fattura è obbligatorio.'
  } else if (fatturaService.isDuplicateNumber(input.invoiceNumber.trim(), excludeId)) {
    errors.invoiceNumber = `Il numero "${input.invoiceNumber}" è già in uso per questo anno.`
  }

  if (!input.issueDate) errors.issueDate = 'La data di emissione è obbligatoria.'

  if (input.amount === undefined || input.amount === null || isNaN(input.amount)) {
    errors.amount = "L'importo deve essere un numero valido."
  } else if (input.amount <= 0) {
    errors.amount = "L'importo deve essere maggiore di 0."
  }

  if (input.invoiceType === 'elettronica') {
    // Per fatture elettroniche: solo azienda obbligatoria
    if (!input.azienda?.trim()) errors.azienda = "Il nome azienda è obbligatorio."
  } else {
    // Per fatture cartacee: campi paziente e descrizione obbligatori
    if (!input.patientFirstName?.trim()) errors.patientFirstName = 'Il nome è obbligatorio.'
    if (!input.patientLastName?.trim()) errors.patientLastName = 'Il cognome è obbligatorio.'
    if (!input.patientFiscalCode?.trim())
      errors.patientFiscalCode = 'Il codice fiscale è obbligatorio.'
    if (!input.description?.trim()) errors.description = 'La descrizione è obbligatoria.'
    if (!input.status) errors.status = 'Lo stato è obbligatorio.'
    // Bollo
    if (input.stampDuty && input.stampDuty > 0 && !input.stampDutyNumber?.trim()) {
      errors.stampDutyNumber = 'Il numero bollo è obbligatorio se il bollo è presente.'
    }
  }

  return errors
}

export function hasInvoiceErrors(errors: InvoiceFormErrors): boolean {
  return Object.keys(errors).length > 0
}

export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  fiscalCode: '',
  invoiceNumber: '',
  patientLastName: '',
  description: '',
  status: '',
}
