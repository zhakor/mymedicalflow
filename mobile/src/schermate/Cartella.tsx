import { useState, type ReactNode } from 'react'
import { Pencil, Trash2, Phone, MessageCircle, CalendarPlus, User, MapPin, Users, FileText, Calendar, Repeat } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence } from 'motion/react'
import { Badge } from '@desktop/components/ui/Badge'
import { Button } from '@desktop/components/ui/Button'
import { pazienteService } from '@desktop/lib/pazienteService'
import { appuntamentoService } from '@desktop/lib/appuntamentoService'
import { fatturaService } from '@desktop/lib/fatturaService'
import { servizioService } from '@desktop/lib/servizioService'
import { meseDi, riepilogoMensile } from '@desktop/lib/presenzaService'
import { oggi } from '@desktop/lib/agendaService'
import { GENDER_LABELS, WEEKDAY_LABELS } from '@desktop/types/paziente'
import { STATO_PRESENZA_DEFAULT, STATO_PRESENZA_LABELS } from '@desktop/types/appuntamento'
import { useDati } from '../dati/hooks'
import { apri, avvisa, chiudi } from '../navigazione'
import { Pagina, Sezione } from '../componenti/Pagina'
import { Conferma } from '../componenti/Conferma'
import { VoceFattura } from '../componenti/VoceFattura'
import { collegamentoWhatsApp, dataBreve, eta, iniziali } from './formato'
import { telefonoDi } from './Pazienti'

function Dato({ etichetta, valore }: { etichetta: string; valore?: ReactNode }) {
  if (valore === undefined || valore === null || valore === '') return null
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-gray-500 dark:text-gray-400 shrink-0">{etichetta}</dt>
      <dd className="text-gray-900 dark:text-gray-100 font-medium text-right break-words min-w-0">{valore}</dd>
    </div>
  )
}

const dataLunga = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })

