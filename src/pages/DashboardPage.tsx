import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useProfiloStore } from '../stores/profiloStore'
import { pazienteService } from '../lib/pazienteService'
import { fatturaService } from '../lib/fatturaService'
import { appuntamentoService } from '../lib/appuntamentoService'
import { Users, Calendar, FileText, Activity } from 'lucide-react'
import { iconaWhite, iconaBlue, logoBianco, logoBlu } from '../assets/logos'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  note: string
}

function StatCard({ icon, label, value, note }: StatCardProps) {
  return (
    <Card className="flex items-start gap-4">
      <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-0.5">{value}</p>
        <p className="text-xs text-gray-400 mt-1">{note}</p>
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const profilo = useProfiloStore((s) => s.profilo)
  const totalePazienti = pazienteService.getPatients({ page: 1, pageSize: 1, filters: {} }).totalItems
  const totaleFatture = fatturaService.getCount()
  const fattureInAttesa = fatturaService.getInvoices({ page: 1, pageSize: 1, filters: { status: 'in_attesa' } }).totalItems

  const oggi = new Date().toISOString().slice(0, 10)
  const appuntamentiOggi = appuntamentoService.getAppointments({
    page: 1,
    pageSize: 1,
    filters: { dateFrom: oggi, dateTo: oggi },
  }).totalItems

  const nomeCompleto =
    profilo ? `${profilo.nome} ${profilo.cognome}` : 'Professionista'
  const professione = profilo?.professione ?? ''

  return (
    <div className="space-y-8">
      {/* Header di benvenuto */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Dashboard
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Benvenuto, {nomeCompleto} 👋
          </h2>
          {professione && (
            <div className="mt-2">
              <Badge>{professione}</Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2 rounded-xl">
          <Activity size={14} className="text-teal-500" />
          <span>App offline — tutti i dati sono locali</span>
        </div>
      </div>

      {/* Statistiche placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Users size={22} />}
          label="Pazienti"
          value={String(totalePazienti)}
          note={totalePazienti === 1 ? '1 paziente registrato' : `${totalePazienti} pazienti registrati`}
        />
        <StatCard
          icon={<Calendar size={22} />}
          label="Appuntamenti"
          value={String(appuntamentiOggi)}
          note={appuntamentiOggi === 1 ? '1 appuntamento oggi' : `${appuntamentiOggi} appuntamenti oggi`}
        />
        <StatCard
          icon={<FileText size={22} />}
          label="Fatture"
          value={String(totaleFatture)}
          note={fattureInAttesa > 0 ? `${fattureInAttesa} in attesa di pagamento` : 'Nessuna fattura in attesa'}
        />
      </div>

      {/* Card informativa principale */}
      <Card>
        <div className="flex items-start gap-4">
          {/* <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"> */}
            <img src={iconaBlue} alt="logo MyMedicalFlow" className="w-7 h-7 object-contain dark:hidden" />
            <img src={iconaWhite} alt="logo MyMedicalFlow" className="w-7 h-7 object-contain hidden dark:block" />
          {/* </div> */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
              MyMedicalFlow
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 max-w-lg">
              Il tuo gestionale medico desktop offline. Tutti i dati vengono salvati
              esclusivamente sul tuo dispositivo, senza connessione internet.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge>Pazienti</Badge>
              <Badge>Appuntamenti</Badge>
              <Badge>Fatture</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Logo */}
      <Card className="flex justify-center items-center py-10">
        <img
          src={logoBianco}
          alt="MyMedicalFlow"
          className="h-16 object-contain select-none pointer-events-none dark:block hidden"
        />
        <img
          src={logoBlu}
          alt="MyMedicalFlow"
          className="h-16 object-contain select-none pointer-events-none dark:hidden"
        />
      </Card>
    </div>
  )
}
