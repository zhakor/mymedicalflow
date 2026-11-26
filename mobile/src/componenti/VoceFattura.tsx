import { Eye } from 'lucide-react'
import { Badge } from '@desktop/components/ui/Badge'
import { downloadDocx } from '@desktop/lib/documentService'
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS, type Invoice } from '@desktop/types/fattura'
import { avvisa } from '../navigazione'
import { dataBreve } from '../schermate/formato'

export const euro = (n: number) => `€ ${n.toFixed(2).replace('.', ',')}`

/**
 * Apre il .docx generato. Nel browser è un download: iPhone lo mostra con
 * l'anteprima di sistema, Android lo passa a Word o Documenti.
 */
export async function apriFattura(f: Invoice): Promise<void> {
  if (!f.generatedFile) return
  try {
    await downloadDocx(f.generatedFile.fileBase64, f.generatedFile.fileName)
  } catch (err) {
    avvisa(err instanceof Error ? err.message : String(err), 'errore')
  }
}

export function VoceFattura({ fattura: f, conPaziente = false }: { fattura: Invoice; conPaziente?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-gray-900 dark:text-white">n. {f.invoiceNumber}</p>
          <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{euro(f.amount + (f.stampDuty ?? 0))}</p>
        </div>
        {conPaziente && (
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {f.patientLastName} {f.patientFirstName}
          </p>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{f.description}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-xs text-gray-400 mr-1">{dataBreve(f.issueDate)}</span>
          <Badge variant={f.status === 'pagata' ? 'success' : 'warning'}>{INVOICE_STATUS_LABELS[f.status]}</Badge>
          <Badge variant={f.invoiceType === 'elettronica' ? 'info' : 'muted'}>{INVOICE_TYPE_LABELS[f.invoiceType]}</Badge>
          {f.stampDuty > 0 && <span className="text-xs text-gray-400">bollo {euro(f.stampDuty)}</span>}
        </div>
      </div>
      {f.generatedFile && (
        <button
          onClick={() => apriFattura(f)}
          className="tocco flex items-center justify-center rounded-xl text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20"
          aria-label={`Apri la fattura ${f.invoiceNumber}`}
        >
          <Eye size={20} />
        </button>
      )}
    </div>
  )
}
