import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import type { Appointment, PaginatedAppointments } from '../../types/appuntamento'
import { APPOINTMENT_TYPE_LABELS } from '../../types/appuntamento'
import { Calendar, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

interface AppuntamentiTableProps {
  result: PaginatedAppointments
  hasActiveFilters: boolean
  onEdit: (appointment: Appointment) => void
  onDelete: (appointment: Appointment) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT')
}

export function AppuntamentiTable({
  result,
  hasActiveFilters,
  onEdit,
  onDelete,
  onPageChange,
  onPageSizeChange,
}: AppuntamentiTableProps) {
  const { data, page, totalPages, totalItems, pageSize } = result

  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 bg-teal-50 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center text-teal-500 mb-4">
          <Calendar size={28} />
        </div>
        <p className="font-medium text-gray-700 dark:text-gray-300">
          {hasActiveFilters
            ? 'Nessun appuntamento corrisponde ai filtri selezionati.'
            : 'Nessun appuntamento trovato.'}
        </p>
        {!hasActiveFilters && (
          <p className="text-sm text-gray-400 mt-1">
            Aggiungi il primo appuntamento per iniziare.
          </p>
        )}
      </Card>
    )
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <Card padding="sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {['Cognome', 'Nome', 'Tipo', 'Data', 'Ora', 'Descrizione', 'Azioni'].map((col, i, arr) => (
                <th
                  key={col}
                  className={clsx(
                    'px-3 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap',
                    i === arr.length - 1 && 'sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700',
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {data.map((a) => (
              <tr
                key={a.id}
                className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {a.patientLastName}
                </td>
                <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {a.patientFirstName}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Badge variant={a.appointmentType === 'valutazione' ? 'info' : 'success'}>
                    {APPOINTMENT_TYPE_LABELS[a.appointmentType]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {formatDate(a.appointmentDate)}
                </td>
                <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {a.appointmentTime}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[220px] truncate">
                  {a.description || '—'}
                </td>
                <td className="px-3 py-2.5 sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(a)}
                      title="Modifica"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(a)}
                      title="Elimina"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginazione */}
      <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Righe:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>
            {start}–{end} di {totalItems}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              page <= 1
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              page >= totalPages
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Card>
  )
}
