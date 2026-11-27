import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'

/** Titolo di gruppo dentro un modulo, come nel desktop. */
export function Gruppo({ titolo, children, extra }: { titolo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400">{titolo}</legend>
        {extra}
      </div>
      {children}
    </fieldset>
  )
}

/** Interruttore a riga intera (Età evolutiva, Ripeti...). */
export function Interruttore({
  attivo,
  onCambia,
  icona,
  children,
}: {
  attivo: boolean
  onCambia: (v: boolean) => void
  icona?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={attivo}
      onClick={() => onCambia(!attivo)}
      className={clsx(
        'tocco w-full flex items-center gap-3 px-4 py-3 rounded-[18px] text-left transition-colors vetro',
        attivo && '!bg-teal-50/80 dark:!bg-teal-900/25 !border-teal-200 dark:!border-teal-800',
      )}
    >
      {icona && <span className={attivo ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}>{icona}</span>}
      <span className={clsx('flex-1 text-sm', attivo ? 'text-teal-800 dark:text-teal-200' : 'text-gray-700 dark:text-gray-300')}>
        {children}
      </span>
      <span className={clsx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200', attivo ? 'bg-teal-600' : 'bg-gray-300/90 dark:bg-white/15')}>
        <motion.span
          className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.18)]"
          animate={{ x: attivo ? 20 : 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        />
      </span>
    </button>
  )
}

/** Scelta fra poche opzioni a pulsanti affiancati (presenza, vista dell'agenda). */
export function Segmenti<T extends string>({
  valore,
  opzioni,
  onCambia,
  etichetta,
}: {
  valore: T
  opzioni: { valore: T; etichetta: string }[]
  onCambia: (v: T) => void
  etichetta?: string
}) {
  // Un identificativo per gruppo: due controlli sulla stessa schermata non si scambiano la pillola
  const gruppo = useId()
  return (
    <div className="flex flex-col gap-1">
      {etichetta && <span className="label">{etichetta}</span>}
      <div className="grid gap-1 rounded-[14px] bg-gray-900/[0.06] dark:bg-white/[0.08] p-1" style={{ gridTemplateColumns: `repeat(${opzioni.length}, minmax(0, 1fr))` }}>
        {opzioni.map((o) => {
          const scelto = valore === o.valore
          return (
            <button
              key={o.valore}
              type="button"
              aria-pressed={scelto}
              onClick={() => onCambia(o.valore)}
              className={clsx(
                'relative min-h-[36px] rounded-[10px] px-2 text-sm font-medium',
                scelto ? 'text-teal-800 dark:text-white' : 'text-gray-600 dark:text-gray-300',
              )}
            >
              {scelto && (
                <motion.span
                  layoutId={`segmento-${gruppo}`}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 rounded-[10px] bg-white dark:bg-white/15 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.15)]"
                />
              )}
              <span className="relative">{o.etichetta}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AreaTesto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { etichetta: string }) {
  const { etichetta, ...resto } = props
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{etichetta}</span>
      <textarea rows={3} {...resto} className="input-field resize-none" />
    </label>
  )
}

/** Pulsante tondo in basso a destra per l'azione principale della scheda. */
export function PulsanteNuovo({ onClick, etichetta }: { onClick: () => void; etichetta: string }) {
  // Fuori dal contenuto animato: un antenato con transform sposterebbe il "fixed"
  return createPortal(
    <button
      onClick={onClick}
      aria-label={etichetta}
      className="fixed right-4 z-20 h-14 w-14 rounded-full bg-teal-600/90 backdrop-blur-xl text-white shadow-[0_12px_30px_-8px_rgb(13_148_136/0.6)] ring-1 ring-white/30 flex items-center justify-center active:bg-teal-700 bottom-[calc(var(--barra)+0.5rem)]"
    >
      <Plus size={26} strokeWidth={2.2} />
    </button>,
    document.body,
  )
}
