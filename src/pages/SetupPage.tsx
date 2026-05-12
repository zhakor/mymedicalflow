import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useProfiloStore } from '../stores/profiloStore'
import type { ProfiloProfessionista } from '../types'
import { iconaWhite } from '../assets/logos'
import { LogIn } from 'lucide-react'
import { validaPIva } from '../lib/validazioni'

interface Errori {
  professione?: string
  nome?: string
  cognome?: string
  partitaIva?: string
}

function valida(form: Partial<ProfiloProfessionista>): Errori {
  const errori: Errori = {}
  if (!form.professione?.trim()) errori.professione = 'Inserisci la tua professione.'
  if (!form.nome?.trim()) errori.nome = 'Il nome è obbligatorio.'
  if (!form.cognome?.trim()) errori.cognome = 'Il cognome è obbligatorio.'
  const rivaPiva = validaPIva(form.partitaIva ?? '')
  if (!rivaPiva.valido) errori.partitaIva = rivaPiva.errore
  return errori
}

export function SetupPage() {
  const salvaProfilo = useProfiloStore((s) => s.salvaProfilo)

  const [form, setForm] = useState<Partial<ProfiloProfessionista>>({
    professione: undefined,
    nome: '',
    cognome: '',
    partitaIva: '',
  })
  const [errori, setErrori] = useState<Errori>({})
  const [salvataggio, setSalvataggio] = useState(false)

  function handleChange(field: keyof ProfiloProfessionista, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Rimuovi l'errore del campo appena modificato
    if (errori[field as keyof Errori]) {
      setErrori((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = valida(form)
    if (Object.keys(err).length > 0) {
      setErrori(err)
      return
    }
    setSalvataggio(true)
    // Simuliamo un breve ritardo fluido prima di salvare
    setTimeout(() => {
      salvaProfilo(form as ProfiloProfessionista)
    }, 600)
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-teal-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex w-12 h-12 bg-teal-600 rounded-2xl items-center justify-center shadow-lg mb-3">
            <img src={iconaWhite} alt="" className="w-7 h-7 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Benvenuto in MyMedicalFlow
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configura il tuo profilo per iniziare.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Professione"
              required
              placeholder="Es. Logopedista"
              value={form.professione ?? ''}
              onChange={(e) => handleChange('professione', e.target.value)}
              error={errori.professione}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nome"
                required
                placeholder="Es. Maria"
                value={form.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                error={errori.nome}
              />
              <Input
                label="Cognome"
                required
                placeholder="Es. Rossi"
                value={form.cognome}
                onChange={(e) => handleChange('cognome', e.target.value)}
                error={errori.cognome}
              />
            </div>

            <Input
              label="Partita IVA"
              required
              placeholder="Es. 12345678901"
              value={form.partitaIva}
              onChange={(e) => handleChange('partitaIva', e.target.value)}
              error={errori.partitaIva}
            />

            <div className="pt-1">
              <Button
                type="submit"
                className="w-full"
                loading={salvataggio}
                disabled={salvataggio}
              >
                <LogIn size={16} />
                Inizia a usare MyMedicalFlow
              </Button>
            </div>
          </form>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-3">
          Tutti i dati vengono salvati localmente sul tuo dispositivo.
        </p>
      </div>
    </div>
  )
}
