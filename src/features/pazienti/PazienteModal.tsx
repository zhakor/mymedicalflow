import { useState, useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { Patient, PatientInput, Gender } from '../../types/paziente'
import { GENDER_OPTIONS } from '../../types/paziente'
import {
  validatePatient,
  hasErrors,
  type PatientFormErrors,
} from './pazienteValidation'
import { pazienteService } from '../../lib/pazienteService'
import { X, Users } from 'lucide-react'
import { clsx } from 'clsx'

interface PazienteModalProps {
  patient?: Patient | null   // se presente → modalità modifica
  onClose: () => void
  onSaved: (message: string) => void
}

type FormState = Omit<PatientInput, 'developmentalAge' | 'guardian'> & {
  developmentalAge: boolean
  guardianFirstName: string
  guardianLastName: string
  guardianFiscalCode: string
  guardianPhone: string
  guardianGender: string
  guardianBirthDate: string
  guardianAddress: string
  guardianPostalCode: string
  guardianCity: string
  guardianProvince: string
  address: string
  postalCode: string
  city: string
  province: string
  notes: string
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  fiscalCode: '',
  phoneNumber: '',
  gender: '' as Gender,
  birthDate: '',
  developmentalAge: false,
  guardianFirstName: '',
  guardianLastName: '',
  guardianFiscalCode: '',
  guardianPhone: '',
  guardianGender: '',
  guardianBirthDate: '',
  guardianAddress: '',
  guardianPostalCode: '',
  guardianCity: '',
  guardianProvince: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  notes: '',
}

function patientToForm(p: Patient): FormState {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    fiscalCode: p.fiscalCode ?? '',
    phoneNumber: p.phoneNumber ?? '',
    gender: p.gender ?? ('' as Gender),
    birthDate: p.birthDate ?? '',
    developmentalAge: p.developmentalAge,
    guardianFirstName: p.guardian?.firstName ?? '',
    guardianLastName: p.guardian?.lastName ?? '',
    guardianFiscalCode: p.guardian?.fiscalCode ?? '',
    guardianPhone: p.guardian?.phoneNumber ?? '',
    guardianGender: p.guardian?.gender ?? '',
    guardianBirthDate: p.guardian?.birthDate ?? '',
    guardianAddress: p.guardian?.address ?? '',
    guardianPostalCode: p.guardian?.postalCode ?? '',
    guardianCity: p.guardian?.city ?? '',
    guardianProvince: p.guardian?.province ?? '',
    address: p.address ?? '',
    postalCode: p.postalCode ?? '',
    city: p.city ?? '',
    province: p.province ?? '',
    notes: p.notes ?? '',
  }
}

function formToInput(form: FormState): PatientInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    fiscalCode: form.fiscalCode?.trim().toUpperCase() || undefined,
    phoneNumber: form.phoneNumber?.trim() || undefined,
    gender: (form.gender as Gender) || undefined,
    birthDate: form.birthDate || undefined,
    developmentalAge: form.developmentalAge,
    address: form.address.trim() || undefined,
    postalCode: form.postalCode.trim() || undefined,
    city: form.city.trim() || undefined,
    province: form.province.trim().toUpperCase() || undefined,
    notes: form.notes.trim() || undefined,
    guardian: form.developmentalAge
      ? {
          firstName: form.guardianFirstName.trim(),
          lastName: form.guardianLastName.trim(),
          fiscalCode: form.guardianFiscalCode.trim().toUpperCase() || undefined,
          phoneNumber: form.guardianPhone.trim() || undefined,
          gender: (form.guardianGender as Gender) || undefined,
          birthDate: form.guardianBirthDate || undefined,
          address: form.guardianAddress.trim() || undefined,
          postalCode: form.guardianPostalCode.trim() || undefined,
          city: form.guardianCity.trim() || undefined,
          province: form.guardianProvince.trim().toUpperCase() || undefined,
        }
      : undefined,
  }
}

