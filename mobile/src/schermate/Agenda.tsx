import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check, UserX, Plus, Clock, TriangleAlert, CalendarX, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { UI } from '../componenti/Movimento'
import { Input } from '@desktop/components/ui/Input'
import { Select } from '@desktop/components/ui/Select'
import { appuntamentoService } from '@desktop/lib/appuntamentoService'
import { servizioService } from '@desktop/lib/servizioService'
import {
  INTESTAZIONI_SETTIMANA,
  ORA_APERTURA,
  ORA_CHIUSURA,
  appuntamentiDelGiorno,
  conteggioPerGiorno,
  dataDaChiave,
  etichettaGiorno,
  fuoriOrario,
  giornoSettimana,
  grigliaMese,
  nomeMese,
  oggi,
  slotDelGiorno,
  spostaGiorni,
  stessoMese,
} from '@desktop/lib/agendaService'
import {
  STATO_PRESENZA_DEFAULT,
  STATO_PRESENZA_LABELS,
  type Appointment,
  type AppointmentFilters,
  type StatoPresenza,
} from '@desktop/types/appuntamento'
import type { Servizio } from '@desktop/types/servizio'
import { EMPTY_APPOINTMENT_FILTERS } from '@desktop/features/appuntamenti/appuntamentoValidation'
import { useDati } from '../dati/hooks'
import { apri } from '../navigazione'
import { PulsanteNuovo, Segmenti } from '../componenti/Campi'

type Vista = 'giorno' | 'mese' | 'elenco'

const VISTE: { valore: Vista; etichetta: string }[] = [
  { valore: 'giorno', etichetta: 'Giorno' },
  { valore: 'mese', etichetta: 'Mese' },
  { valore: 'elenco', etichetta: 'Elenco' },
]

// ─── Riga appuntamento con presenza a un tocco (come la giornata del desktop) ──

function RigaAppuntamento({ a, servizi }: { a: Appointment; servizi: Servizio[] }) {
  const presenza = a.presenza ?? STATO_PRESENZA_DEFAULT
  const classi = servizioService.classiDi(a, servizi)
  const segna = (stato: StatoPresenza) => appuntamentoService.segnaPresenza(a.id, presenza === stato ? 'programmato' : stato)

  return (
    <div className={clsx('flex items-stretch rounded-xl border', classi.blocco)}>
      <button onClick={() => apri({ tipo: 'appuntamento', id: a.id })} className="flex-1 min-w-0 px-3 py-2.5 text-left">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {a.patientLastName} {a.patientFirstName}
        </p>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {a.appointmentTime} · {servizioService.nomeDi(a, servizi)} · {servizioService.durataDi(a, servizi)}′
        </p>
        {a.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{a.description}</p>}
      </button>
      <div className="flex items-center gap-1 pr-2">
        <button
          onClick={() => segna('presente')}
          aria-pressed={presenza === 'presente'}
          aria-label={`Segna ${a.patientLastName} come presente`}
          className={clsx(
            'h-10 w-10 rounded-xl flex items-center justify-center transition-colors',
            presenza === 'presente' ? 'bg-emerald-500 text-white' : 'text-gray-400 bg-white/60 dark:bg-gray-800/60',
          )}
        >
          <Check size={18} />
        </button>
        <button
          onClick={() => segna('assente')}
          aria-pressed={presenza === 'assente'}
          aria-label={`Segna ${a.patientLastName} come assente`}
          className={clsx(
            'h-10 w-10 rounded-xl flex items-center justify-center transition-colors',
            presenza === 'assente' ? 'bg-gray-500 text-white' : 'text-gray-400 bg-white/60 dark:bg-gray-800/60',
          )}
        >
          <UserX size={18} />
        </button>
      </div>
    </div>
  )
}

// ─── Vista giorno: settimana + slot della giornata ────────────────────────────

