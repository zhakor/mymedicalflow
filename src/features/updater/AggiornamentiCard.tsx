import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { versioneApp } from '../../lib/updaterService'
import { useAggiornamentoStore } from '../../stores/aggiornamentoStore'
import { RefreshCw } from 'lucide-react'

/**
 * Controllo manuale degli aggiornamenti.
 * La versione è letta dal runtime Tauri, mai scritta a mano nel componente.
 */
export function AggiornamentiCard() {
  const [versione, setVersione] = useState<string | null>(null)
  const stato = useAggiornamentoStore((s) => s.stato)
  const controlla = useAggiornamentoStore((s) => s.controlla)

  useEffect(() => {
    let annullato = false
    versioneApp()
      .then((v) => {
        if (!annullato) setVersione(v)
      })
      .catch(() => {
        if (!annullato) setVersione(null)
      })
    return () => {
      annullato = true
    }
  }, [])

  const inControllo = stato === 'controllo'

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Aggiornamenti</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        L'app controlla da sola la presenza di aggiornamenti all'avvio. Puoi verificarlo
        anche adesso.
      </p>

      <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Versione installata</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
            {versione ?? '—'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => controlla({ manuale: true })}
          loading={inControllo}
          className="flex-shrink-0"
        >
          {!inControllo && <RefreshCw size={15} />}
          {inControllo ? 'Controllo…' : 'Controlla aggiornamenti'}
        </Button>
      </div>
    </Card>
  )
}
