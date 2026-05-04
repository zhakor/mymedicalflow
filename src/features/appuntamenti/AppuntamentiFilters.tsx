import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { AppointmentFilters } from '../../types/appuntamento'
import { EMPTY_APPOINTMENT_FILTERS } from './appuntamentoValidation'
import { Search, RotateCcw } from 'lucide-react'

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'valutazione', label: 'Valutazione' },
  { value: 'sessione', label: 'Sessione' },
]

interface AppuntamentiFiltersProps {
  onSearch: (filters: AppointmentFilters) => void
  onReset: () => void
}

export function AppuntamentiFilters({ onSearch, onReset }: AppuntamentiFiltersProps) {
  const [form, setForm] = useState<AppointmentFilters>({ ...EMPTY_APPOINTMENT_FILTERS })

  function handleChange(field: keyof AppointmentFilters, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    onSearch(form)
  }

  function handleReset() {
    setForm({ ...EMPTY_APPOINTMENT_FILTERS })
    onReset()
  }

  return (
    <Card padding="sm">
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          <Input
            label="Data da"
            type="date"
            value={form.dateFrom ?? ''}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
          />
          <Input
            label="Data a"
            type="date"
            value={form.dateTo ?? ''}
            onChange={(e) => handleChange('dateTo', e.target.value)}
          />
          <Select
            label="Tipologia appuntamento"
            options={TYPE_FILTER_OPTIONS}
            value={form.appointmentType ?? ''}
            onChange={(e) => handleChange('appointmentType', e.target.value)}
          />
          <Input
            label="Cognome paziente"
            placeholder="Es. Rossi"
            value={form.patientLastName ?? ''}
            onChange={(e) => handleChange('patientLastName', e.target.value)}
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
