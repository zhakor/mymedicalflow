import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { AlertTriangle, X } from 'lucide-react'
import type { RiepilogoCopia } from '../../lib/backupService'

interface RipristinoConfirmProps {
  etichetta: string
  creatoIl: number | null
  riepilogo: RiepilogoCopia
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function Riga({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">
        {value}
      </span>
    </div>
  )
}

export function RipristinoConfirm({
  etichetta,
  creatoIl,
  riepilogo,
  loading,
  onConfirm,
  onCancel,
}: RipristinoConfirmProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, loading])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">Ripristina copia</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-words">
              {etichetta}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
          {creatoIl !== null && (
            <Riga label="Creata il" value={new Date(creatoIl).toLocaleString('it-IT')} />
          )}
          <Riga label="Pazienti" value={String(riepilogo.pazienti)} />
          <Riga label="Appuntamenti" value={String(riepilogo.appuntamenti)} />
          <Riga label="Fatture" value={String(riepilogo.fatture)} />
          <Riga label="Profilo" value={riepilogo.profilo ?? 'Non incluso'} />
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          Tutti i dati attualmente presenti verranno{' '}
          <span className="font-medium text-gray-900 dark:text-white">sostituiti</span> con
          quelli di questa copia.
          <span className="text-red-500 text-xs mt-1 block">
            Questa azione non può essere annullata.
          </span>
        </p>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Annulla
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            Ripristina
          </Button>
        </div>
      </div>
    </div>
  )
}
