import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { useProfiloStore } from '../stores/profiloStore'
import type { ProfiloProfessionista } from '../types'
import { GENDER_OPTIONS } from '../types/paziente'
import { iconaWhite } from '../assets/logos'
import { LogIn } from 'lucide-react'
import { validaPIva, validaCodiceFiscale } from '../lib/validazioni'

interface Errori {
  professione?: string
  nome?: string
  cognome?: string
  sesso?: string
  partitaIva?: string
  codiceFiscale?: string
}

function valida(form: Partial<ProfiloProfessionista>): Errori {
  const errori: Errori = {}
  if (!form.professione?.trim()) errori.professione = 'Inserisci la tua professione.'
  if (!form.nome?.trim()) errori.nome = 'Il nome è obbligatorio.'
  if (!form.cognome?.trim()) errori.cognome = 'Il cognome è obbligatorio.'
  if (!form.sesso) errori.sesso = 'Il sesso è obbligatorio.'
  const rivaPiva = validaPIva(form.partitaIva ?? '')
  if (!rivaPiva.valido) errori.partitaIva = rivaPiva.errore
  // Serve al Sistema TS, che identifica con questo l'erogatore della prestazione
  const riCf = validaCodiceFiscale(form.codiceFiscale ?? '')
  if (!riCf.valido) errori.codiceFiscale = riCf.errore
  return errori
}

export function SetupPage() {
  const salvaProfilo = useProfiloStore((s) => s.salvaProfilo)

  const [form, setForm] = useState<Partial<ProfiloProfessionista>>({
    professione: undefined,
    nome: '',
    cognome: '',
    partitaIva: '',
    codiceFiscale: '',
    // Il dispositivo di emissione richiesto dal Sistema TS vale 1 per un
    // professionista singolo: si imposta qui e resta modificabile dal Profilo,
    // per non chiedere all'avvio un dato tecnico che quasi nessuno cambia.
    dispositivo: 1,
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
    <div className="h-full overflow-y-auto overscroll-contain bg-gradient-to-br from-teal-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
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

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Sesso"
                required
                options={GENDER_OPTIONS}
                value={form.sesso ?? ''}
                onChange={(e) => handleChange('sesso', e.target.value)}
                error={errori.sesso}
              />
              <Input
                label="Partita IVA"
                required
                placeholder="Es. 12345678901"
                value={form.partitaIva}
                onChange={(e) => handleChange('partitaIva', e.target.value)}
                error={errori.partitaIva}
              />
            </div>

            <Input
              label="Codice fiscale"
              required
              placeholder="Es. RSSMRA80A01H501U"
              value={form.codiceFiscale ?? ''}
              onChange={(e) => handleChange('codiceFiscale', e.target.value.toUpperCase())}
              error={errori.codiceFiscale}
              className="uppercase"
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
