import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, X } from 'lucide-react'
import type { Invoice } from '../../types/fattura'

interface DeleteInvoiceConfirmProps {
  invoice: Invoice
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteInvoiceConfirm({ invoice, onConfirm, onCancel }: DeleteInvoiceConfirmProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Elimina fattura
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Sei sicuro di voler eliminare la fattura{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                n° {invoice.invoiceNumber}
              </span>{' '}
              intestata a{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {invoice.patientFirstName} {invoice.patientLastName}
              </span>
              ?<br />
              <span className="text-red-500 text-xs mt-1 block">
                Questa azione non può essere annullata.
              </span>
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
          >
            Elimina
          </Button>
        </div>
      </div>
    </div>
  )
}
