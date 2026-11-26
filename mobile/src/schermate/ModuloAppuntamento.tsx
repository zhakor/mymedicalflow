import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, Repeat, TriangleAlert } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { Button } from '@desktop/components/ui/Button'
import { Input } from '@desktop/components/ui/Input'
import { Select } from '@desktop/components/ui/Select'
import { pazienteService } from '@desktop/lib/pazienteService'
import { appuntamentoService, MAX_RIPETIZIONI } from '@desktop/lib/appuntamentoService'
import { servizioService } from '@desktop/lib/servizioService'
import { giornoSettimana, oggi, prossimaData, spostaGiorni, verificaSlot, type EsitoSlot } from '@desktop/lib/agendaService'
import { WEEKDAY_LABELS, type FixedSlot } from '@desktop/types/paziente'
import { STATO_PRESENZA_LABELS, type StatoPresenza } from '@desktop/types/appuntamento'
import { validateAppointment, hasAppointmentErrors, type AppointmentFormErrors } from '@desktop/features/appuntamenti/appuntamentoValidation'
import { EMPTY_FORM, appointmentToForm, formToInput, type FormState } from '@desktop/features/appuntamenti/appuntamentoForm'
import { Pagina } from '../componenti/Pagina'
import { AreaTesto, Gruppo, Interruttore, Segmenti } from '../componenti/Campi'
import { Conferma } from '../componenti/Conferma'
import { SelettorePaziente } from '../componenti/SelettorePaziente'
import { RimuoviGiornoFisso } from '../componenti/RimuoviGiornoFisso'
import { avvisa, chiudi } from '../navigazione'
import { dataBreve } from './formato'

/** Settimane proposte per una nuova serie, circa tre mesi (come il desktop). */
const SETTIMANE_PROPOSTE = 12

const etichettaGiornoFisso = (slot: FixedSlot) => `${WEEKDAY_LABELS[slot.weekday]} alle ${slot.time}`

/** Solo i casi che meritano attenzione, come nel desktop: orario identico (blocca) e vicino (avvisa). */
function StatoSlot({ slot }: { slot: EsitoSlot }) {
  if (slot.identico) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900 dark:bg-red-900/20">
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-500" />
        <p className="text-sm text-red-700 dark:text-red-400">
          <span className="font-semibold">Orario già occupato</span> da {slot.identico.patientLastName} {slot.identico.patientFirstName} (
          {servizioService.nomeDi(slot.identico).toLowerCase()}). Scegli un altro orario.
        </p>
      </div>
    )
  }
  if (slot.vicini.length > 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-900/20">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Poco distante</span> da {slot.vicini.map((a) => `${a.patientLastName} (${a.appointmentTime})`).join(', ')}. Puoi salvare comunque.
        </p>
      </div>
    )
  }
  return null
}

const OPZIONI_PRESENZA = (Object.keys(STATO_PRESENZA_LABELS) as StatoPresenza[]).map((v) => ({
  valore: v,
  etichetta: STATO_PRESENZA_LABELS[v],
}))

