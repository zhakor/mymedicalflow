import type { ReactNode } from 'react'
import { WifiOff, AlertTriangle } from 'lucide-react'
import { logoBianco, logoBlu } from '@desktop/assets/logos'

function Centrato({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  )
}

export function Avvio() {
  return (
    <Centrato>
      <img src={logoBlu} alt="MyMedicalFlow" className="w-40 h-40 object-contain dark:hidden" />
      <img src={logoBianco} alt="MyMedicalFlow" className="w-40 h-40 object-contain hidden dark:block" />
      <p className="mt-2 text-sm text-gray-500 animate-pulse">Apertura dell'archivio…</p>
    </Centrato>
  )
}

/** Il telefono lavora solo online: senza rete i dati non si mostrano. */
export function Offline() {
  return (
    <Centrato>
      <span className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mb-4">
        <WifiOff size={30} />
      </span>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Connessione necessaria</h2>
      <p className="mt-2 text-sm text-gray-500">
        MyMedicalFlow sul telefono funziona solo online, così i dati sono sempre quelli aggiornati. L'app riprende da sola
        appena torna la connessione.
      </p>
    </Centrato>
  )
}

export function Errore({ messaggio }: { messaggio: string | null }) {
  return (
    <Centrato>
      <AlertTriangle size={36} className="text-red-500 mb-3" />
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Archivio non disponibile</h2>
      <p className="mt-2 text-sm text-gray-500">{messaggio ?? 'Errore sconosciuto.'}</p>
    </Centrato>
  )
}
