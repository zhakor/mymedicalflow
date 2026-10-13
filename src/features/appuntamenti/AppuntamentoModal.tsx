import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { PazienteOmonimoModal } from '../fatture/PazienteOmonimoModal'
import { RimuoviGiornoFissoConfirm } from '../pazienti/RimuoviGiornoFissoConfirm'
import { pazienteService } from '../../lib/pazienteService'
import { appuntamentoService, MAX_RIPETIZIONI } from '../../lib/appuntamentoService'
import {
  dataDaChiave,
  giornoSettimana,
  oggi,
  prossimaData,
  spostaGiorni,
  verificaSlot,
} from '../../lib/agendaService'
import type { EsitoSlot } from '../../lib/agendaService'
import type { FixedSlot, Patient } from '../../types/paziente'
import { WEEKDAY_LABELS } from '../../types/paziente'
import { servizioService } from '../../lib/servizioService'
import type { Appointment, AppointmentInput, StatoPresenza } from '../../types/appuntamento'
import { STATO_PRESENZA_DEFAULT, STATO_PRESENZA_LABELS } from '../../types/appuntamento'
import {
  validateAppointment,
  hasAppointmentErrors,
} from './appuntamentoValidation'
import type { AppointmentFormErrors } from './appuntamentoValidation'
import { Calendar, CircleAlert, Repeat, TriangleAlert, X } from 'lucide-react'

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

/** Settimane proposte per una nuova serie, circa tre mesi. */
const SETTIMANE_PROPOSTE = 12

function dataBreve(chiave: string): string {
  return dataDaChiave(chiave).toLocaleDateString('it-IT')
}

