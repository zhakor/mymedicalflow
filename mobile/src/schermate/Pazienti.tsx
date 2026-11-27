import { useState } from 'react'
import { Search, Phone, ChevronRight, UserX, MessageCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { UI } from '../componenti/Movimento'
import { Badge } from '@desktop/components/ui/Badge'
import { pazienteService } from '@desktop/lib/pazienteService'
import { WEEKDAY_LABELS, type Patient } from '@desktop/types/paziente'
import { useDati } from '../dati/hooks'
import { apri } from '../navigazione'
import { PulsanteNuovo } from '../componenti/Campi'
import { collegamentoWhatsApp, eta, iniziali } from './formato'

/** Telefono da chiamare: quello del paziente o, per l'età evolutiva, del tutore. */
export function telefonoDi(p: Patient): string | undefined {
  return p.phoneNumber || p.guardian?.phoneNumber
}

type Filtro = 'tutti' | 'evolutiva' | 'adulti'

const FILTRI: { valore: Filtro; etichetta: string }[] = [
  { valore: 'tutti', etichetta: 'Tutti' },
  { valore: 'evolutiva', etichetta: 'Età evolutiva' },
  { valore: 'adulti', etichetta: 'Adulti' },
]

export function Pazienti() {
  useDati()
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tutti')

  const tutti = pazienteService
    .getPatients({ page: 1, pageSize: 10_000, filters: {} })
    .data.slice()
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'it'))
  const testo = cerca.trim().toLowerCase()
  const elenco = tutti.filter((p) => {
    if (filtro === 'evolutiva' && !p.developmentalAge) return false
    if (filtro === 'adulti' && p.developmentalAge) return false
    // "nome cognome" e "cognome nome" trovano entrambi lo stesso paziente
    return !testo || `${p.firstName} ${p.lastName} ${p.firstName} ${p.fiscalCode ?? ''}`.toLowerCase().includes(testo)
  })

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 vetro-spesso border-0 border-b px-4 pt-3 pb-2 space-y-2">
        <label className="relative block">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca per nome o codice fiscale"
            className="input-field pl-10 text-base"
          />
        </label>
        <div className="flex items-center gap-2">
          {FILTRI.map((f) => (
            <button
              key={f.valore}
              onClick={() => setFiltro(f.valore)}
              aria-pressed={filtro === f.valore}
              className={clsx(
                'min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors',
                filtro === f.valore
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white/60 dark:bg-white/[0.06] border-white/70 dark:border-white/10 text-gray-600 dark:text-gray-300',
              )}
            >
              {f.etichetta}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            {elenco.length} {elenco.length === 1 ? 'paziente' : 'pazienti'}
          </span>
        </div>
      </div>

      <ul className="px-4 pt-1 space-y-2">
        {elenco.map((p, i) => {
          const telefono = telefonoDi(p)
          const whatsapp = telefono ? collegamentoWhatsApp(telefono) : null
          return (
            <motion.li
              key={p.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...UI, delay: Math.min(i, 5) * 0.05 }}
              className="card p-0 flex items-center"
            >
              <button onClick={() => apri({ tipo: 'cartella', id: p.id })} className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left">
                <span className="h-11 w-11 shrink-0 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                  {iniziali(p)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-gray-900 dark:text-white truncate">
                    {p.lastName} {p.firstName}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 min-w-0">
                    {p.birthDate && <span className="shrink-0">{eta(p.birthDate)} anni</span>}
                    {p.developmentalAge && <Badge variant="info" className="shrink-0 whitespace-nowrap">Età evolutiva</Badge>}
                    {p.fixedSlot && (
                      <span className="truncate">
                        · {WEEKDAY_LABELS[p.fixedSlot.weekday].slice(0, 3)} {p.fixedSlot.time}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </button>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tocco flex items-center justify-center rounded-xl text-emerald-600 dark:text-emerald-400"
                  aria-label={`Scrivi su WhatsApp a ${p.firstName} ${p.lastName}`}
                >
                  <MessageCircle size={20} />
                </a>
              )}
              {telefono && (
                <a
                  href={`tel:${telefono.replace(/\s/g, '')}`}
                  className="tocco flex items-center justify-center mr-2 rounded-xl text-teal-600 dark:text-teal-400"
                  aria-label={`Chiama ${p.firstName} ${p.lastName}`}
                >
                  <Phone size={20} />
                </a>
              )}
            </motion.li>
          )
        })}
      </ul>

      {elenco.length === 0 && (
        <div className="flex flex-col items-center text-center py-14 text-gray-400">
          <UserX size={36} className="mb-2" />
          <p className="text-sm">{testo || filtro !== 'tutti' ? 'Nessun paziente trovato' : 'Nessun paziente in archivio'}</p>
        </div>
      )}

      <PulsanteNuovo etichetta="Aggiungi paziente" onClick={() => apri({ tipo: 'paziente' })} />
    </div>
  )
}
