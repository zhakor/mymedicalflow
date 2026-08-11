import { useState } from 'react'
import { clsx } from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { servizioService } from '../../lib/servizioService'
import { appuntamentoService } from '../../lib/appuntamentoService'
import type { ColoreServizio, Servizio } from '../../types/servizio'
import {
  COLORE_SERVIZIO_OPTIONS,
  COLORI_SERVIZIO,
  DURATA_OPTIONS,
} from '../../types/servizio'
import { Briefcase, Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'

interface ServiziCardProps {
  onFeedback: (messaggio: string, tipo?: 'success' | 'error') => void
}

interface FormServizio {
  nome: string
  durataMinuti: string
  prezzo: string
  colore: ColoreServizio
}

const FORM_VUOTO: FormServizio = {
  nome: '',
  durataMinuti: '45',
  prezzo: '',
  colore: 'teal',
}

function formDa(s: Servizio): FormServizio {
  return {
    nome: s.nome,
    durataMinuti: String(s.durataMinuti),
    prezzo: s.prezzo ? String(s.prezzo) : '',
    colore: s.colore,
  }
}

const formatEuro = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)

export function ServiziCard({ onFeedback }: ServiziCardProps) {
  const [servizi, setServizi] = useState<Servizio[]>(() => servizioService.getAll())
  /** `null` = nessuna riga aperta, `'nuovo'` = riga di creazione. */
  const [inModifica, setInModifica] = useState<string | null>(null)
  const [form, setForm] = useState<FormServizio>(FORM_VUOTO)
  const [errore, setErrore] = useState<string | null>(null)

  function ricarica() {
    setServizi(servizioService.getAll())
  }

  function apriNuovo() {
    setForm(FORM_VUOTO)
    setErrore(null)
    setInModifica('nuovo')
  }

  function apriModifica(s: Servizio) {
    setForm(formDa(s))
    setErrore(null)
    setInModifica(s.id)
  }

  function chiudi() {
    setInModifica(null)
    setErrore(null)
  }

  function valida(): { nome: string; durataMinuti: number; prezzo: number } | null {
    const nome = form.nome.trim()
    if (!nome) {
      setErrore('Il nome del servizio è obbligatorio.')
      return null
    }
    // Un doppione di nome rende indistinguibili due voci nell'elenco a tendina
    const duplicato = servizi.some(
      (s) => s.id !== inModifica && s.nome.trim().toLowerCase() === nome.toLowerCase(),
    )
    if (duplicato) {
      setErrore('Esiste già un servizio con questo nome.')
      return null
    }
    const durataMinuti = Number(form.durataMinuti)
    // La virgola è la separazione decimale italiana, e chi digita la usa
    const prezzo = form.prezzo.trim() ? Number(form.prezzo.replace(',', '.')) : 0
    if (!Number.isFinite(prezzo) || prezzo < 0) {
      setErrore('Il prezzo non è un importo valido.')
      return null
    }
    return { nome, durataMinuti, prezzo }
  }

  function salva() {
    const dati = valida()
    if (!dati) return

    if (inModifica === 'nuovo') {
      servizioService.create({ ...dati, colore: form.colore, attivo: true })
      onFeedback('Servizio creato.')
    } else if (inModifica) {
      servizioService.update(inModifica, { ...dati, colore: form.colore })
      onFeedback('Servizio aggiornato.')
    }
    ricarica()
    chiudi()
  }

  function cambiaAttivo(s: Servizio) {
    servizioService.update(s.id, { attivo: !s.attivo })
    ricarica()
    onFeedback(s.attivo ? `"${s.nome}" non verrà più proposto.` : `"${s.nome}" è di nuovo disponibile.`)
  }

  function rimuovi(s: Servizio) {
    const esito = servizioService.rimuovi(s.id, appuntamentoService.getAllAppointments())
    ricarica()
    onFeedback(
      esito.eliminato
        ? `"${s.nome}" eliminato.`
        : `"${s.nome}" è usato da appuntamenti esistenti: è stato disattivato invece che eliminato.`,
    )
  }

  const rigaForm = (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-900/10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Nome"
          placeholder="Es. Logopedia infantile"
          value={form.nome}
          onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
          autoFocus
        />
        <Select
          label="Durata"
          options={DURATA_OPTIONS}
          value={form.durataMinuti}
          onChange={(e) => setForm((p) => ({ ...p, durataMinuti: e.target.value }))}
        />
        <Input
          label="Prezzo"
          placeholder="0,00"
          value={form.prezzo}
          onChange={(e) => setForm((p) => ({ ...p, prezzo: e.target.value }))}
        />
        <Select
          label="Colore in agenda"
          options={COLORE_SERVIZIO_OPTIONS}
          value={form.colore}
          onChange={(e) =>
            setForm((p) => ({ ...p, colore: e.target.value as ColoreServizio }))
          }
        />
      </div>

      {errore && <p className="mt-2 text-sm text-red-500">{errore}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={chiudi}>
          <X size={14} />
          Annulla
        </Button>
        <Button type="button" size="sm" onClick={salva}>
          <Check size={14} />
          Salva
        </Button>
      </div>
    </div>
  )

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-teal-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Servizi
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Le prestazioni che offri. La durata riserva lo spazio in agenda, il
            prezzo serve a confrontare le sedute svolte con l'importo in fattura.
          </p>
        </div>
        {inModifica !== 'nuovo' && (
          <Button type="button" size="sm" onClick={apriNuovo}>
            <Plus size={14} />
            Nuovo
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {inModifica === 'nuovo' && rigaForm}

        {servizi.map((s) =>
          inModifica === s.id ? (
            <div key={s.id}>{rigaForm}</div>
          ) : (
            <div
              key={s.id}
              className={clsx(
                'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                s.attivo
                  ? 'border-gray-200 dark:border-gray-800'
                  : 'border-dashed border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30',
              )}
            >
              <span
                className={clsx(
                  'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                  COLORI_SERVIZIO[s.colore].punto,
                  !s.attivo && 'opacity-40',
                )}
              />

              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    'truncate text-sm font-medium',
                    s.attivo
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {s.nome}
                  {!s.attivo && (
                    <span className="ml-2 text-xs font-normal">(non più proposto)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {s.durataMinuti} minuti ·{' '}
                  {s.prezzo > 0 ? (
                    formatEuro(s.prezzo)
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      prezzo da impostare
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => apriModifica(s)}
                  aria-label={`Modifica ${s.nome}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-teal-600 dark:hover:bg-gray-800"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => cambiaAttivo(s)}
                  aria-label={s.attivo ? `Disattiva ${s.nome}` : `Riattiva ${s.nome}`}
                  title={s.attivo ? 'Non proporre più' : 'Rendi di nuovo disponibile'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-amber-600 dark:hover:bg-gray-800"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => rimuovi(s)}
                  aria-label={`Elimina ${s.nome}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}

        {servizi.length === 0 && inModifica !== 'nuovo' && (
          <p className="py-6 text-center text-sm text-gray-400">
            Nessun servizio configurato.
          </p>
        )}
      </div>
    </Card>
  )
}
