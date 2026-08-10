import { AlertTriangle } from 'lucide-react'
import { Card } from '../ui/Card'

interface ErroreAvvioProps {
  messaggio: string
}

/**
 * Schermata mostrata quando l'archivio dei dati non può essere aperto.
 *
 * In questo stato l'app non prosegue di proposito: continuare con un archivio
 * vuoto significherebbe sovrascrivere i dati esistenti alla prima modifica.
 */
export function ErroreAvvio({ messaggio }: ErroreAvvioProps) {
  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
      <Card className="w-full max-w-lg">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Impossibile aprire l'archivio dei dati
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-words">
              {messaggio}
            </p>
          </div>
        </div>

        <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            I tuoi dati <span className="font-medium text-gray-900 dark:text-white">non sono stati modificati</span>.
            L'app si è fermata prima di scrivere qualsiasi cosa.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-400 mt-3 space-y-1.5 list-disc pl-5">
            <li>Riavvia l'applicazione.</li>
            <li>
              Verifica di aver effettuato l'accesso con lo stesso account Windows usato in
              precedenza: l'archivio è cifrato ed è leggibile solo da quell'account.
            </li>
            <li>Se il problema persiste, ripristina l'ultimo file di backup esportato.</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
