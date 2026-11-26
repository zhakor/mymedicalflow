import { useState } from 'react'
import { Moon, Sun, MonitorSmartphone, Cloud } from 'lucide-react'
import { Button } from '@desktop/components/ui/Button'
import { profiloService } from '@desktop/lib/profiloService'
import { useDati } from '../dati/hooks'
import { useSincronizzazione } from '../dati/sincronizzazione'
import { VERSIONE } from '../versione'
import { cambiaTema, temaScuro } from '../tema'

export function Altro() {
  useDati()
  const profilo = profiloService.get()
  const { revisione, aggiornatoIl, sync, simulatore } = useSincronizzazione()
  const [inviando, setInviando] = useState(false)
  const [esito, setEsito] = useState<string | null>(null)
  const scuro = temaScuro()

  async function simula() {
    if (!simulatore) return
    setInviando(true)
    try {
      setEsito(`Il PC ha aggiunto: ${await simulatore.aggiungiAppuntamento()}`)
    } finally {
      setInviando(false)
    }
  }

  return (
    <div className="px-4 py-4 space-y-3 pb-6">
      {profilo && (
        <section className="card p-4 flex items-center gap-4">
          {profilo.fotoProfilo ? (
            <img src={profilo.fotoProfilo} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="h-14 w-14 rounded-full bg-teal-600 text-white flex items-center justify-center text-lg font-semibold">
              {profilo.nome.charAt(0)}
              {profilo.cognome.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">
              {profilo.nome} {profilo.cognome}
            </p>
            <p className="text-sm text-gray-500">{profilo.professione}</p>
          </div>
        </section>
      )}

      <section className="card p-0">
        <button
          onClick={() => cambiaTema(!scuro)}
          className="w-full tocco flex items-center gap-3 px-4 py-3 text-left"
        >
          {scuro ? <Moon size={20} className="text-teal-600" /> : <Sun size={20} className="text-teal-600" />}
          <span className="flex-1 text-gray-900 dark:text-white">Tema scuro</span>
          <span
            className={`relative h-6 w-11 rounded-full transition-colors ${scuro ? 'bg-teal-600' : 'bg-gray-300'}`}
            aria-hidden
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${scuro ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>
      </section>

      <section className="card p-4 space-y-1">
        <h3 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
          <Cloud size={18} className="text-teal-600" /> Sincronizzazione
        </h3>
        <p className="text-sm text-gray-500">
          {sync === 'offline' ? 'Offline' : `Revisione ${revisione ?? '—'}`}
          {aggiornatoIl && ` · ultimo controllo ${new Date(aggiornatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </p>
      </section>

      {simulatore && (
        <section className="card p-4 space-y-3 border-dashed border-teal-300 dark:border-teal-800">
          <h3 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
            <MonitorSmartphone size={18} className="text-teal-600" /> Modalità simulata
          </h3>
          <p className="text-sm text-gray-500">
            Drive e Firestore sono simulati in memoria e i dati sono di esempio. Il pulsante fa aggiungere un appuntamento
            di oggi al «PC dello studio»: compare in Agenda senza ricaricare.
          </p>
          <Button className="w-full tocco" onClick={simula} loading={inviando}>
            Simula un appuntamento dal PC
          </Button>
          {esito && <p className="text-sm text-teal-700 dark:text-teal-400">{esito}</p>}
        </section>
      )}

      {/* Versione (commit) e ora di compilazione: per capire se il telefono ha l'ultima */}
      <p className="text-center text-xs text-gray-400 pt-2">
        MyMedicalFlow mobile — anteprima
        <span className="block tabular-nums mt-0.5">{VERSIONE}</span>
      </p>
    </div>
  )
}
