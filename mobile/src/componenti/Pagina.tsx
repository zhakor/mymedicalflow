import { ArrowLeft, X } from 'lucide-react'
import { animate, motion, useDragControls, useMotionValue, type PanInfo } from 'motion/react'
import type { PointerEvent as PointerEventReact, ReactNode } from 'react'
import { chiudi } from '../navigazione'
import { EASE_OUT, SPINTA, USCITA, Sfondo } from './Movimento'

interface PaginaProps {
  titolo: string
  /**
   * "indietro": una pagina che entra da destra (la cartella), come in iOS. Il
   *   ritorno non ha animazione né gesto proprio: dentro Safari il bordo
   *   sinistro è del browser, e due movimenti insieme producevano glitch.
   * "chiudi": un foglio che sale dal basso (i moduli), come in iOS; si chiude
   *   anche trascinando in giù la testata.
   */
  ritorno?: 'indietro' | 'chiudi'
  azioni?: ReactNode
  /** Pulsanti fissi in basso (Salva, Elimina...). */
  piede?: ReactNode
  children: ReactNode
}

/** Oltre questa frazione dello schermo, o con un gesto veloce, il rilascio chiude. */
const FRAZIONE = 0.3
const VELOCITA = 600

/** Schermata a tutto schermo sopra le schede: cartella, moduli. */
export function Pagina({ titolo, ritorno = 'indietro', azioni, piede, children }: PaginaProps) {
  const foglio = ritorno === 'chiudi'
  const fuori = foglio ? { y: '100%' } : { x: '100%' }
  const dentro = foglio ? { y: 0 } : { x: 0 }
  const trascina = useDragControls()
  // Posizione sull'asse del gesto: la guidiamo noi al rilascio
  const posizione = useMotionValue(0)

  function rilascio(_: unknown, info: PanInfo) {
    if (info.offset.y > window.innerHeight * FRAZIONE || info.velocity.y > VELOCITA) chiudi()
    // Sotto soglia torna al suo posto, con la curva di tutta l'app
    else animate(posizione, 0, { duration: 0.3, ease: EASE_OUT })
  }

  /** Il foglio si trascina dalla testata, ma non partendo da un pulsante. */
  function iniziaDallaTestata(e: PointerEventReact) {
    if (!foglio || (e.target as HTMLElement).closest('button, a')) return
    trascina.start(e)
  }

  /**
   * Uscita: la pagina sparisce subito. Il foglio scende, ma solo se chiuso
   * dall'app: dopo il gesto del browser, che ha già animato, sparisce subito.
   */
  const uscita = (animata: boolean = true) =>
    foglio && animata ? { ...fuori, transition: USCITA } : { opacity: 0, transition: { duration: 0 } }

  return (
    // Due livelli: l'esterno entra ed esce, l'interno segue il dito.
    // Guidare la stessa coordinata con entrambi li fa ostacolare a vicenda.
    <motion.div
      initial={fuori}
      animate={{ ...dentro, transition: SPINTA }}
      variants={{ uscita }}
      exit="uscita"
      className="fixed inset-0"
    >
    <motion.div
      // Solo i fogli si trascinano (in giù per chiuderli)
      drag={foglio ? 'y' : false}
      dragListener={false}
      dragControls={trascina}
      dragConstraints={{ top: 0, bottom: 0 }}
      // Libero verso la chiusura, bloccato nell'altro verso
      dragElastic={{ top: 0, bottom: 1 }}
      dragMomentum={false}
      onDragEnd={rilascio}
      style={{ y: posizione }}
      className="absolute inset-0 isolate bg-[#eef4f4] dark:bg-[#050a0b] shadow-[-12px_0_40px_-12px_rgb(0_0_0/0.25)]"
    >
      <Sfondo />
      <div className="absolute inset-0 overflow-y-auto overscroll-contain pt-[var(--testata)]" style={{ paddingBottom: piede ? 'calc(5rem + env(safe-area-inset-bottom))' : undefined }}>
        {children}
      </div>

      <header
        onPointerDown={iniziaDallaTestata}
        style={foglio ? { touchAction: 'none' } : undefined}
        className="absolute inset-x-0 top-0 z-10 vetro-spesso border-0 border-b pt-[env(safe-area-inset-top)]"
      >
        {foglio && <div aria-hidden className="absolute left-1/2 top-[calc(0.375rem+env(safe-area-inset-top))] -ml-5 h-1.5 w-10 rounded-full bg-gray-400/40 dark:bg-white/20" />}
        <div className="h-14 px-1 flex items-center gap-1">
          <button
            onClick={chiudi}
            className="tocco flex items-center justify-center rounded-full text-teal-700 dark:text-teal-300"
            aria-label={foglio ? 'Chiudi' : 'Indietro'}
          >
            {foglio ? <X size={22} /> : <ArrowLeft size={22} />}
          </button>
          <h2 className="flex-1 text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">{titolo}</h2>
          {azioni && <div className="flex items-center gap-1 pr-1">{azioni}</div>}
        </div>
      </header>

      {piede && (
        <footer className="absolute inset-x-0 bottom-0 z-10 vetro-spesso border-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3">
          {piede}
        </footer>
      )}
    </motion.div>
    </motion.div>
  )
}

/** Riquadro con titolo, come le card delle sezioni del desktop. */
export function Sezione({ titolo, icona, extra, children }: { titolo: string; icona?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          {icona && <span className="text-teal-600 dark:text-teal-400">{icona}</span>}
          {titolo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  )
}