/** "Giovedì alle 15:00" */
function etichettaGiornoFisso(slot: FixedSlot): string {
  return `${WEEKDAY_LABELS[slot.weekday]} alle ${slot.time}`
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
  /** `ripetiFino`: solo per un nuovo appuntamento, crea la serie settimanale. */
  onSave: (input: AppointmentInput, id?: string, ripetiFino?: string) => void
  /** Il giorno fisso è stato tolto, forse con i suoi appuntamenti futuri: ricaricare. */
  onGiornoFissoRimosso?: (messaggio: string) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AppuntamentoModal({
  appointment,
  dataIniziale,
  oraIniziale,
  onClose,
  onSaved,
  onSave,
  onGiornoFissoRimosso,
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

  // Giorno fisso del paziente collegato
  /** Paziente per cui il giorno fisso è già stato proposto: una volta sola. */
  const giornoFissoPropostoA = useRef<string | null>(null)
  const [rimuoviGiornoFisso, setRimuoviGiornoFisso] = useState(false)
  /** Cresce a ogni modifica del paziente fatta da qui, per rileggerlo. */
  const [versionePaziente, setVersionePaziente] = useState(0)
  const pazienteCollegato = useMemo(
    () => (form.patientId ? pazienteService.getById(form.patientId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.patientId, versionePaziente],
  )

  function handleGiornoFissoRimosso(eliminati: number) {
    setRimuoviGiornoFisso(false)
    setVersionePaziente((v) => v + 1)
    setRipeti(false)
    onGiornoFissoRimosso?.(
      eliminati > 0
        ? `Giorno fisso rimosso ed eliminat${eliminati === 1 ? 'o 1 appuntamento futuro' : `i ${eliminati} appuntamenti futuri`}.`
        : 'Giorno fisso rimosso.',
    )
  }
  const giornoFissoDelForm: FixedSlot | null =
    form.appointmentDate && form.appointmentTime
      ? { weekday: giornoSettimana(form.appointmentDate), time: form.appointmentTime }
      : null
  /**
   * Ripetizione settimanale, solo creando e con giorno e ora già scelti.
   * È anche il modo di fissare il giorno: chi ripete ogni settimana alla
   * stessa ora sta di fatto stabilendo il giorno fisso del paziente, e due
   * caselle separate chiederebbero la stessa cosa due volte.
   */
  const [ripeti, setRipeti] = useState(false)
  const [ripetiFino, setRipetiFino] = useState('')
  const puoRipetere = !isEdit && !!form.patientId && !!giornoFissoDelForm
  const pianoSerie = useMemo(
    () =>
      puoRipetere && ripeti && ripetiFino
        ? appuntamentoService.pianoRicorrenza(form.appointmentDate, form.appointmentTime, ripetiFino)
        : null,
    [puoRipetere, ripeti, ripetiFino, form.appointmentDate, form.appointmentTime],
  )

  function attivaRipetizione(attiva: boolean) {
    setRipeti(attiva)
    if (attiva && !ripetiFino) {
      setRipetiFino(spostaGiorni(form.appointmentDate || oggi(), 7 * SETTIMANE_PROPOSTE))
    }
  }

  const eGiaIlGiornoFisso =
    !!giornoFissoDelForm &&
    pazienteCollegato?.fixedSlot?.weekday === giornoFissoDelForm.weekday &&
    pazienteCollegato?.fixedSlot?.time === giornoFissoDelForm.time

  // Chiudi con Escape (solo se l'omonimo modal non è aperto)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showOmonimoModal && !rimuoviGiornoFisso) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showOmonimoModal, rimuoviGiornoFisso])

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

  // Nuovo appuntamento per un paziente con giorno fisso: se l'orario non è
  // ancora scelto, si propongono il prossimo giorno utile e la sua ora. Se
  // invece si arriva da uno slot del calendario, l'orario c'è già e vince.
  useEffect(() => {
    if (isEdit || !pazienteCollegato?.fixedSlot) return
    if (giornoFissoPropostoA.current === pazienteCollegato.id) return
    giornoFissoPropostoA.current = pazienteCollegato.id
    if (form.appointmentTime) return
    usaGiornoFisso(pazienteCollegato.fixedSlot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pazienteCollegato, isEdit])

  /**
   * Porta il form sul giorno fisso, a partire dalla data scelta nel calendario
   * se è futura: si cerca il giovedì di quella settimana, non di quella in corso.
   */
  function usaGiornoFisso(slot: FixedSlot) {
    setFormState((prev) => {
      const oggiChiave = oggi()
      const da = prev.appointmentDate && prev.appointmentDate >= oggiChiave
        ? prev.appointmentDate
        : oggiChiave
      return {
        ...prev,
        appointmentDate: prossimaData(slot.weekday, da),
        appointmentTime: slot.time,
      }
    })
    setErrors((prev) => ({ ...prev, appointmentDate: undefined, appointmentTime: undefined }))
  }

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
      const fino = pianoSerie ? ripetiFino : undefined
      onSave(input, isEdit ? appointment!.id : undefined, fino)
      if (pianoSerie && giornoFissoDelForm && !eGiaIlGiornoFisso) {
        pazienteService.setFixedSlot(input.patientId, giornoFissoDelForm)
      }
      const serie = pianoSerie?.date.length ?? 0
      const saltate = pianoSerie?.occupate.length ?? 0
      onSaved(
        isEdit
          ? 'Appuntamento aggiornato con successo.'
          : serie > 0
            ? `Appuntamento creato, più ${serie} settimanal${serie === 1 ? 'e' : 'i'} fino al ${dataBreve(ripetiFino)}.` +
              (saltate > 0 ? ` ${saltate} settiman${saltate === 1 ? 'a saltata' : 'e saltate'}: orario già occupato.` : '')
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
                  {pazienteCollegato?.fixedSlot && (
                    <div className="mt-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800">
                      <p className="text-xs text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                        <Repeat size={13} />
                        Giorno fisso:{' '}
                        <span className="font-semibold">
                          {etichettaGiornoFisso(pazienteCollegato.fixedSlot)}
                        </span>
                      </p>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {!eGiaIlGiornoFisso && (
                          <button
                            type="button"
                            onClick={() => usaGiornoFisso(pazienteCollegato.fixedSlot!)}
                            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            Usa giorno fisso
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRimuoviGiornoFisso(true)}
                          className="text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:underline"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
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

                  {/* Giorno fisso e serie settimanale: appuntamenti veri, non segnaposto */}
                  {puoRipetere && (
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ripeti}
                          onChange={(e) => attivaRipetizione(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Ripeti ogni{' '}
                          <span className="font-medium">
                            {WEEKDAY_LABELS[giornoFissoDelForm!.weekday].toLowerCase()} alle{' '}
                            {giornoFissoDelForm!.time}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {eGiaIlGiornoFisso
                              ? 'È già il giorno fisso del paziente.'
                              : pazienteCollegato?.fixedSlot
                                ? `Diventa il giorno fisso del paziente, al posto di ${etichettaGiornoFisso(pazienteCollegato.fixedSlot).toLowerCase()}.`
                                : 'Diventa il giorno fisso del paziente.'}
                          </span>
                        </span>
                      </label>
                      {ripeti && (
                        <div className="ml-6 space-y-2">
                          <Input
                            label="Fino al"
                            type="date"
                            min={spostaGiorni(form.appointmentDate, 7)}
                            max={spostaGiorni(form.appointmentDate, 7 * MAX_RIPETIZIONI)}
                            value={ripetiFino}
                            onChange={(e) => setRipetiFino(e.target.value)}
                          />
                          {pianoSerie && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {pianoSerie.date.length > 0 ? (
                                <>
                                  Oltre a questo, verranno creati{' '}
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                                    {pianoSerie.date.length} appuntament{pianoSerie.date.length === 1 ? 'o' : 'i'}
                                  </span>
                                  .
                                </>
                              ) : (
                                'Nessuna settimana libera nel periodo scelto.'
                              )}
                              {pianoSerie.occupate.length > 0 && (
                                <span className="block text-amber-600 dark:text-amber-400 mt-0.5">
                                  Saltat{pianoSerie.occupate.length === 1 ? 'o' : 'i'} per orario occupato:{' '}
                                  {pianoSerie.occupate.map(dataBreve).join(', ')}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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

      {/* Conferma rimozione giorno fisso */}
      {rimuoviGiornoFisso && pazienteCollegato?.fixedSlot && (
        <RimuoviGiornoFissoConfirm
          patient={pazienteCollegato}
          onRimosso={handleGiornoFissoRimosso}
          onAnnulla={() => setRimuoviGiornoFisso(false)}
        />
      )}

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
