import { CalendarDays, FileText, Pencil, Smartphone, Trash2, UserPlus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNotificheStore, type Notifica } from '../../stores/notificheStore'

/** Curve di iOS, come nell'app sul telefono: decisa in entrata, rapida in uscita. */
const ENTRATA = [0.22, 1, 0.36, 1] as const
const USCITA = [0.4, 0, 1, 1] as const

const ICONA: Record<Notifica['tipo'], typeof FileText> = {
  paziente: UserPlus,
  appuntamento: CalendarDays,
  fattura: FileText,
}

/** In basso a destra: cosa è cambiato dal telefono (creato, modificato, eliminato). Ognuna sparisce dopo 10 secondi o con la X. */
export function NotificheTelefono() {
  const { notifiche, chiudi } = useNotificheStore()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
      {notifiche.map((n) => {
        const Icona = n.azione === 'eliminato' ? Trash2 : n.azione === 'modificato' ? Pencil : ICONA[n.tipo]
        return (
          <motion.div
            key={n.id}
            layout
            // Entra da destra verso sinistra, esce da sinistra verso destra
            initial={{ x: '115%', opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.38, ease: ENTRATA } }}
            exit={{ x: '115%', opacity: 0, transition: { duration: 0.28, ease: USCITA } }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <span
              className={
                n.azione === 'eliminato'
                  ? 'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                  : 'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400'
              }
            >
              <Icona size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Smartphone size={12} /> Dal telefono
              </p>
              <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{n.testo}</p>
            </div>
            <button
              onClick={() => chiudi(n.id)}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              aria-label="Chiudi notifica"
            >
              <X size={14} />
            </button>
          </motion.div>
        )
      })}
      </AnimatePresence>
    </div>
  )
}
