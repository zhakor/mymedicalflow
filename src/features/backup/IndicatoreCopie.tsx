import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { leggiPreferenze } from '../../lib/backupService'
import { ShieldCheck, ShieldAlert } from 'lucide-react'

/** Oltre questi giorni senza copie l'indicatore diventa un avviso. */
const GIORNI_ALLARME = 7

function testoRelativo(quando: number): string {
  const minuti = Math.floor((Date.now() - quando) / 60000)
  if (minuti < 1) return 'poco fa'
  if (minuti < 60) return `${minuti} min fa`

  const ore = Math.floor(minuti / 60)
  if (ore < 24) return ore === 1 ? "un'ora fa" : `${ore} ore fa`

  const giorni = Math.floor(ore / 24)
  if (giorni === 1) return 'ieri'
  return `${giorni} giorni fa`
}

/**
 * Data dell'ultima copia riuscita.
 *
 * Un sistema che salva da solo, se smette di funzionare, smette in silenzio:
 * senza un riscontro visibile l'utente crede di essere protetto mentre non lo
 * è più. Questo indicatore è quel riscontro.
 */
export function IndicatoreCopie() {
  const [ultimo, setUltimo] = useState<number | null>(null)
  const [caricato, setCaricato] = useState(false)

  useEffect(() => {
    let annullato = false
    leggiPreferenze()
      .then((p) => {
        if (annullato) return
        setUltimo(p.ultimoBackup)
        setCaricato(true)
      })
      .catch(() => {
        if (!annullato) setCaricato(true)
      })
    return () => {
      annullato = true
    }
  }, [])

  if (!caricato) return null

  const giorni = ultimo === null ? Infinity : (Date.now() - ultimo) / 86_400_000
  const allarme = giorni > GIORNI_ALLARME

  return (
    <div
      className={clsx(
        'flex items-center gap-2 text-xs border px-3 py-2 rounded-xl',
        allarme
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400',
      )}
      title={
        ultimo !== null
          ? `Ultima copia: ${new Date(ultimo).toLocaleString('it-IT')}`
          : 'Nessuna copia ancora eseguita'
      }
    >
      {allarme ? (
        <ShieldAlert size={14} className="text-amber-500 flex-shrink-0" />
      ) : (
        <ShieldCheck size={14} className="text-teal-500 flex-shrink-0" />
      )}
      <span>
        {ultimo === null
          ? 'Nessuna copia di sicurezza'
          : `Ultima copia ${testoRelativo(ultimo)}`}
      </span>
    </div>
  )
}
