import { useState, useEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { PazienteOmonimoModal } from '../fatture/PazienteOmonimoModal'
import { pazienteService } from '../../lib/pazienteService'
import type { Patient } from '../../types/paziente'
import type { Appointment, AppointmentInput, AppointmentType } from '../../types/appuntamento'
import { APPOINTMENT_TYPE_OPTIONS } from '../../types/appuntamento'
import {
  validateAppointment,
  hasAppointmentErrors,
} from './appuntamentoValidation'
import type { AppointmentFormErrors } from './appuntamentoValidation'
import { Calendar, X } from 'lucide-react'

// ─── Stato form ───────────────────────────────────────────────────────────────

interface FormState {
  patientFirstName: string
  patientLastName: string
  patientId: string
  appointmentType: string
  appointmentDate: string
  appointmentTime: string
  description: string
}

const EMPTY_FORM: FormState = {
  patientFirstName: '',
  patientLastName: '',
  patientId: '',
  appointmentType: '',
  appointmentDate: '',
  appointmentTime: '',
  description: '',
}

function appointmentToForm(a: Appointment): FormState {
  return {
    patientFirstName: a.patientFirstName,
    patientLastName: a.patientLastName,
    patientId: a.patientId,
    appointmentType: a.appointmentType,
    appointmentDate: a.appointmentDate,
    appointmentTime: a.appointmentTime,
    description: a.description ?? '',
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppuntamentoModalProps {
  appointment?: Appointment | null
  onClose: () => void
  onSaved: (message: string) => void
  onSave: (input: AppointmentInput, id?: string) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AppuntamentoModal({
  appointment,
  onClose,
  onSaved,
  onSave,
}: AppuntamentoModalProps) {
  const isEdit = !!appointment

  const [form, setFormState] = useState<FormState>(
    appointment
      ? appointmentToForm(appointment)
      : {
          ...EMPTY_FORM,
          appointmentDate: new Date().toISOString().slice(0, 10),
        },
  )
  const [errors, setErrors] = useState<AppointmentFormErrors>({})
  const [saving, setSaving] = useState(false)

  // Ricerca paziente / omonimi
  const [omonimoCandidates, setOmonimoCandidates] = useState<Patient[]>([])
  const [showOmonimoModal, setShowOmonimoModal] = useState(false)
  const userTypedName = useRef(false)

  // Chiudi con Escape (solo se l'omonimo modal non è aperto)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showOmonimoModal) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showOmonimoModal])

  // Ricerca automatica paziente per nome + cognome
  useEffect(() => {
    if (!userTypedName.current) return
    const firstName = form.patientFirstName.trim()
    const lastName = form.patientLastName.trim()
    if (!firstName || !lastName) return

    const results = pazienteService.getPatients({
      page: 1,
      pageSize: 50,
      filters: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      },
    }).data

    if (results.length === 1) {
      const p = results[0]
      setFormState((prev) => ({ ...prev, patientId: p.id }))
      setErrors((prev) => ({ ...prev, patientId: undefined }))
    } else if (results.length > 1) {
      setOmonimoCandidates(results)
      setShowOmonimoModal(true)
    }
  }, [form.patientFirstName, form.patientLastName])

  function setField(field: keyof FormState, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }))
    if ((errors as Record<string, unknown>)[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function setName(field: 'patientFirstName' | 'patientLastName', value: string) {
    userTypedName.current = true
    // Reset collegamento paziente se l'utente modifica nome/cognome
    setFormState((prev) => ({ ...prev, [field]: value, patientId: '' }))
    if ((errors as Record<string, unknown>)[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    if (errors.patientId) {
      setErrors((prev) => ({ ...prev, patientId: undefined }))
    }
  }

  function handlePatientSelected(p: Patient) {
    setFormState((prev) => ({
      ...prev,
      patientFirstName: p.firstName,
      patientLastName: p.lastName,
      patientId: p.id,
    }))
    setErrors((prev) => ({
      ...prev,
      patientFirstName: undefined,
      patientLastName: undefined,
      patientId: undefined,
    }))
    setShowOmonimoModal(false)
  }

  function buildInput(): AppointmentInput {
    return {
      patientId: form.patientId,
      patientFirstName: form.patientFirstName.trim(),
      patientLastName: form.patientLastName.trim(),
      appointmentType: form.appointmentType as AppointmentType,
      appointmentDate: form.appointmentDate,
      appointmentTime: form.appointmentTime,
      description: form.description.trim() || undefined,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = buildInput()
    const validationErrors = validateAppointment(input)
    if (hasAppointmentErrors(validationErrors)) {
      setErrors(validationErrors)
      return
    }
    setSaving(true)
    try {
      onSave(input, isEdit ? appointment!.id : undefined)
      onSaved(
        isEdit
          ? 'Appuntamento aggiornato con successo.'
          : 'Appuntamento creato con successo.',
      )
    } finally {
      setSaving(false)
    }
  }

  const TYPE_OPTIONS = APPOINTMENT_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }))

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !showOmonimoModal) onClose()
        }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-gray-100 dark:border-gray-800 max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-teal-600" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {isEdit ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
            <div className="px-6 py-5 space-y-4">
              {/* Paziente */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Paziente
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nome"
                    required
                    placeholder="Es. Mario"
                    value={form.patientFirstName}
                    onChange={(e) => setName('patientFirstName', e.target.value)}
                    error={errors.patientFirstName}
                  />
                  <Input
                    label="Cognome"
                    required
                    placeholder="Es. Rossi"
                    value={form.patientLastName}
                    onChange={(e) => setName('patientLastName', e.target.value)}
                    error={errors.patientLastName}
                  />
                </div>
                {/* Indicatore collegamento paziente */}
                <div className="mt-2">
                  {form.patientId ? (
                    <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                      Paziente collegato
                    </p>
                  ) : (
                    <p className="text-xs text-amber-500 dark:text-amber-400">
                      Nessun paziente collegato — digita nome e cognome per cercare nella lista
                    </p>
                  )}
                  {errors.patientId && (
                    <p className="text-sm text-red-500 mt-0.5">{errors.patientId}</p>
                  )}
                </div>
              </div>

              {/* Tipo + Data + Ora */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Dettagli appuntamento
                </p>
                <div className="grid grid-cols-1 gap-4">
                  <Select
                    label="Tipo appuntamento"
                    required
                    options={TYPE_OPTIONS}
                    value={form.appointmentType}
                    onChange={(e) => setField('appointmentType', e.target.value)}
                    error={errors.appointmentType}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Data"
                      type="date"
                      required
                      value={form.appointmentDate}
                      onChange={(e) => setField('appointmentDate', e.target.value)}
                      error={errors.appointmentDate}
                    />
                    <Input
                      label="Orario"
                      type="time"
                      required
                      value={form.appointmentTime}
                      onChange={(e) => setField('appointmentTime', e.target.value)}
                      error={errors.appointmentTime}
                    />
                  </div>
                </div>
              </div>

              {/* Descrizione */}
              <div className="flex flex-col gap-1">
                <label className="label">Descrizione</label>
                <textarea
                  rows={3}
                  placeholder="Note o descrizione dell'appuntamento..."
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="input-field resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <Button type="button" variant="secondary" onClick={onClose}>
                Annulla
              </Button>
              <Button type="submit" loading={saving}>
                {isEdit ? 'Salva modifiche' : 'Crea appuntamento'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal omonimi */}
      {showOmonimoModal && (
        <PazienteOmonimoModal
          candidates={omonimoCandidates}
          onSelect={handlePatientSelected}
          onClose={() => setShowOmonimoModal(false)}
        />
      )}
    </>
  )
}
