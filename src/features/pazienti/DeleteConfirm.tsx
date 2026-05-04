import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, X } from 'lucide-react'

interface DeleteConfirmProps {
  nome: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirm({ nome, onConfirm, onCancel }: DeleteConfirmProps) {
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={18} />
            <h2 className="font-semibold">Elimina paziente</h2>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sei sicuro di voler eliminare il paziente{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{nome}</span>?
            <br />
            Questa azione non può essere annullata.
          </p>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={onCancel}>
              Annulla
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              Elimina
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