export function PazienteModal({ patient, onClose, onSaved }: PazienteModalProps) {
  const isEdit = !!patient
  const [form, setForm] = useState<FormState>(
    patient ? patientToForm(patient) : EMPTY_FORM,
  )
  const [errors, setErrors] = useState<PatientFormErrors>({})
  const [saving, setSaving] = useState(false)

  // Chiudi con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field as keyof PatientFormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = formToInput(form)
    const errs = validatePatient(input)
    if (hasErrors(errs)) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        pazienteService.update(patient!.id, input)
        onSaved('Paziente aggiornato con successo.')
      } else {
        pazienteService.create(input)
        onSaved('Paziente aggiunto con successo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
        {/* Header modale */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Modifica paziente' : 'Aggiungi paziente'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Dati anagrafici */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Dati anagrafici
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nome"
                required
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                error={errors.firstName}
              />
              <Input
                label="Cognome"
                required
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                error={errors.lastName}
              />
              <Input
                label="Codice fiscale"
                required
                placeholder="Es. RSSMRA80A01H501U"
                value={form.fiscalCode}
                onChange={(e) => set('fiscalCode', e.target.value.toUpperCase())}
                error={errors.fiscalCode}
                className="uppercase"
              />
              <Input
                label="Numero cellulare"
                required={!form.developmentalAge}
                placeholder="Es. 3331234567"
                value={form.phoneNumber}
                onChange={(e) => set('phoneNumber', e.target.value)}
                error={errors.phoneNumber}
              />
              <Select
                label="Sesso"
                required
                options={GENDER_OPTIONS}
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                error={errors.gender}
              />
              <Input
                label="Data di nascita"
                type="date"
                required
                value={form.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
                error={errors.birthDate}
              />
            </div>
          </div>

          {/* Residenza */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Residenza
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Input
                  label="Indirizzo"
                  required={!form.developmentalAge}
                  placeholder="Es. Via Roma 12"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  error={errors.address}
                />
              </div>
              <Input
                label="CAP"
                required={!form.developmentalAge}
                placeholder="Es. 20100"
                inputMode="numeric"
                maxLength={5}
                value={form.postalCode}
                onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                error={errors.postalCode}
              />
              <Input
                label="Città"
                required={!form.developmentalAge}
                placeholder="Es. Milano"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                error={errors.city}
              />
              <Input
                label="Provincia"
                required={!form.developmentalAge}
                placeholder="Es. MI"
                maxLength={2}
                value={form.province}
                onChange={(e) => set('province', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                error={errors.province}
              />
            </div>
          </div>

          {/* Età evolutiva — toggle row */}
          <button
            type="button"
            role="switch"
            aria-checked={form.developmentalAge}
            onClick={() => set('developmentalAge', !form.developmentalAge)}
            className={clsx(
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors duration-200 cursor-pointer',
              form.developmentalAge
                ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            )}
          >
            <div className="flex items-center gap-3">
              <Users
                size={16}
                className={clsx(
                  'transition-colors',
                  form.developmentalAge ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400',
                )}
              />
              <span className={clsx(
                'text-sm font-medium transition-colors',
                form.developmentalAge ? 'text-teal-700 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400',
              )}>
                Età evolutiva
                <span className={clsx(
                  'ml-1.5 text-xs font-normal',
                  form.developmentalAge ? 'text-teal-500 dark:text-teal-400' : 'text-gray-400',
                )}>
                  (paziente minorenne con tutore)
                </span>
              </span>
            </div>
            {/* Toggle pill */}
            <div className={clsx(
              'relative w-10 h-[22px] rounded-full transition-colors duration-200 flex-shrink-0 overflow-hidden',
              form.developmentalAge ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600',
            )}>
              <span className={clsx(
                'absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full transition-transform duration-200',
                form.developmentalAge ? 'translate-x-[18px]' : 'translate-x-0',
              )} />
            </div>
          </button>

          {/* Sezione tutore */}
          {form.developmentalAge && (
            <div className="bg-teal-50/50 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-800/50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide">
                Dati tutore
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nome tutore"
                  required
                  value={form.guardianFirstName}
                  onChange={(e) => set('guardianFirstName', e.target.value)}
                  error={errors.guardianFirstName}
                />
                <Input
                  label="Cognome tutore"
                  required
                  value={form.guardianLastName}
                  onChange={(e) => set('guardianLastName', e.target.value)}
                  error={errors.guardianLastName}
                />
                <Input
                  label="Codice fiscale tutore"
                  placeholder="Es. RSSMRA80A01H501U"
                  value={form.guardianFiscalCode}
                  onChange={(e) => set('guardianFiscalCode', e.target.value.toUpperCase())}
                  className="uppercase"
                />
                <Input
                  label="Cellulare tutore"
                  required
                  placeholder="Es. 3331234567"
                  value={form.guardianPhone}
                  onChange={(e) => set('guardianPhone', e.target.value)}
                  error={errors.guardianPhone}
                />
                <Select
                  label="Sesso tutore"
                  options={GENDER_OPTIONS}
                  value={form.guardianGender}
                  onChange={(e) => set('guardianGender', e.target.value)}
                />
                <Input
                  label="Data di nascita tutore"
                  type="date"
                  value={form.guardianBirthDate}
                  onChange={(e) => set('guardianBirthDate', e.target.value)}
                />
              </div>

              {/* Residenza tutore */}
              <div>
                <p className="text-xs font-semibold text-teal-600 dark:text-teal-500 uppercase tracking-wide mb-3">
                  Residenza tutore
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Input
                      label="Indirizzo"
                      placeholder="Es. Via Roma 12"
                      value={form.guardianAddress}
                      onChange={(e) => set('guardianAddress', e.target.value)}
                    />
                  </div>
                  <Input
                    label="CAP"
                    placeholder="Es. 20100"
                    inputMode="numeric"
                    maxLength={5}
                    value={form.guardianPostalCode}
                    onChange={(e) => set('guardianPostalCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                  <Input
                    label="Città"
                    placeholder="Es. Milano"
                    value={form.guardianCity}
                    onChange={(e) => set('guardianCity', e.target.value)}
                  />
                  <Input
                    label="Provincia"
                    placeholder="Es. MI"
                    maxLength={2}
                    value={form.guardianProvince}
                    onChange={(e) => set('guardianProvince', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Note
            </p>
            <textarea
              placeholder="Annotazioni cliniche, anamnesi, informazioni aggiuntive..."
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200 resize-none text-sm"
            />
          </div>

          {/* Footer form */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={saving} disabled={saving}>
              {isEdit ? 'Salva modifiche' : 'Salva paziente'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
