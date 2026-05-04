import type { Patient } from '../../types/paziente'
import { GENDER_LABELS } from '../../types/paziente'
import { X, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useEffect } from 'react'

interface PazienteOmonimoModalProps {
  candidates: Patient[]
  onSelect: (patient: Patient) => void
  onClose: () => void
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT')
}

export function PazienteOmonimoModal({
  candidates,
  onSelect,
  onClose,
}: PazienteOmonimoModalProps) {
  // Chiudi con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-100 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-teal-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Più pazienti trovati — seleziona il paziente corretto
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista candidati */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {candidates.map((p) => {
            const address = [p.address, p.postalCode, p.city, p.province]
              .filter(Boolean)
              .join(', ')

            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {p.firstName} {p.lastName}
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
                      <span className="text-xs text-gray-500">
                        CF:{' '}
                        <span className="font-mono text-gray-700 dark:text-gray-300">
                          {p.fiscalCode || '—'}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        Nascita:{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatDate(p.birthDate)}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        Sesso:{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {p.gender ? GENDER_LABELS[p.gender] : '—'}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        Cellulare:{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {p.phoneNumber || '—'}
                        </span>
                      </span>
                      {address && (
                        <span className="text-xs text-gray-500 col-span-2">
                          Indirizzo:{' '}
                          <span className="text-gray-700 dark:text-gray-300">{address}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-teal-600 dark:text-teal-400 font-medium whitespace-nowrap mt-1">
                    Seleziona →
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Annulla
          </Button>
        </div>
      </div>
    </div>
  )
}
