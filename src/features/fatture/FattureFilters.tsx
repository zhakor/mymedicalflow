import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { InvoiceFilters } from '../../types/fattura'
import {
  INVOICE_SISTEMA_TS_FILTER_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
} from '../../types/fattura'
import { EMPTY_INVOICE_FILTERS } from './fatturaValidation'
import { Search, RotateCcw } from 'lucide-react'

// La voce vuota la mette il `Select`: qui basta darle un nome sensato.

interface FattureFiltersProps {
  onSearch: (filters: InvoiceFilters) => void
  onReset: () => void
}

export function FattureFilters({ onSearch, onReset }: FattureFiltersProps) {
  const [form, setForm] = useState<InvoiceFilters>({ ...EMPTY_INVOICE_FILTERS })

  function handleChange(field: keyof InvoiceFilters, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    onSearch(form)
  }

  function handleReset() {
    setForm({ ...EMPTY_INVOICE_FILTERS })
    onReset()
  }

  const periodoRovesciato =
    !!form.issuedFrom && !!form.issuedTo && form.issuedFrom > form.issuedTo

  return (
    <Card padding="sm">
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
          <Input
            label="Cognome paziente"
            placeholder="Es. Rossi"
            value={form.patientLastName ?? ''}
            onChange={(e) => handleChange('patientLastName', e.target.value)}
          />
          <Input
            label="Codice fiscale"
            placeholder="Es. RSS..."
            value={form.fiscalCode ?? ''}
            onChange={(e) => handleChange('fiscalCode', e.target.value)}
          />
          <Input
            label="Numero fattura"
            placeholder="Es. 1/2026"
            value={form.invoiceNumber ?? ''}
            onChange={(e) => handleChange('invoiceNumber', e.target.value)}
          />
          <Select
            label="Stato"
            placeholder="Tutti gli stati"
            options={INVOICE_STATUS_OPTIONS}
            value={form.status ?? ''}
            onChange={(e) => handleChange('status', e.target.value)}
          />
          <Select
            label="Tipo fattura"
            placeholder="Tutti i tipi"
            options={INVOICE_TYPE_OPTIONS}
            value={form.invoiceType ?? ''}
            onChange={(e) => handleChange('invoiceType', e.target.value)}
          />
          <Select
            label="Sistema TS"
            placeholder="Tutte"
            options={INVOICE_SISTEMA_TS_FILTER_OPTIONS}
            value={form.sistemaTs ?? ''}
            onChange={(e) => handleChange('sistemaTs', e.target.value)}
          />
          <Input
            label="Emesse dal"
            type="date"
            value={form.issuedFrom ?? ''}
            onChange={(e) => handleChange('issuedFrom', e.target.value)}
          />
          <Input
            label="Emesse al"
            type="date"
            value={form.issuedTo ?? ''}
            onChange={(e) => handleChange('issuedTo', e.target.value)}
          />
        </div>

        {/* Un periodo rovesciato non restituirebbe nulla senza spiegare perché */}
        {periodoRovesciato && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            La data iniziale è successiva a quella finale: nessuna fattura può rientrare
            in questo periodo.
          </p>
        )}

        <div className="flex gap-2 mt-4 justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
            <RotateCcw size={14} />
            Reset
          </Button>
          <Button type="submit" size="sm">
            <Search size={14} />
            Cerca
          </Button>
        </div>
      </form>
    </Card>
  )
}
