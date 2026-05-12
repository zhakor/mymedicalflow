import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { useProfiloStore } from '../stores/profiloStore'
import type { ProfiloProfessionista } from '../types'
import { Pencil, Check, X } from 'lucide-react'
import { validaPIva, validaDataNascita, validaSePresente } from '../lib/validazioni'

interface Errori {
  professione?: string
  nome?: string
  cognome?: string
  partitaIva?: string
  dataNascita?: string
}

function valida(form: Partial<ProfiloProfessionista>): Errori {
  const errori: Errori = {}
  if (!form.professione?.trim()) errori.professione = 'Inserisci la tua professione.'
  if (!form.nome?.trim()) errori.nome = 'Il nome è obbligatorio.'
  if (!form.cognome?.trim()) errori.cognome = 'Il cognome è obbligatorio.'
  const rivaPiva = validaPIva(form.partitaIva ?? '')
  if (!rivaPiva.valido) errori.partitaIva = rivaPiva.errore
  const riDataNascita = validaSePresente(form.dataNascita, validaDataNascita)
  if (!riDataNascita.valido) errori.dataNascita = riDataNascita.errore
  return errori
}

export function ProfiloPage() {
  const { profilo, salvaProfilo } = useProfiloStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProfiloProfessionista>(
    profilo ?? {
      professione: 'logopedista',
      nome: '',
      cognome: '',
      partitaIva: '',
      dataNascita: '',
    },
  )
  const [errori, setErrori] = useState<Errori>({})
  const [feedbackSalvataggio, setFeedbackSalvataggio] = useState(false)

  function handleChange(field: keyof ProfiloProfessionista, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errori[field as keyof Errori]) {
      setErrori((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((prev) => ({ ...prev, fotoProfilo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  function handleSalva() {
    const err = valida(form)
    if (Object.keys(err).length > 0) {
      setErrori(err)
      return
    }
    salvaProfilo(form)
    setEditing(false)
    setFeedbackSalvataggio(true)
    setTimeout(() => setFeedbackSalvataggio(false), 3000)
  }

  function handleAnnulla() {
    setForm(
      profilo ?? {
        professione: 'logopedista',
        nome: '',
        cognome: '',
        partitaIva: '',
        dataNascita: '',
      },
    )
    setErrori({})
    setEditing(false)
  }

  const avatarLettera = profilo?.nome?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Profilo
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Il tuo profilo
          </h2>
        </div>

        {!editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Modifica
          </Button>
        )}
      </div>

      {/* Feedback salvataggio */}
      {feedbackSalvataggio && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 flex items-center gap-2 text-teal-700 dark:text-teal-400 text-sm">
          <Check size={16} />
          Profilo salvato con successo.
        </div>
      )}

      <Card>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-24 h-24 rounded-2xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center overflow-hidden border-2 border-teal-200 dark:border-teal-800">
              {(editing ? form.fotoProfilo : profilo?.fotoProfilo) ? (
                <img
                  src={editing ? form.fotoProfilo : profilo?.fotoProfilo}
                  alt="Foto profilo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-teal-600 dark:text-teal-400">
                  {avatarLettera}
                </span>
              )}
            </div>
            {editing && (
              <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-teal-700 transition-colors">
                <Pencil size={14} className="text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFotoChange}
                />
              </label>
            )}
          </div>

          {/* Info o Form */}
          {!editing ? (
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {profilo?.nome} {profilo?.cognome}
                </h3>
                {profilo?.professione && (
                  <Badge className="mt-1">
                    {profilo.professione}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">
                    Partita IVA
                  </p>
                  <p className="text-gray-900 dark:text-white mt-0.5">
                    {profilo?.partitaIva || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">
                    Data di nascita
                  </p>
                  <p className="text-gray-900 dark:text-white mt-0.5">
                    {profilo?.dataNascita
                      ? new Date(profilo.dataNascita).toLocaleDateString('it-IT')
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              <Input
                label="Professione"
                required
                placeholder="Es. Logopedista"
                value={form.professione}
                onChange={(e) => handleChange('professione', e.target.value)}
                error={errori.professione}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nome"
                  required
                  value={form.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  error={errori.nome}
                />
                <Input
                  label="Cognome"
                  required
                  value={form.cognome}
                  onChange={(e) => handleChange('cognome', e.target.value)}
                  error={errori.cognome}
                />
              </div>
              <Input
                label="Partita IVA"
                required
                value={form.partitaIva}
                onChange={(e) => handleChange('partitaIva', e.target.value)}
                error={errori.partitaIva}
              />
              <Input
                label="Data di nascita"
                type="date"
                value={form.dataNascita}
                onChange={(e) => handleChange('dataNascita', e.target.value)}
                error={errori.dataNascita}
              />

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSalva}>
                  <Check size={16} />
                  Salva
                </Button>
                <Button variant="secondary" onClick={handleAnnulla}>
                  <X size={16} />
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
