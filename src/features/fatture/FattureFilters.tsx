import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { InvoiceFilters } from '../../types/fattura'
import { INVOICE_STATUS_OPTIONS } from '../../types/fattura'
import { EMPTY_INVOICE_FILTERS } from './fatturaValidation'
import { Search, RotateCcw } from 'lucide-react'

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...INVOICE_STATUS_OPTIONS,
]

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
          <Input
            label="Descrizione"
            placeholder="Es. Seduta..."
            value={form.description ?? ''}
            onChange={(e) => handleChange('description', e.target.value)}
          />
          <Select
            label="Stato"
            options={STATUS_FILTER_OPTIONS}
            value={form.status ?? ''}
            onChange={(e) => handleChange('status', e.target.value)}
          />
        </div>

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
