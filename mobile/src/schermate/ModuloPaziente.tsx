import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { Button } from '@desktop/components/ui/Button'
import { Input } from '@desktop/components/ui/Input'
import { Select } from '@desktop/components/ui/Select'
import { pazienteService } from '@desktop/lib/pazienteService'
import { giornoFissoService } from '@desktop/lib/giornoFissoService'
import { servizioService } from '@desktop/lib/servizioService'
import { spostaGiorni } from '@desktop/lib/agendaService'
import { MAX_RIPETIZIONI } from '@desktop/lib/appuntamentoService'
import { GENDER_OPTIONS, WEEKDAY_LABELS, WEEKDAY_OPTIONS, type FixedSlot, type Weekday } from '@desktop/types/paziente'
import { validatePatient, hasErrors, type PatientFormErrors } from '@desktop/features/pazienti/pazienteValidation'
import { EMPTY_FORM, formToInput, patientToForm, type FormState } from '@desktop/features/pazienti/pazienteForm'
import { Pagina } from '../componenti/Pagina'
import { AreaTesto, Gruppo, Interruttore } from '../componenti/Campi'
import { RimuoviGiornoFisso } from '../componenti/RimuoviGiornoFisso'
import { avvisa, chiudi } from '../navigazione'
import { dataBreve } from './formato'

/** Settimane proposte per la serie, circa tre mesi (come il desktop). */
const SETTIMANE_PROPOSTE = 12

const stessoSlot = (a?: FixedSlot | null, b?: FixedSlot | null) =>
  !!a && !!b && a.weekday === b.weekday && a.time === b.time