export function Cartella({ id }: { id: string }) {
  useDati()
  const [eliminando, setEliminando] = useState(false)
  const p = pazienteService.getById(id)

  if (!p) {
    return (
      <Pagina titolo="Cartella clinica">
        <p className="text-center text-sm text-gray-500 py-10 px-6">Questo paziente non è più in archivio.</p>
      </Pagina>
    )
  }

  const servizi = servizioService.getAll()
  const appuntamenti = appuntamentoService.getByPatientId(p.id)
  const fatture = fatturaService.getByPatient(p.id, p.fiscalCode)
  // Come il desktop: le sedute svolte nel mese in corso, non il totale storico
  const svolteQuestoMese = riepilogoMensile(p.id, meseDi(oggi()), appuntamenti, servizi).presenti
  const telefono = telefonoDi(p)
  const whatsapp = telefono ? collegamentoWhatsApp(telefono) : null
  // Per l'età evolutiva senza cellulare del paziente si contatta il tutore
  const delTutore = !!p.guardian?.phoneNumber && !p.phoneNumber
  const g = p.guardian
  const residenzaTutore = g && (g.address || g.city || g.postalCode || g.province)

  function elimina() {
    pazienteService.delete(p!.id)
    setEliminando(false)
    avvisa('Paziente eliminato.')
    chiudi()
  }

  return (
    <Pagina
      titolo="Cartella clinica"
      azioni={
        <>
          <button onClick={() => apri({ tipo: 'paziente', id: p.id })} className="tocco flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300" aria-label="Modifica paziente">
            <Pencil size={20} />
          </button>
          <button onClick={() => setEliminando(true)} className="tocco flex items-center justify-center rounded-xl text-red-500" aria-label="Elimina paziente">
            <Trash2 size={20} />
          </button>
        </>
      }
    >
      <div className="px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
        <div className="flex items-center gap-4 px-1">
          <span className="h-16 w-16 shrink-0 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-xl font-semibold">
            {iniziali(p)}
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold text-gray-900 dark:text-white">
              {p.firstName} {p.lastName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {p.birthDate && <span className="text-sm text-gray-500">{eta(p.birthDate)} anni</span>}
              {p.developmentalAge && <Badge variant="info">Età evolutiva</Badge>}
            </div>
          </div>
        </div>

        {telefono && (
          <div className="grid grid-cols-2 gap-3">
            <a href={`tel:${telefono.replace(/\s/g, '')}`} className="btn-secondary tocco flex items-center justify-center gap-1.5 whitespace-nowrap px-2 text-sm">
              <Phone size={18} /> Chiama{delTutore ? ' tutore' : ''}
            </a>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary tocco flex items-center justify-center gap-1.5 whitespace-nowrap px-2 text-sm text-emerald-700 dark:text-emerald-400"
              >
                <MessageCircle size={18} /> WhatsApp{delTutore ? ' tutore' : ''}
              </a>
            )}
          </div>
        )}
        <Button className="tocco w-full" onClick={() => apri({ tipo: 'appuntamento', pazienteId: p.id })}>
          <CalendarPlus size={18} /> Nuovo appuntamento
        </Button>

        <Sezione titolo="Dati anagrafici" icona={<User size={17} />}>
          <dl className="divide-y divide-gray-50 dark:divide-gray-800/60">
            <Dato etichetta="Codice fiscale" valore={p.fiscalCode || '—'} />
            <Dato etichetta="Data di nascita" valore={p.birthDate ? `${dataLunga(p.birthDate)} (${eta(p.birthDate)} anni)` : '—'} />
            <Dato etichetta="Sesso" valore={p.gender ? GENDER_LABELS[p.gender] : '—'} />
            <Dato etichetta="Cellulare" valore={p.phoneNumber || '—'} />
            <Dato etichetta="Registrato il" valore={dataLunga(p.createdAt)} />
            {p.fixedSlot && (
              <Dato
                etichetta="Giorno fisso"
                valore={
                  <span className="inline-flex items-center gap-1">
                    <Repeat size={13} /> {WEEKDAY_LABELS[p.fixedSlot.weekday]} alle {p.fixedSlot.time}
                  </span>
                }
              />
            )}
          </dl>
        </Sezione>

        {(p.address || p.city || p.postalCode || p.province) && (
          <Sezione titolo="Residenza" icona={<MapPin size={17} />}>
            <dl className="divide-y divide-gray-50 dark:divide-gray-800/60">
              <Dato etichetta="Indirizzo" valore={p.address} />
              <Dato etichetta="Città" valore={p.city} />
              <Dato etichetta="CAP" valore={p.postalCode} />
              <Dato etichetta="Provincia" valore={p.province} />
            </dl>
          </Sezione>
        )}

        {p.developmentalAge && g && (
          <Sezione titolo="Dati tutore" icona={<Users size={17} />}>
            <dl className="divide-y divide-gray-50 dark:divide-gray-800/60">
              <Dato etichetta="Nome completo" valore={`${g.firstName} ${g.lastName}`} />
              <Dato etichetta="Codice fiscale" valore={g.fiscalCode} />
              <Dato etichetta="Sesso" valore={g.gender && GENDER_LABELS[g.gender]} />
              <Dato etichetta="Data di nascita" valore={g.birthDate && `${dataLunga(g.birthDate)} (${eta(g.birthDate)} anni)`} />
              <Dato etichetta="Cellulare" valore={g.phoneNumber || '—'} />
            </dl>
          </Sezione>
        )}

        {p.developmentalAge && residenzaTutore && (
          <Sezione titolo="Residenza tutore" icona={<MapPin size={17} />}>
            <dl className="divide-y divide-gray-50 dark:divide-gray-800/60">
              <Dato etichetta="Indirizzo" valore={g!.address} />
              <Dato etichetta="Città" valore={g!.city} />
              <Dato etichetta="CAP" valore={g!.postalCode} />
              <Dato etichetta="Provincia" valore={g!.province} />
            </dl>
          </Sezione>
        )}

        {p.notes && (
          <Sezione titolo="Note" icona={<FileText size={17} />}>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{p.notes}</p>
          </Sezione>
        )}

        <Sezione
          titolo="Appuntamenti associati"
          icona={<Calendar size={17} />}
          extra={
            <Badge variant={svolteQuestoMese > 0 ? 'info' : 'muted'}>
              {svolteQuestoMese} volt{svolteQuestoMese === 1 ? 'a' : 'e'} questo mese
            </Badge>
          }
        >
          {appuntamenti.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nessun appuntamento associato a questo paziente.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {appuntamenti.map((a) => {
                const presenza = a.presenza ?? STATO_PRESENZA_DEFAULT
                return (
                  <li key={a.id}>
                    <button onClick={() => apri({ tipo: 'appuntamento', id: a.id })} className="w-full flex items-center gap-3 py-2.5 text-left">
                      <span className="w-20 shrink-0 text-sm text-gray-700 dark:text-gray-300 tabular-nums">{dataBreve(a.appointmentDate)}</span>
                      <span className="w-11 shrink-0 text-sm text-gray-500 tabular-nums">{a.appointmentTime}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                          <span className={clsx('h-2 w-2 rounded-full shrink-0', servizioService.classiDi(a, servizi).punto)} />
                          {servizioService.nomeDi(a, servizi)}
                        </span>
                        {a.description && <span className="block text-xs text-gray-500 truncate">{a.description}</span>}
                      </span>
                      <Badge variant={presenza === 'presente' ? 'success' : presenza === 'assente' ? 'error' : 'muted'}>
                        {STATO_PRESENZA_LABELS[presenza]}
                      </Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Sezione>

        <Sezione
          titolo="Fatture associate"
          icona={<FileText size={17} />}
          extra={
            <Badge variant={fatture.length > 0 ? 'success' : 'muted'}>
              {fatture.length} fattur{fatture.length === 1 ? 'a' : 'e'}
            </Badge>
          }
        >
          {fatture.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nessuna fattura emessa per questo paziente.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 -my-3">
              {fatture.map((f) => (
                <VoceFattura key={f.id} fattura={f} />
              ))}
            </div>
          )}
        </Sezione>
      </div>

      <AnimatePresence>
      {eliminando && (
        <Conferma titolo="Elimina paziente" etichetta="Elimina" onConferma={elimina} onAnnulla={() => setEliminando(false)}>
          Sei sicuro di voler eliminare il paziente{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {p.firstName} {p.lastName}
          </span>
          ?
          <span className="block text-red-500 text-xs mt-1">Questa azione non può essere annullata.</span>
        </Conferma>
      )}
      </AnimatePresence>
    </Pagina>
  )
}
