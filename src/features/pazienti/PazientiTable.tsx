import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import type { Patient, PaginatedResult } from '../../types/paziente'
import { GENDER_LABELS } from '../../types/paziente'
import { FolderOpen, Pencil, Trash2, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { clsx } from 'clsx'

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

interface PazientiTableProps {
  result: PaginatedResult<Patient>
  hasActiveFilters: boolean
  onOpenCartella: (patient: Patient) => void
  onEdit: (patient: Patient) => void
  onDelete: (patient: Patient) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT')
}

export function PazientiTable({
  result,
  hasActiveFilters,
  onOpenCartella,
  onEdit,
  onDelete,
  onPageChange,
  onPageSizeChange,
}: PazientiTableProps) {
  const { data, page, totalPages, totalItems, pageSize } = result

  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 bg-teal-50 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center text-teal-500 mb-4">
          <Users size={28} />
        </div>
        <p className="font-medium text-gray-700 dark:text-gray-300">
          {hasActiveFilters
            ? 'Nessun paziente corrisponde ai filtri selezionati.'
            : 'Nessun paziente trovato.'}
        </p>
        {!hasActiveFilters && (
          <p className="text-sm text-gray-400 mt-1">
            Aggiungi il primo paziente per iniziare.
          </p>
        )}
      </Card>
    )
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <Card padding="sm">
      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {[
                'Codice fiscale',
                'Cognome',
                'Nome',
                'Cellulare',
                'Data di nascita',
                'Sesso',
                'Età evol.',
                'Azioni',
              ].map((col, i, arr) => (
                <th
                  key={col}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap',
                    i === arr.length - 1 && 'sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700',
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {data.map((p) => (
              <tr
                key={p.id}
                className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {p.fiscalCode || '—'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {p.lastName}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {p.firstName}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {p.phoneNumber || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {p.birthDate ? formatDate(p.birthDate) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {p.gender ? GENDER_LABELS[p.gender] : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.developmentalAge ? (
                    <Badge variant="info">Sì</Badge>
                  ) : (
                    <Badge variant="muted">No</Badge>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenCartella(p)}
                      title="Cartella clinica"
                      className="text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    >
                      <FolderOpen size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(p)}
                      title="Modifica"
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(p)}
                      title="Elimina"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer paginazione */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 px-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400">
            {start}–{end} di {totalItems} pazienti
          </p>
          <span className="text-gray-200 dark:text-gray-700 select-none">|</span>
          <span className="text-xs text-gray-400">Righe:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={16} />
          </Button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | '...')[]>((acc, p, i, arr) => {
              if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
              acc.push(p)
              return acc
            }, [])
            .map((item, i) =>
              item === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => onPageChange(item as number)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    item === page
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {item}
                </button>
              ),
            )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </Card>
  )
}