export function ModuloPaziente({ id }: { id?: string }) {
  const paziente = id ? pazienteService.getById(id) : null
  const modifica = !!paziente
  const [form, setForm] = useState<FormState>(paziente ? patientToForm(paziente) : EMPTY_FORM)
  const [errori, setErrori] = useState<PatientFormErrors>({})
  const [erroreSlot, setErroreSlot] = useState<string | null>(null)

  // ── Giorno fisso e serie, con le stesse regole del modulo desktop ──
  const [giornoFissoSalvato, setGiornoFissoSalvato] = useState<FixedSlot | undefined>(paziente?.fixedSlot)
  const [rimuoviAperto, setRimuoviAperto] = useState(false)
  const slotDelForm: FixedSlot | null =
    form.fixedSlotWeekday && form.fixedSlotTime
      ? { weekday: Number(form.fixedSlotWeekday) as Weekday, time: form.fixedSlotTime }
      : null
  const slotNuovo = !!slotDelForm && !stessoSlot(slotDelForm, giornoFissoSalvato)
  const proponiSerie =
    slotNuovo || (!!slotDelForm && !!paziente && giornoFissoService.appuntamentiFuturi(paziente.id, slotDelForm).length === 0)

  const [creaSerie, setCreaSerie] = useState(true)
  const [serieServizio, setSerieServizio] = useState('')
  const [serieFino, setSerieFino] = useState('')
  const [erroreSerie, setErroreSerie] = useState<string | null>(null)
  const primaData = slotDelForm ? giornoFissoService.primaData(slotDelForm) : ''
  const finoEffettivo = serieFino || (primaData ? spostaGiorni(primaData, 7 * (SETTIMANE_PROPOSTE - 1)) : '')
  const pianoSerie =
    proponiSerie && creaSerie && slotDelForm && finoEffettivo ? giornoFissoService.pianoSerie(slotDelForm, finoEffettivo) : null
  const opzioniServizio = useMemo(
    () => servizioService.getAttivi().map((sv) => ({ value: sv.id, label: `${sv.nome} · ${sv.durataMinuti} min` })),
    [],
  )

  function imposta(campo: keyof FormState, valore: string | boolean) {
    setForm((prec) => ({ ...prec, [campo]: valore }))
    if (errori[campo as keyof PatientFormErrors]) setErrori((prec) => ({ ...prec, [campo]: undefined }))
  }

  function salva() {
    const input = formToInput(form)
    const errs = validatePatient(input)
    const slotIncompleto = !form.fixedSlotWeekday !== !form.fixedSlotTime
    setErroreSlot(slotIncompleto ? "Indica sia il giorno sia l'orario, oppure lascia entrambi vuoti." : null)
    const servizioMancante = !!pianoSerie && pianoSerie.date.length > 0 && !serieServizio
    setErroreSerie(servizioMancante ? 'Scegli il servizio degli appuntamenti da creare.' : null)
    if (hasErrors(errs) || slotIncompleto || servizioMancante) {
      setErrori(errs)
      avvisa('Controlla i campi evidenziati.', 'errore')
      return
    }
    const salvato = modifica ? pazienteService.update(paziente!.id, input) : pazienteService.create(input)
    let creati = 0
    if (salvato && pianoSerie && slotDelForm && pianoSerie.date.length > 0) {
      creati = giornoFissoService.creaSerie(salvato, slotDelForm, serieServizio, finoEffettivo)
    }
    const base = modifica ? 'Paziente aggiornato con successo.' : 'Paziente aggiunto con successo.'
    avvisa(
      creati > 0
        ? `${base} Creati ${creati} appuntament${creati === 1 ? 'o' : 'i'} fino al ${dataBreve(finoEffettivo)}.`
        : base,
    )
    chiudi()
  }

  return (
    <Pagina
      titolo={modifica ? 'Modifica paziente' : 'Aggiungi paziente'}
      ritorno="chiudi"
      piede={
        <>
          <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap" onClick={chiudi}>
            Annulla
          </Button>
          <Button className="flex-1 tocco px-3 whitespace-nowrap" onClick={salva}>
            {modifica ? 'Salva modifiche' : 'Salva paziente'}
          </Button>
        </>
      }
    >
      <form
        className="px-4 py-5 space-y-7"
        onSubmit={(e) => {
          e.preventDefault()
          salva()
        }}
      >
        <Gruppo titolo="Dati anagrafici">
          <Input label="Nome" required autoComplete="off" value={form.firstName} onChange={(e) => imposta('firstName', e.target.value)} error={errori.firstName} />
          <Input label="Cognome" required autoComplete="off" value={form.lastName} onChange={(e) => imposta('lastName', e.target.value)} error={errori.lastName} />
          <Input
            label="Codice fiscale"
            required
            placeholder="Es. RSSMRA80A01H501U"
            autoCapitalize="characters"
            value={form.fiscalCode}
            onChange={(e) => imposta('fiscalCode', e.target.value.toUpperCase())}
            error={errori.fiscalCode}
            className="uppercase"
          />
          <Input
            label="Numero cellulare"
            required={!form.developmentalAge}
            type="tel"
            inputMode="tel"
            placeholder="Es. 3331234567"
            value={form.phoneNumber}
            onChange={(e) => imposta('phoneNumber', e.target.value)}
            error={errori.phoneNumber}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Sesso" required options={GENDER_OPTIONS} value={form.gender} onChange={(e) => imposta('gender', e.target.value)} error={errori.gender} />
            <Input label="Data di nascita" type="date" required value={form.birthDate} onChange={(e) => imposta('birthDate', e.target.value)} error={errori.birthDate} />
          </div>
        </Gruppo>

        <Gruppo titolo="Residenza">
          <Input label="Indirizzo" required={!form.developmentalAge} placeholder="Es. Via Roma 12" value={form.address} onChange={(e) => imposta('address', e.target.value)} error={errori.address} />
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Input
              label="CAP"
              required={!form.developmentalAge}
              inputMode="numeric"
              maxLength={5}
              placeholder="20100"
              value={form.postalCode}
              onChange={(e) => imposta('postalCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
              error={errori.postalCode}
            />
            <Input label="Città" required={!form.developmentalAge} placeholder="Es. Milano" value={form.city} onChange={(e) => imposta('city', e.target.value)} error={errori.city} />
          </div>
          <Input
            label="Provincia"
            required={!form.developmentalAge}
            maxLength={2}
            placeholder="Es. MI"
            autoCapitalize="characters"
            value={form.province}
            onChange={(e) => imposta('province', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            error={errori.province}
          />
        </Gruppo>

        <Interruttore attivo={form.developmentalAge} onCambia={(v) => imposta('developmentalAge', v)} icona={<Users size={18} />}>
          <span className="font-medium">Età evolutiva</span>
          <span className="block text-xs opacity-80">Paziente minorenne con tutore</span>
        </Interruttore>

        {form.developmentalAge && (
          <div className="rounded-2xl border border-teal-100 dark:border-teal-800/50 bg-teal-50/50 dark:bg-teal-900/10 p-4 space-y-7">
            <Gruppo titolo="Dati tutore">
              <Input label="Nome tutore" required value={form.guardianFirstName} onChange={(e) => imposta('guardianFirstName', e.target.value)} error={errori.guardianFirstName} />
              <Input label="Cognome tutore" required value={form.guardianLastName} onChange={(e) => imposta('guardianLastName', e.target.value)} error={errori.guardianLastName} />
              <Input
                label="Codice fiscale tutore"
                placeholder="Es. RSSMRA80A01H501U"
                autoCapitalize="characters"
                value={form.guardianFiscalCode}
                onChange={(e) => imposta('guardianFiscalCode', e.target.value.toUpperCase())}
                className="uppercase"
                error={errori.guardianFiscalCode}
              />
              <Input
                label="Cellulare tutore"
                required
                type="tel"
                inputMode="tel"
                placeholder="Es. 3331234567"
                value={form.guardianPhone}
                onChange={(e) => imposta('guardianPhone', e.target.value)}
                error={errori.guardianPhone}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Sesso tutore" options={GENDER_OPTIONS} value={form.guardianGender} onChange={(e) => imposta('guardianGender', e.target.value)} />
                <Input label="Nascita tutore" type="date" value={form.guardianBirthDate} onChange={(e) => imposta('guardianBirthDate', e.target.value)} error={errori.guardianBirthDate} />
              </div>
            </Gruppo>
            <Gruppo titolo="Residenza tutore">
              <Input id="tutore-indirizzo" label="Indirizzo" placeholder="Es. Via Roma 12" value={form.guardianAddress} onChange={(e) => imposta('guardianAddress', e.target.value)} />
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <Input
                  id="tutore-cap"
                  label="CAP"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.guardianPostalCode}
                  onChange={(e) => imposta('guardianPostalCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
                <Input id="tutore-citta" label="Città" value={form.guardianCity} onChange={(e) => imposta('guardianCity', e.target.value)} />
              </div>
              <Input
                id="tutore-provincia"
                label="Provincia"
                maxLength={2}
                autoCapitalize="characters"
                value={form.guardianProvince}
                onChange={(e) => imposta('guardianProvince', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              />
            </Gruppo>
          </div>
        )}

        <Gruppo
          titolo="Giorno fisso appuntamenti"
          extra={
            modifica && giornoFissoSalvato ? (
              <button type="button" onClick={() => setRimuoviAperto(true)} className="text-sm font-medium text-red-600 dark:text-red-400 min-h-[36px]">
                Rimuovi
              </button>
            ) : undefined
          }
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            Facoltativo. Può creare gli appuntamenti in calendario ogni settimana, e viene proposto quando crei un nuovo appuntamento.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Giorno"
              options={WEEKDAY_OPTIONS}
              value={form.fixedSlotWeekday}
              onChange={(e) => {
                imposta('fixedSlotWeekday', e.target.value)
                setErroreSlot(null)
              }}
            />
            <Input
              label="Orario"
              type="time"
              value={form.fixedSlotTime}
              onChange={(e) => {
                imposta('fixedSlotTime', e.target.value)
                setErroreSlot(null)
              }}
            />
          </div>
          {erroreSlot && <p className="text-sm text-red-500">{erroreSlot}</p>}

          {proponiSerie && slotDelForm && (
            <div className="rounded-xl border border-teal-100 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-900/10 p-4 space-y-3">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={creaSerie}
                  onChange={(e) => setCreaSerie(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Crea gli appuntamenti in calendario ogni{' '}
                  <span className="font-medium">
                    {WEEKDAY_LABELS[slotDelForm.weekday].toLowerCase()} alle {slotDelForm.time}
                  </span>
                  , dal {dataBreve(primaData)}
                </span>
              </label>
              {slotNuovo && giornoFissoSalvato && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Gli appuntamenti del giorno fisso precedente restano: per toglierli usa «Rimuovi» prima di cambiarlo.
                </p>
              )}
              {creaSerie && (
                <>
                  <Select
                    label="Servizio"
                    required
                    options={opzioniServizio}
                    value={serieServizio}
                    onChange={(e) => {
                      setSerieServizio(e.target.value)
                      setErroreSerie(null)
                    }}
                    error={erroreSerie ?? undefined}
                  />
                  <Input
                    label="Fino al"
                    type="date"
                    min={primaData}
                    max={spostaGiorni(primaData, 7 * (MAX_RIPETIZIONI - 1))}
                    value={finoEffettivo}
                    onChange={(e) => setSerieFino(e.target.value)}
                  />
                  {pianoSerie && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {pianoSerie.date.length > 0 ? (
                        <>
                          Verranno creati{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {pianoSerie.date.length} appuntament{pianoSerie.date.length === 1 ? 'o' : 'i'}
                          </span>{' '}
                          al salvataggio.
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
        </Gruppo>

        <AreaTesto
          etichetta="Note"
          placeholder="Annotazioni cliniche, anamnesi, informazioni aggiuntive..."
          value={form.notes}
          onChange={(e) => imposta('notes', e.target.value)}
        />
        {/* Invio dalla tastiera del telefono */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>

      <AnimatePresence>
      {rimuoviAperto && paziente && giornoFissoSalvato && (
        <RimuoviGiornoFisso
          paziente={{ ...paziente, fixedSlot: giornoFissoSalvato }}
          onAnnulla={() => setRimuoviAperto(false)}
          onRimosso={(messaggio) => {
            setRimuoviAperto(false)
            setGiornoFissoSalvato(undefined)
            setForm((prec) => ({ ...prec, fixedSlotWeekday: '', fixedSlotTime: '' }))
            avvisa(messaggio)
          }}
        />
      )}
      </AnimatePresence>
    </Pagina>
  )
}