function VistaGiorno({ giorno, setGiorno, tutti, servizi }: { giorno: string; setGiorno: (g: string) => void; tutti: Appointment[]; servizi: Servizio[] }) {
  const conteggi = conteggioPerGiorno(tutti)
  const lunedi = spostaGiorni(giorno, 1 - giornoSettimana(giorno))
  const settimana = Array.from({ length: 7 }, (_, i) => spostaGiorni(lunedi, i))
  const slot = slotDelGiorno(tutti, giorno)
  const fuori = fuoriOrario(tutti, giorno)
  const totale = appuntamentiDelGiorno(tutti, giorno).length
  const liberi = slot.filter((s) => s.libero).length

  return (
    <>
      <div className="mx-3 card p-2">
        <div className="flex items-center justify-between px-1">
          <button onClick={() => setGiorno(spostaGiorni(giorno, -7))} className="tocco flex items-center justify-center text-gray-500" aria-label="Settimana precedente">
            <ChevronLeft size={22} />
          </button>
          <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
            {dataDaChiave(lunedi).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={() => setGiorno(spostaGiorni(giorno, 7))} className="tocco flex items-center justify-center text-gray-500" aria-label="Settimana successiva">
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {settimana.map((g, i) => {
            const scelto = g === giorno
            return (
              <button
                key={g}
                onClick={() => setGiorno(g)}
                className={clsx(
                  'tocco flex flex-col items-center justify-center rounded-xl py-1.5 transition-colors',
                  scelto ? 'bg-teal-600 text-white' : 'text-gray-700 dark:text-gray-300',
                  !scelto && g === oggi() && 'ring-1 ring-teal-500',
                )}
              >
                <span className={clsx('text-[11px]', scelto ? 'text-teal-100' : 'text-gray-400')}>{INTESTAZIONI_SETTIMANA[i]}</span>
                <span className="text-base font-semibold">{dataDaChiave(g).getDate()}</span>
                <span className={clsx('h-1.5 w-1.5 rounded-full mt-0.5', conteggi.get(g) ? (scelto ? 'bg-white' : 'bg-teal-500') : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 pt-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white first-letter:uppercase">{etichettaGiorno(giorno)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {totale === 0 ? 'Nessun appuntamento' : `${totale} ${totale === 1 ? 'appuntamento' : 'appuntamenti'}`} · {liberi}{' '}
            {liberi === 1 ? 'slot libero' : 'slot liberi'}
          </p>
        </div>
        {giorno !== oggi() && (
          <button onClick={() => setGiorno(oggi())} className="min-h-[36px] px-3 rounded-full border border-teal-600 text-sm font-medium text-teal-700 dark:text-teal-400">
            Oggi
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.ul
        key={giorno}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: UI }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        className="px-3 pt-3 space-y-1.5"
      >
        {slot.map((s) => (
          <li key={s.ora} className="flex items-start gap-2">
            <span className="w-11 shrink-0 pt-3 text-right text-xs font-medium tabular-nums text-gray-400">{s.ora}</span>
            <div className="min-w-0 flex-1">
              {s.libero ? (
                <button
                  onClick={() => apri({ tipo: 'appuntamento', data: giorno, ora: s.ora })}
                  className="w-full min-h-[44px] flex items-center gap-2 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 px-3 text-left text-xs text-gray-400 active:bg-teal-50 dark:active:bg-teal-900/20"
                  aria-label={`Fissa un appuntamento alle ${s.ora}`}
                >
                  <Plus size={14} /> Libero
                </button>
              ) : (
                <div className="space-y-1.5">
                  {s.appuntamenti.length > 1 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 pt-1">
                      <TriangleAlert size={13} /> {s.appuntamenti.length} appuntamenti sovrapposti
                    </p>
                  )}
                  {s.appuntamenti.map((a) => (
                    <RigaAppuntamento key={a.id} a={a} servizi={servizi} />
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </motion.ul>
      </AnimatePresence>

      {fuori.length > 0 && (
        <div className="mx-4 mt-4 border-t border-gray-200 dark:border-gray-800 pt-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Clock size={13} /> Fuori orario ({ORA_APERTURA}:00 – {ORA_CHIUSURA}:00)
          </p>
          {fuori.map((a) => (
            <RigaAppuntamento key={a.id} a={a} servizi={servizi} />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Vista mese ───────────────────────────────────────────────────────────────

function VistaMese({ giorno, onScegli, tutti }: { giorno: string; onScegli: (g: string) => void; tutti: Appointment[] }) {
  const [mese, setMese] = useState(() => {
    const d = dataDaChiave(giorno)
    return { anno: d.getFullYear(), mese: d.getMonth() }
  })
  const conteggi = conteggioPerGiorno(tutti)
  const caselle = grigliaMese(mese.anno, mese.mese)
  const sposta = (delta: number) => {
    const d = new Date(mese.anno, mese.mese + delta, 1)
    setMese({ anno: d.getFullYear(), mese: d.getMonth() })
  }

  return (
    <div className="px-3 pt-3">
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => sposta(-1)} className="tocco flex items-center justify-center text-gray-500" aria-label="Mese precedente">
            <ChevronLeft size={22} />
          </button>
          <p className="font-semibold text-gray-900 dark:text-white">{nomeMese(mese.anno, mese.mese)}</p>
          <button onClick={() => sposta(1)} className="tocco flex items-center justify-center text-gray-500" aria-label="Mese successivo">
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">
          {INTESTAZIONI_SETTIMANA.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {caselle.map((c) => {
            const n = conteggi.get(c) ?? 0
            const delMese = stessoMese(c, mese.anno, mese.mese)
            const scelto = c === giorno
            return (
              <button
                key={c}
                onClick={() => onScegli(c)}
                className={clsx(
                  'aspect-square rounded-xl flex flex-col items-center justify-center text-sm',
                  scelto ? 'bg-teal-600 text-white' : delMese ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600',
                  !scelto && c === oggi() && 'ring-1 ring-teal-500',
                )}
              >
                <span className="font-medium">{dataDaChiave(c).getDate()}</span>
                {n > 0 && (
                  <span className={clsx('mt-0.5 min-w-[18px] rounded-full px-1 text-[10px] font-semibold leading-4', scelto ? 'bg-white text-teal-700' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300')}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-3">Tocca un giorno per vederne gli orari.</p>
    </div>
  )
}

// ─── Vista elenco con filtri (come l'elenco del desktop) ──────────────────────

function VistaElenco({ servizi }: { servizi: Servizio[] }) {
  const [filtri, setFiltri] = useState<AppointmentFilters>(EMPTY_APPOINTMENT_FILTERS)
  const [filtriAperti, setFiltriAperti] = useState(false)
  const imposta = (campo: keyof AppointmentFilters, valore: string) => setFiltri((f) => ({ ...f, [campo]: valore }))
  const attivi = Object.values(filtri).filter(Boolean).length

  const elenco = appuntamentoService.getAppointments({ page: 1, pageSize: 10_000, filters: filtri }).data
  const perGiorno = new Map<string, Appointment[]>()
  for (const a of elenco) perGiorno.set(a.appointmentDate, [...(perGiorno.get(a.appointmentDate) ?? []), a])

  return (
    <div className="px-4 pt-3 space-y-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={filtri.patientLastName ?? ''}
          onChange={(e) => imposta('patientLastName', e.target.value)}
          placeholder="Cerca per cognome"
          className="input-field text-base flex-1"
        />
        <button
          onClick={() => setFiltriAperti((v) => !v)}
          className={clsx('tocco relative flex items-center justify-center rounded-xl border', filtriAperti ? 'border-teal-600 text-teal-600' : 'border-gray-200 dark:border-gray-700 text-gray-500')}
          aria-label="Altri filtri"
        >
          <SlidersHorizontal size={18} />
          {attivi > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-teal-600 text-[10px] text-white px-1">{attivi}</span>}
        </button>
      </div>

      {filtriAperti && (
        <div className="card p-4 space-y-3">
          <Select label="Servizio" placeholder="Tutti" options={servizi.map((s) => ({ value: s.id, label: s.nome }))} value={filtri.serviceId ?? ''} onChange={(e) => imposta('serviceId', e.target.value)} />
          <Select
            label="Presenza"
            placeholder="Tutte"
            options={(Object.keys(STATO_PRESENZA_LABELS) as StatoPresenza[]).map((v) => ({ value: v, label: STATO_PRESENZA_LABELS[v] }))}
            value={filtri.presenza ?? ''}
            onChange={(e) => imposta('presenza', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Dal" type="date" value={filtri.dateFrom ?? ''} onChange={(e) => imposta('dateFrom', e.target.value)} />
            <Input label="Al" type="date" value={filtri.dateTo ?? ''} onChange={(e) => imposta('dateTo', e.target.value)} />
          </div>
          {attivi > 0 && (
            <button onClick={() => setFiltri(EMPTY_APPOINTMENT_FILTERS)} className="text-sm font-medium text-teal-700 dark:text-teal-400 min-h-[36px]">
              Azzera filtri
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        {elenco.length} {elenco.length === 1 ? 'appuntamento' : 'appuntamenti'}
      </p>

      {elenco.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12 text-gray-400">
          <CalendarX size={36} className="mb-2" />
          <p className="text-sm">{attivi > 0 ? 'Nessun appuntamento con questi filtri' : 'Nessun appuntamento'}</p>
        </div>
      ) : (
        [...perGiorno.entries()].map(([g, delGiorno]) => (
          <section key={g}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5 first-letter:uppercase">
              {etichettaGiorno(g)}
            </h3>
            <div className="space-y-1.5">
              {delGiorno
                .slice()
                .sort((x, y) => x.appointmentTime.localeCompare(y.appointmentTime))
                .map((a) => (
                  <RigaAppuntamento key={a.id} a={a} servizi={servizi} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

export function Agenda() {
  useDati()
  const [vista, setVista] = useState<Vista>('giorno')
  const [giorno, setGiorno] = useState(oggi())
  const tutti = appuntamentoService.getAllAppointments()
  const servizi = servizioService.getAll()

  return (
    <div className="pb-28">
      <div className="px-3 pt-3 pb-3">
        <Segmenti valore={vista} opzioni={VISTE} onCambia={setVista} />
      </div>

      {vista === 'giorno' && <VistaGiorno giorno={giorno} setGiorno={setGiorno} tutti={tutti} servizi={servizi} />}
      {vista === 'mese' && (
        <VistaMese
          giorno={giorno}
          tutti={tutti}
          onScegli={(g) => {
            setGiorno(g)
            setVista('giorno')
          }}
        />
      )}
      {vista === 'elenco' && <VistaElenco servizi={servizi} />}

      <PulsanteNuovo etichetta="Nuovo appuntamento" onClick={() => apri({ tipo: 'appuntamento', data: vista === 'giorno' ? giorno : oggi() })} />
    </div>
  )
}
