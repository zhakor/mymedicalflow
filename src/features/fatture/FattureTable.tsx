import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import type { Invoice, PaginatedInvoices } from '../../types/fattura'
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from '../../types/fattura'
import { FileText, Pencil, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

interface FattureTableProps {
  result: PaginatedInvoices
  hasActiveFilters: boolean
  onEdit: (invoice: Invoice) => void
  onView: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT')
}

function formatAmount(n: number): string {
  return `€ ${n.toFixed(2).replace('.', ',')}`
}

export function FattureTable({
  result,
  hasActiveFilters,
  onEdit,
  onView,
  onDelete,
  onPageChange,
  onPageSizeChange,
}: FattureTableProps) {
  const { data, page, totalPages, totalItems, pageSize } = result

  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 bg-teal-50 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center text-teal-500 mb-4">
          <FileText size={28} />
        </div>
        <p className="font-medium text-gray-700 dark:text-gray-300">
          {hasActiveFilters
            ? 'Nessuna fattura corrisponde ai filtri selezionati.'
            : 'Nessuna fattura trovata.'}
        </p>
        {!hasActiveFilters && (
          <p className="text-sm text-gray-400 mt-1">
            Aggiungi la prima fattura per iniziare.
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
              {[
                'Num. Fattura',
                'Cod. Fiscale',
                'Nome',
                'Cognome',
                'Importo',
                'Bollo',
                'Num. Bollo',
                'Stato',
                'Data Emissione',
                'Tipo',
                'Azioni',
              ].map((col, i, arr) => (
                <th
                  key={col}
                  className={clsx(
                    'px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap',
                    i === arr.length - 1 && 'sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700',
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {data.map((inv) => (
              <tr
                key={inv.id}
                className={clsx(
                  'transition-colors',
                  inv.status === 'in_attesa'
                    ? 'bg-red-50/70 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40',
                )}
              >
                <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {inv.invoiceNumber}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {inv.invoiceType === 'elettronica'
                    ? (inv.azienda || '—')
                    : (inv.patientFiscalCode || '—')}
                </td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {inv.patientFirstName}
                </td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {inv.patientLastName}
                </td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap font-medium">
                  {formatAmount(inv.amount)}
                </td>
                <td className="px-3 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {inv.stampDuty > 0 ? formatAmount(inv.stampDuty) : '—'}
                </td>
                <td className="px-3 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {inv.stampDutyNumber || '—'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Badge
                    variant={inv.status === 'pagata' ? 'success' : 'warning'}
                  >
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {formatDate(inv.issueDate)}
                </td>
                <td className="px-3 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  <Badge variant={inv.invoiceType === 'elettronica' ? 'info' : 'muted'}>
                    {INVOICE_TYPE_LABELS[inv.invoiceType]}
                  </Badge>
                </td>
                <td className="px-3 py-3 whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(inv)}
                      disabled={!inv.generatedFile}
                      title={inv.generatedFile ? 'Apri fattura generata' : 'Fattura non ancora generata'}
                      className={clsx(
                        inv.generatedFile
                          ? 'text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'
                          : 'text-gray-300 dark:text-gray-600',
                      )}
                    >
                      <Eye size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(inv)}
                      title="Modifica"
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(inv)}
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
            {start}–{end} di {totalItems} fatture
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
                <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">…</span>
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