export function ModuloAppuntamento({ id, data, ora, pazienteId }: { id?: string; data?: string; ora?: string; pazienteId?: string }) {
  const appuntamento = id ? appuntamentoService.getById(id) : null
  const modifica = !!appuntamento

  const [form, setForm] = useState<FormState>(() => {
    if (appuntamento) return appointmentToForm(appuntamento)
    const p = pazienteId ? pazienteService.getById(pazienteId) : null
    return {
      ...EMPTY_FORM,
      patientId: p?.id ?? '',
      patientFirstName: p?.firstName ?? '',
      patientLastName: p?.lastName ?? '',
      appointmentDate: data || oggi(),
      appointmentTime: ora ?? '',
    }
  })
  const [errori, setErrori] = useState<AppointmentFormErrors>({})
  const [eliminando, setEliminando] = useState(false)

  const slot = useMemo(
    () =>
      verificaSlot(
        appuntamentoService.getAllAppointments(),
        form.appointmentDate,
        form.appointmentTime,
        appuntamento?.id,
        servizioService.getById(form.serviceId)?.durataMinuti,
      ),
    [form.appointmentDate, form.appointmentTime, form.serviceId, appuntamento?.id],
  )

  // ── Giorno fisso del paziente collegato ──
  const giornoFissoPropostoA = useRef<string | null>(null)
  const [rimuoviGiornoFisso, setRimuoviGiornoFisso] = useState(false)
  const [versionePaziente, setVersionePaziente] = useState(0)
  const pazienteCollegato = useMemo(
    () => (form.patientId ? pazienteService.getById(form.patientId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.patientId, versionePaziente],
  )
  const giornoFissoDelForm: FixedSlot | null =
    form.appointmentDate && form.appointmentTime ? { weekday: giornoSettimana(form.appointmentDate), time: form.appointmentTime } : null

  const [ripeti, setRipeti] = useState(false)
  const [ripetiFino, setRipetiFino] = useState('')
  const puoRipetere = !modifica && !!form.patientId && !!giornoFissoDelForm
  const pianoSerie =
    puoRipetere && ripeti && ripetiFino ? appuntamentoService.pianoRicorrenza(form.appointmentDate, form.appointmentTime, ripetiFino) : null
  const eGiaIlGiornoFisso =
    !!giornoFissoDelForm &&
    pazienteCollegato?.fixedSlot?.weekday === giornoFissoDelForm.weekday &&
    pazienteCollegato?.fixedSlot?.time === giornoFissoDelForm.time

  // Nuovo appuntamento per un paziente con giorno fisso: senza orario scelto si
  // propongono il prossimo giorno utile e la sua ora (una volta per paziente).
  useEffect(() => {
    if (modifica || !pazienteCollegato?.fixedSlot) return
    if (giornoFissoPropostoA.current === pazienteCollegato.id) return
    giornoFissoPropostoA.current = pazienteCollegato.id
    if (form.appointmentTime) return
    usaGiornoFisso(pazienteCollegato.fixedSlot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pazienteCollegato, modifica])

  function usaGiornoFisso(s: FixedSlot) {
    setForm((prec) => {
      const da = prec.appointmentDate && prec.appointmentDate >= oggi() ? prec.appointmentDate : oggi()
      return { ...prec, appointmentDate: prossimaData(s.weekday, da), appointmentTime: s.time }
    })
    setErrori((prec) => ({ ...prec, appointmentDate: undefined, appointmentTime: undefined }))
  }

  function attivaRipetizione(attiva: boolean) {
    setRipeti(attiva)
    if (attiva && !ripetiFino) setRipetiFino(spostaGiorni(form.appointmentDate || oggi(), 7 * SETTIMANE_PROPOSTE))
  }

  function imposta(campo: keyof FormState, valore: string) {
    setForm((prec) => ({ ...prec, [campo]: valore }))
    if ((errori as Record<string, unknown>)[campo]) setErrori((prec) => ({ ...prec, [campo]: undefined }))
  }

  // Solo i servizi attivi, ma quello già scelto resta in elenco
  const opzioniServizio = useMemo(() => {
    const attivi = servizioService.getAttivi()
    const corrente = form.serviceId ? servizioService.getById(form.serviceId) : null
    const elenco = corrente && !attivi.some((s) => s.id === corrente.id) ? [...attivi, corrente] : attivi
    return elenco.map((s) => ({ value: s.id, label: `${s.nome} · ${s.durataMinuti} min` }))
  }, [form.serviceId])

  function salva() {
    const input = formToInput(form)
    const errs = validateAppointment(input)
    // Il telefono sceglie il paziente dall'elenco: nome e cognome arrivano insieme.
    if (errs.patientFirstName || errs.patientLastName) errs.patientId = errs.patientId ?? 'Scegli un paziente.'
    delete errs.patientFirstName
    delete errs.patientLastName
    if (hasAppointmentErrors(errs)) {
      setErrori(errs)
      avvisa('Controlla i campi evidenziati.', 'errore')
      return
    }
    if (slot.identico) return

    if (modifica) {
      appuntamentoService.update(appuntamento!.id, input)
    } else {
      appuntamentoService.create(input)
      if (pianoSerie) appuntamentoService.creaRicorrenza(input, ripetiFino)
    }
    if (pianoSerie && giornoFissoDelForm && !eGiaIlGiornoFisso) pazienteService.setFixedSlot(input.patientId, giornoFissoDelForm)

    const serie = pianoSerie?.date.length ?? 0
    const saltate = pianoSerie?.occupate.length ?? 0
    avvisa(
      modifica
        ? 'Appuntamento aggiornato con successo.'
        : serie > 0
          ? `Appuntamento creato, più ${serie} settimanal${serie === 1 ? 'e' : 'i'} fino al ${dataBreve(ripetiFino)}.` +
            (saltate > 0 ? ` ${saltate} settiman${saltate === 1 ? 'a saltata' : 'e saltate'}: orario già occupato.` : '')
          : 'Appuntamento creato con successo.',
    )
    chiudi()
  }

  function elimina() {
    appuntamentoService.delete(appuntamento!.id)
    setEliminando(false)
    avvisa('Appuntamento eliminato.')
    chiudi()
  }

  return (
    <Pagina
      titolo={modifica ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
      ritorno="chiudi"
      piede={
        <>
          {modifica ? (
            <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap text-red-600 dark:text-red-400" onClick={() => setEliminando(true)}>
              Elimina
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap" onClick={chiudi}>
              Annulla
            </Button>
          )}
          <Button className="flex-1 tocco px-3 whitespace-nowrap" onClick={salva} disabled={!!slot.identico}>
            {modifica ? 'Salva modifiche' : 'Crea appuntamento'}
          </Button>
        </>
      }
    >
      <div className="px-4 py-5 space-y-7">
        <Gruppo titolo="Paziente">
          <SelettorePaziente
            nome={`${form.patientLastName} ${form.patientFirstName}`.trim()}
            collegato={!!form.patientId}
            errore={errori.patientId}
            onScelto={(p) => {
              setForm((prec) => ({ ...prec, patientId: p.id, patientFirstName: p.firstName, patientLastName: p.lastName }))
              setErrori((prec) => ({ ...prec, patientId: undefined }))
            }}
          />
          {pazienteCollegato?.fixedSlot && (
            <div className="rounded-xl border border-teal-100 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-3 py-2.5">
              <p className="text-sm text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                <Repeat size={14} /> Giorno fisso: <span className="font-semibold">{etichettaGiornoFisso(pazienteCollegato.fixedSlot)}</span>
              </p>
              <div className="flex gap-4 mt-1.5">
                {!eGiaIlGiornoFisso && (
                  <button type="button" onClick={() => usaGiornoFisso(pazienteCollegato.fixedSlot!)} className="min-h-[36px] text-sm font-medium text-teal-700 dark:text-teal-400">
                    Usa giorno fisso
                  </button>
                )}
                <button type="button" onClick={() => setRimuoviGiornoFisso(true)} className="min-h-[36px] text-sm font-medium text-gray-500 dark:text-gray-400">
                  Rimuovi
                </button>
              </div>
            </div>
          )}
        </Gruppo>

        <Gruppo titolo="Dettagli appuntamento">
          <Select
            label="Servizio"
            required
            options={opzioniServizio}
            value={form.serviceId}
            onChange={(e) => imposta('serviceId', e.target.value)}
            error={errori.serviceId}
            placeholder={opzioniServizio.length ? 'Seleziona...' : 'Nessun servizio configurato'}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" required value={form.appointmentDate} onChange={(e) => imposta('appointmentDate', e.target.value)} error={errori.appointmentDate} />
            <Input label="Orario" type="time" required value={form.appointmentTime} onChange={(e) => imposta('appointmentTime', e.target.value)} error={errori.appointmentTime} />
          </div>

          {form.appointmentDate && form.appointmentTime && <StatoSlot slot={slot} />}

          {puoRipetere && (
            <div className="space-y-3">
              <Interruttore attivo={ripeti} onCambia={attivaRipetizione} icona={<Repeat size={18} />}>
                <span className="font-medium">
                  Ripeti ogni {WEEKDAY_LABELS[giornoFissoDelForm!.weekday].toLowerCase()} alle {giornoFissoDelForm!.time}
                </span>
                <span className="block text-xs opacity-80">
                  {eGiaIlGiornoFisso
                    ? 'È già il giorno fisso del paziente.'
                    : pazienteCollegato?.fixedSlot
                      ? `Diventa il giorno fisso, al posto di ${etichettaGiornoFisso(pazienteCollegato.fixedSlot).toLowerCase()}.`
                      : 'Diventa il giorno fisso del paziente.'}
                </span>
              </Interruttore>
              {ripeti && (
                <>
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
                          Saltat{pianoSerie.occupate.length === 1 ? 'o' : 'i'} per orario occupato: {pianoSerie.occupate.map(dataBreve).join(', ')}
                        </span>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <Segmenti etichetta="Presenza" valore={form.presenza} opzioni={OPZIONI_PRESENZA} onCambia={(v) => imposta('presenza', v)} />
        </Gruppo>

        <AreaTesto
          etichetta="Descrizione"
          placeholder="Note o descrizione dell'appuntamento..."
          value={form.description}
          onChange={(e) => imposta('description', e.target.value)}
        />
      </div>

      <AnimatePresence>
      {eliminando && appuntamento && (
        <Conferma titolo="Elimina appuntamento" etichetta="Elimina" onConferma={elimina} onAnnulla={() => setEliminando(false)}>
          Sei sicuro di voler eliminare l'appuntamento{' '}
          <span className="font-medium text-gray-900 dark:text-white">{servizioService.nomeDi(appuntamento)}</span> del{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {dataBreve(appuntamento.appointmentDate)} alle {appuntamento.appointmentTime}
          </span>{' '}
          per{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {appuntamento.patientFirstName} {appuntamento.patientLastName}
          </span>
          ?<span className="block text-red-500 text-xs mt-1">Questa azione non può essere annullata.</span>
        </Conferma>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {rimuoviGiornoFisso && pazienteCollegato?.fixedSlot && (
        <RimuoviGiornoFisso
          paziente={pazienteCollegato}
          onAnnulla={() => setRimuoviGiornoFisso(false)}
          onRimosso={(messaggio) => {
            setRimuoviGiornoFisso(false)
            setVersionePaziente((v) => v + 1)
            setRipeti(false)
            avvisa(messaggio)
          }}
        />
      )}
      </AnimatePresence>
    </Pagina>
  )
}
