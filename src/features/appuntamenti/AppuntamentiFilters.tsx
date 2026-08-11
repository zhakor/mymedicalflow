import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { servizioService } from '../../lib/servizioService'
import type { AppointmentFilters, StatoPresenza } from '../../types/appuntamento'
import { STATO_PRESENZA_LABELS } from '../../types/appuntamento'
import { EMPTY_APPOINTMENT_FILTERS } from './appuntamentoValidation'
import { Search, RotateCcw } from 'lucide-react'

const OPZIONI_PRESENZA = [
  { value: '', label: 'Tutte' },
  ...(Object.keys(STATO_PRESENZA_LABELS) as StatoPresenza[]).map((v) => ({
    value: v,
    label: STATO_PRESENZA_LABELS[v],
  })),
]

interface AppuntamentiFiltersProps {
  onSearch: (filters: AppointmentFilters) => void
  onReset: () => void
}

export function AppuntamentiFilters({ onSearch, onReset }: AppuntamentiFiltersProps) {
  const [form, setForm] = useState<AppointmentFilters>({ ...EMPTY_APPOINTMENT_FILTERS })

  // Letti al montaggio e non a livello di modulo, altrimenti un servizio
  // creato nelle Impostazioni non comparirebbe fino al riavvio.
  // Anche i dismessi restano filtrabili: lo storico li contiene ancora.
  const opzioniServizio = useMemo(
    () => [
      { value: '', label: 'Tutti i servizi' },
      ...servizioService.getAll().map((s) => ({ value: s.id, label: s.nome })),
    ],
    [],
  )

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
            label="Servizio"
            options={opzioniServizio}
            value={form.serviceId ?? ''}
            onChange={(e) => handleChange('serviceId', e.target.value)}
          />
          <Select
            label="Presenza"
            options={OPZIONI_PRESENZA}
            value={form.presenza ?? ''}
            onChange={(e) => handleChange('presenza', e.target.value)}
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
