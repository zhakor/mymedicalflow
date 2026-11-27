import type { ReactNode } from 'react'
import { Users, Calendar, FileText, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { Comparsa } from '../componenti/Movimento'
import { Badge } from '@desktop/components/ui/Badge'
import { pazienteService } from '@desktop/lib/pazienteService'
import { fatturaService } from '@desktop/lib/fatturaService'
import { appuntamentoService } from '@desktop/lib/appuntamentoService'
import { profiloService } from '@desktop/lib/profiloService'
import { servizioService } from '@desktop/lib/servizioService'
import { appuntamentiDelGiorno, etichettaGiorno, oggi } from '@desktop/lib/agendaService'
import { salutoPerSesso } from '@desktop/types'
import { iconaBlue, iconaWhite } from '@desktop/assets/logos'
import { useDati } from '../dati/hooks'
import { apri } from '../navigazione'
import type { Scheda } from '../componenti/Layout'

function Contatore({ icona, etichetta, valore, nota, onClick }: { icona: ReactNode; etichetta: string; valore: number; nota: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 w-full flex items-center gap-4 text-left active:scale-[0.99] transition-transform">
      <span className="h-12 w-12 shrink-0 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center">
        {icona}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-gray-500 dark:text-gray-400">{etichetta}</span>
        <span className="block text-2xl font-semibold text-gray-900 dark:text-white leading-tight">{valore}</span>
        <span className="block text-xs text-gray-400 mt-0.5">{nota}</span>
      </span>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </button>
  )
}

export function Home({ onScheda }: { onScheda: (s: Scheda) => void }) {
  useDati()
  const profilo = profiloService.get()
  const servizi = servizioService.getAll()
  const totalePazienti = pazienteService.getPatients({ page: 1, pageSize: 1, filters: {} }).totalItems
  const totaleFatture = fatturaService.getCount()
  const inAttesa = fatturaService.getInvoices({ page: 1, pageSize: 1, filters: { status: 'in_attesa' } }).totalItems
  const diOggi = appuntamentiDelGiorno(appuntamentoService.getAllAppointments(), oggi())

  const nome = profilo ? `${profilo.nome} ${profilo.cognome}` : 'Professionista'

  return (
    <div className="px-4 py-5 space-y-4 pb-24">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 first-letter:uppercase">{etichettaGiorno(oggi())}</p>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
          {salutoPerSesso(profilo?.sesso)}, {nome} 👋
        </h2>
        {profilo?.professione && <Badge className="mt-2">{profilo.professione}</Badge>}
      </div>

      <div className="space-y-3">
        <Comparsa i={0}>
        <Contatore
          icona={<Users size={22} />}
          etichetta="Pazienti"
          valore={totalePazienti}
          nota={totalePazienti === 1 ? '1 paziente registrato' : `${totalePazienti} pazienti registrati`}
          onClick={() => onScheda('pazienti')}
        />
        </Comparsa>
        <Comparsa i={1}>
        <Contatore
          icona={<Calendar size={22} />}
          etichetta="Appuntamenti"
          valore={diOggi.length}
          nota={diOggi.length === 1 ? '1 appuntamento oggi' : `${diOggi.length} appuntamenti oggi`}
          onClick={() => onScheda('agenda')}
        />
        </Comparsa>
        <Comparsa i={2}>
        <Contatore
          icona={<FileText size={22} />}
          etichetta="Fatture"
          valore={totaleFatture}
          nota={inAttesa > 0 ? `${inAttesa} in attesa di pagamento` : 'Nessuna fattura in attesa'}
          onClick={() => onScheda('fatture')}
        />
        </Comparsa>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Oggi</h3>
        {diOggi.length === 0 ? (
          <p className="text-sm text-gray-500">Nessun appuntamento oggi.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {diOggi.map((a) => (
              <li key={a.id}>
                <button onClick={() => apri({ tipo: 'appuntamento', id: a.id })} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <span className="w-12 text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{a.appointmentTime}</span>
                  <span className={clsx('h-2 w-2 rounded-full shrink-0', servizioService.classiDi(a, servizi).punto)} />
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-700 dark:text-gray-300">
                    {a.patientLastName} {a.patientFirstName}
                  </span>
                  <span className="text-xs text-gray-400">{servizioService.nomeDi(a, servizi)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 flex items-start gap-3">
        <img src={iconaBlue} alt="" className="w-7 h-7 object-contain dark:hidden" />
        <img src={iconaWhite} alt="" className="w-7 h-7 object-contain hidden dark:block" />
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">MyMedicalFlow</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            I dati sono cifrati nel tuo Google Drive e restano allineati con il PC dello studio.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge>Pazienti</Badge>
            <Badge>Appuntamenti</Badge>
            <Badge>Fatture</Badge>
          </div>
        </div>
      </section>
    </div>
  )
}
