import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { PazienteOmonimoModal } from '../fatture/PazienteOmonimoModal'
import { pazienteService } from '../../lib/pazienteService'
import { appuntamentoService } from '../../lib/appuntamentoService'
import { oggi, verificaSlot } from '../../lib/agendaService'
import type { EsitoSlot } from '../../lib/agendaService'
import type { Patient } from '../../types/paziente'
import { servizioService } from '../../lib/servizioService'
import type { Appointment, AppointmentInput, StatoPresenza } from '../../types/appuntamento'
import { STATO_PRESENZA_DEFAULT, STATO_PRESENZA_LABELS } from '../../types/appuntamento'
import {
  validateAppointment,
  hasAppointmentErrors,
} from './appuntamentoValidation'
import type { AppointmentFormErrors } from './appuntamentoValidation'
import { Calendar, CircleAlert, TriangleAlert, X } from 'lucide-react'

// ─── Stato form ───────────────────────────────────────────────────────────────

interface FormState {
  patientFirstName: string
  patientLastName: string
  patientId: string
  serviceId: string
  presenza: StatoPresenza
  appointmentDate: string
  appointmentTime: string
  description: string
}

const EMPTY_FORM: FormState = {
  patientFirstName: '',
  patientLastName: '',
  patientId: '',
  serviceId: '',
  presenza: STATO_PRESENZA_DEFAULT,
  appointmentDate: '',
  appointmentTime: '',
  description: '',
}

function appointmentToForm(a: Appointment): FormState {
  return {
    patientFirstName: a.patientFirstName,
    patientLastName: a.patientLastName,
    patientId: a.patientId,
    // Gli appuntamenti salvati prima portano il tipo storico, non il servizio
    serviceId: servizioService.idServizioDi(a) ?? '',
    presenza: a.presenza ?? STATO_PRESENZA_DEFAULT,
    appointmentDate: a.appointmentDate,
    appointmentTime: a.appointmentTime,
    description: a.description ?? '',
  }
}

// ─── Stato dello slot ─────────────────────────────────────────────────────────

/**
 * Segnala solo i casi che meritano attenzione: l'orario identico, che
 * impedisce il salvataggio, e la sovrapposizione con un altro appuntamento,
 * che avvisa soltanto — la seconda seduta può cominciare in ritardo, o due
 * prestazioni possono convivere.
 *
 * Quando l'orario è libero non compare nulla: è il caso normale.
 */
function StatoSlot({ slot }: { slot: EsitoSlot }) {
  if (slot.identico) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-900/20">
        <CircleAlert size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
        <p className="text-xs text-red-700 dark:text-red-400">
          <span className="font-semibold">Orario già occupato</span> da{' '}
          {slot.identico.patientLastName} {slot.identico.patientFirstName} (
          {servizioService.nomeDi(slot.identico).toLowerCase()}). Scegli
          un altro orario.
        </p>
      </div>
    )
  }

  if (slot.vicini.length > 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-900/20">
        <TriangleAlert size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Poco distante</span> da{' '}
          {slot.vicini
            .map((a) => `${a.patientLastName} (${a.appointmentTime})`)
            .join(', ')}
          . Puoi salvare comunque.
        </p>
      </div>
    )
  }

  // Nessun riquadro quando l'orario è libero: è il caso normale, e confermarlo
  // ogni volta aggiunge rumore senza aggiungere informazione.
  return null
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppuntamentoModalProps {
  appointment?: Appointment | null
  /** Valori di partenza per un nuovo appuntamento, es. da uno slot del calendario. */
  dataIniziale?: string
  oraIniziale?: string
  onClose: () => void
  onSaved: (message: string) => void
  onSave: (input: AppointmentInput, id?: string) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AppuntamentoModal({
  appointment,
  dataIniziale,
  oraIniziale,
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
          // `oggi()` legge il fuso locale: `toISOString()` dopo mezzanotte
          // proporrebbe ancora il giorno prima.
          appointmentDate: dataIniziale || oggi(),
          appointmentTime: oraIniziale ?? '',
        },
  )
  const [errors, setErrors] = useState<AppointmentFormErrors>({})
  const [saving, setSaving] = useState(false)

  // Occupazione dello slot scelto. Si rilegge a ogni modifica di data o ora:
  // è l'informazione che serve prima di salvare, non dopo.
  const slot = useMemo(
    () =>
      verificaSlot(
        appuntamentoService.getAllAppointments(),
        form.appointmentDate,
        form.appointmentTime,
        appointment?.id,
        // La durata del servizio scelto decide quanto spazio serve davvero
        servizioService.getById(form.serviceId)?.durataMinuti,
      ),
    [form.appointmentDate, form.appointmentTime, form.serviceId, appointment?.id],
  )

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
      serviceId: form.serviceId,
      presenza: form.presenza,
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
    // Rete di sicurezza: il pulsante è già disabilitato in questo caso, e il
    // motivo sta nel riquadro sopra. Ripetere qui il messaggio lo mostrerebbe
    // due volte nella stessa schermata.
    if (slot.identico) return
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

  // Solo i servizi attivi si propongono, ma quello già scelto resta in elenco:
  // modificando un vecchio appuntamento non deve sparire da sotto il cursore.
  const OPZIONI_SERVIZIO = useMemo(() => {
    const attivi = servizioService.getAttivi()
    const corrente = form.serviceId ? servizioService.getById(form.serviceId) : null
    const elenco = corrente && !attivi.some((s) => s.id === corrente.id)
      ? [...attivi, corrente]
      : attivi
    return elenco.map((s) => ({
      value: s.id,
      label: `${s.nome} · ${s.durataMinuti} min`,
    }))
  }, [form.serviceId])

  const OPZIONI_PRESENZA = (
    Object.keys(STATO_PRESENZA_LABELS) as StatoPresenza[]
  ).map((v) => ({ value: v, label: STATO_PRESENZA_LABELS[v] }))

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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
                    label="Servizio"
                    required
                    options={OPZIONI_SERVIZIO}
                    value={form.serviceId}
                    onChange={(e) => setField('serviceId', e.target.value)}
                    error={errors.serviceId}
                    placeholder={
                      OPZIONI_SERVIZIO.length
                        ? 'Seleziona...'
                        : 'Nessun servizio configurato'
                    }
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

                  {/* Stato dello slot: si vede prima di salvare, non dopo */}
                  {form.appointmentDate && form.appointmentTime && (
                    <StatoSlot slot={slot} />
                  )}

                  {/* La presenza distingue ciò che è stato svolto da ciò che
                      era solo in programma: è quanto si confronta con la fattura. */}
                  <Select
                    label="Presenza"
                    options={OPZIONI_PRESENZA}
                    value={form.presenza}
                    onChange={(e) => setField('presenza', e.target.value)}
                  />
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
              {/* Disabilitato sullo slot occupato: il riquadro sopra dice perché */}
              <Button
                type="submit"
                loading={saving}
                disabled={!!slot.identico}
                title={slot.identico ? 'Orario già occupato' : undefined}
              >
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
