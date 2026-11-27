import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { animate, motion, useMotionValue } from 'motion/react'
import { Button } from '@desktop/components/ui/Button'
import { EASE_OUT, SPINTA, UI, USCITA } from './Movimento'

interface ConfermaProps {
  titolo: string
  children: ReactNode
  etichetta: string
  pericolo?: boolean
  icona?: ReactNode
  onConferma: () => void
  onAnnulla: () => void
}

/**
 * Conferma come foglio dal basso: i pulsanti restano sotto il pollice.
 * Va resa dentro <AnimatePresence> perché possa uscire scendendo.
 */
export function Conferma({ titolo, children, etichetta, pericolo = true, icona, onConferma, onAnnulla }: ConfermaProps) {
  const y = useMotionValue(0)
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end bg-black/30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: UI }}
      exit={{ opacity: 0, transition: USCITA }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onAnnulla()
      }}
    >
      {/* Due livelli: l'esterno sale e scende, l'interno segue il dito */}
      <motion.div
        className="w-full"
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: SPINTA }}
        exit={{ y: '100%', transition: USCITA }}
      >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        // Si chiude trascinandolo in giù, come un foglio di iOS
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragMomentum={false}
        style={{ y }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 500) onAnnulla()
          else animate(y, 0, { duration: 0.3, ease: EASE_OUT })
        }}
        className="w-full rounded-t-[28px] vetro-spesso border-x-0 border-b-0 border-t px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.3)]"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300/80 dark:bg-white/20" aria-hidden />
        <div className="flex items-start gap-3">
          <span
            className={
              pericolo
                ? 'h-10 w-10 shrink-0 rounded-2xl bg-red-100/80 dark:bg-red-900/30 text-red-500 flex items-center justify-center'
                : 'h-10 w-10 shrink-0 rounded-2xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center'
            }
          >
            {icona ?? <AlertTriangle size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">{titolo}</h3>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{children}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" className="tocco btn-secondary" onClick={onAnnulla}>
            Annulla
          </Button>
          <Button variant={pericolo ? 'danger' : 'primary'} className="tocco" onClick={onConferma}>
            {etichetta}
          </Button>
        </div>
      </motion.div>
      </motion.div>
    </motion.div>
  )
}
