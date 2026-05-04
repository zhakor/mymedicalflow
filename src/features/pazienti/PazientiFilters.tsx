import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { PatientFilters, Gender } from '../../types/paziente'
import { GENDER_OPTIONS } from '../../types/paziente'
import { EMPTY_FILTERS } from './pazienteValidation'
import { Search, RotateCcw } from 'lucide-react'

const DEVELOPMENTAL_AGE_OPTIONS = [
  { value: '', label: 'Tutti' },
  { value: 'true', label: 'Sì' },
  { value: 'false', label: 'No' },
]

const GENDER_FILTER_OPTIONS = [
  { value: '', label: 'Tutti' },
  ...GENDER_OPTIONS,
]

interface PazientiFiltersProps {
  onSearch: (filters: PatientFilters) => void
  onReset: () => void
}

export function PazientiFilters({ onSearch, onReset }: PazientiFiltersProps) {
  const [form, setForm] = useState<PatientFilters>({ ...EMPTY_FILTERS })

  function handleChange(field: keyof PatientFilters, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const filters: PatientFilters = {
      ...form,
      gender: (form.gender as Gender) || undefined,
      developmentalAge:
        form.developmentalAge === null || form.developmentalAge === undefined || (form.developmentalAge as unknown as string) === ''
          ? null
          : (form.developmentalAge as unknown as string) === 'true',
    }
    onSearch(filters)
  }

  function handleReset() {
    setForm({ ...EMPTY_FILTERS })
    onReset()
  }

  return (
    <Card padding="sm">
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
          <Input
            label="Nome"
            placeholder="Es. Maria"
            value={form.firstName ?? ''}
            onChange={(e) => handleChange('firstName', e.target.value)}
          />
          <Input
            label="Cognome"
            placeholder="Es. Rossi"
            value={form.lastName ?? ''}
            onChange={(e) => handleChange('lastName', e.target.value)}
          />
          <Input
            label="Codice fiscale"
            placeholder="Es. RSSMRA…"
            value={form.fiscalCode ?? ''}
            onChange={(e) => handleChange('fiscalCode', e.target.value)}
          />
          <Select
            label="Sesso"
            options={GENDER_FILTER_OPTIONS}
            value={(form.gender as string) ?? ''}
            onChange={(e) => handleChange('gender', e.target.value)}
          />
          <Select
            label="Età evolutiva"
            options={DEVELOPMENTAL_AGE_OPTIONS}
            value={
              form.developmentalAge === null || form.developmentalAge === undefined
                ? ''
                : String(form.developmentalAge)
            }
            onChange={(e) => handleChange('developmentalAge', e.target.value)}
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
