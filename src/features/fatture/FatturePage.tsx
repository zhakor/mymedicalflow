import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useFatturaStore } from '../../stores/fatturaStore'
import { useImpostazioniStore } from '../../stores/impostazioniStore'
import { FattureFilters } from './FattureFilters'
import { FattureTable } from './FattureTable'
import { FatturaModal } from './FatturaModal'
import { DeleteInvoiceConfirm } from './DeleteInvoiceConfirm'
import type { Invoice, InvoiceFilters } from '../../types/fattura'
import { downloadDocx } from '../../lib/documentService'
import { Plus } from 'lucide-react'
import { clsx } from 'clsx'

export function FatturePage() {
  const {
    result,
    query,
    feedbackMessage,
    feedbackType,
    loadInvoices,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    deleteInvoice,
    showFeedback,
  } = useFatturaStore()

  const { impostazioni } = useImpostazioniStore()
  const templateBase64 = impostazioni.templateFattura?.contenuto

  const [modalOpen, setModalOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  function hasActiveFilters(): boolean {
    const f = query.filters
    return !!(
      f.fiscalCode ||
      f.invoiceNumber ||
      f.patientLastName ||
      f.description ||
      f.status
    )
  }

  function handleSearch(filters: InvoiceFilters) {
    setFilters(filters)
  }

  function handleReset() {
    resetFilters()
  }

  function handleEdit(invoice: Invoice) {
    setEditingInvoice(invoice)
    setModalOpen(true)
  }

  async function handleView(invoice: Invoice) {
    if (!invoice.generatedFile) {
      showFeedback('Fattura non ancora generata.', 'error')
      return
    }
    try {
      await downloadDocx(invoice.generatedFile.fileBase64, invoice.generatedFile.fileName, impostazioni.cartellaSalvataggio)
      showFeedback(`File aperto: ${invoice.generatedFile.fileName}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showFeedback(msg, 'error')
    }
  }

  function handleDeleteRequest(invoice: Invoice) {
    setDeletingInvoice(invoice)
  }

  function handleDeleteConfirm() {
    if (deletingInvoice) {
      deleteInvoice(deletingInvoice.id)
      setDeletingInvoice(null)
    }
  }

  function handleModalClose() {
    setModalOpen(false)
    setEditingInvoice(null)
  }

  function handleSaved(message: string) {
    handleModalClose()
    loadInvoices()
    showFeedback(message)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Fatture
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Gestione fatture
          </h2>
        </div>
        <Button
          onClick={() => {
            setEditingInvoice(null)
            setModalOpen(true)
          }}
        >
          <Plus size={16} />
          Aggiungi fattura
        </Button>
      </div>

      {/* Feedback */}
      {feedbackMessage && (
        <div
          className={clsx(
            'px-4 py-3 rounded-xl flex items-center gap-2 text-sm border',
            feedbackType === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400',
          )}
        >
          {feedbackMessage}
        </div>
      )}

      {/* Filtri */}
      <FattureFilters onSearch={handleSearch} onReset={handleReset} />

      {/* Tabella */}
      <FattureTable
        result={result}
        hasActiveFilters={hasActiveFilters()}
        onEdit={handleEdit}
        onView={handleView}
        onDelete={handleDeleteRequest}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Modale creazione/modifica */}
      {modalOpen && (
        <FatturaModal
          invoice={editingInvoice}
          templateBase64={templateBase64}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}

      {/* Conferma cancellazione */}
      {deletingInvoice && (
        <DeleteInvoiceConfirm
          invoice={deletingInvoice}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingInvoice(null)}
        />
      )}
    </div>
  )
}
