/**
 * Gesti del sistema iOS che l'app riproduce: "tira per aggiornare" in cima a
 * un elenco. (Il ritorno col bordo sinistro e la chiusura dei fogli stanno in
 * `Pagina` e `Conferma`, perché muovono quei componenti.)
 */

import { useEffect, useRef, useState, type RefObject } from 'react'
import { RefreshCw } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { EASE_OUT } from './Movimento'

/** Distanza (dopo la resistenza) oltre la quale il rilascio aggiorna. */
const SOGLIA = 72
/** Dove resta il contenuto mentre l'aggiornamento è in corso. */
const SOSTA = 56

export type StatoTiro = 'fermo' | 'tirando' | 'pronto' | 'aggiornando'

/**
 * Tirando verso il basso il contenitore già in cima, il contenuto scende con
 * resistenza (come iOS: metà della distanza del dito, al massimo 120 px).
 * Funziona col dito (touch, non passivo per fermare il rimbalzo nativo) e col
 * mouse, così si prova anche dal PC.
 */
export function useTiraPerAggiornare(
  contenitore: RefObject<HTMLElement>,
  onAggiorna: () => Promise<void>,
): { tiro: MotionValue<number>; stato: StatoTiro } {
  const tiro = useMotionValue(0)
  const [stato, setStato] = useState<StatoTiro>('fermo')
  const statoRef = useRef<StatoTiro>('fermo')
  const aggiorna = useRef(onAggiorna)
  aggiorna.current = onAggiorna

  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    let inizio: number | null = null
    let attivo = false

    const cambia = (s: StatoTiro) => {
      if (statoRef.current === s) return
      statoRef.current = s
      setStato(s)
    }
    const parti = (y: number) => {
      if (statoRef.current === 'aggiornando' || el.scrollTop > 0) return
      inizio = y
    }
    const muovi = (y: number, e: Event) => {
      if (inizio === null) return
      const dy = y - inizio
      if (!attivo && (dy <= 4 || el.scrollTop > 0)) return
      if (!attivo) {
        // Trascinando col mouse non si deve selezionare il testo
        el.style.userSelect = 'none'
        window.getSelection()?.removeAllRanges()
      }
      attivo = true
      if (e.cancelable) e.preventDefault()
      const v = Math.max(0, Math.min(120, dy * 0.5))
      tiro.set(v)
      cambia(v >= SOGLIA ? 'pronto' : 'tirando')
    }
    const fine = async () => {
      if (inizio === null) return
      inizio = null
      if (!attivo) return
      attivo = false
      el.style.userSelect = ''
      if (tiro.get() < SOGLIA) {
        animate(tiro, 0, { duration: 0.3, ease: EASE_OUT })
        cambia('fermo')
        return
      }
      cambia('aggiornando')
      animate(tiro, SOSTA, { duration: 0.24, ease: EASE_OUT })
      try {
        await aggiorna.current()
      } finally {
        // Un attimo di sosta: l'indicatore che sparisce subito non si vede girare.
        await new Promise((r) => setTimeout(r, 350))
        animate(tiro, 0, { duration: 0.3, ease: EASE_OUT })
        cambia('fermo')
      }
    }

    const tStart = (e: TouchEvent) => parti(e.touches[0].clientY)
    const tMove = (e: TouchEvent) => muovi(e.touches[0].clientY, e)
    const pDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      parti(e.clientY)
    }
    const pMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') muovi(e.clientY, e)
    }
    const pUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') void fine()
    }

    el.addEventListener('touchstart', tStart, { passive: true })
    el.addEventListener('touchmove', tMove, { passive: false })
    el.addEventListener('touchend', fine)
    el.addEventListener('touchcancel', fine)
    el.addEventListener('pointerdown', pDown)
    window.addEventListener('pointermove', pMove)
    window.addEventListener('pointerup', pUp)
    return () => {
      el.removeEventListener('touchstart', tStart)
      el.removeEventListener('touchmove', tMove)
      el.removeEventListener('touchend', fine)
      el.removeEventListener('touchcancel', fine)
      el.removeEventListener('pointerdown', pDown)
      window.removeEventListener('pointermove', pMove)
      window.removeEventListener('pointerup', pUp)
    }
  }, [contenitore, tiro])

  return { tiro, stato }
}

/** Il cerchio di vetro che compare sotto la testata: ruota col dito, gira durante l'aggiornamento. */
export function IndicatoreAggiornamento({ tiro, stato }: { tiro: MotionValue<number>; stato: StatoTiro }) {
  const opacita = useTransform(tiro, [8, SOGLIA * 0.7], [0, 1])
  const scala = useTransform(tiro, [0, SOGLIA], [0.6, 1])
  const rotazione = useTransform(tiro, [0, 120], [0, 300])
  const y = useTransform(tiro, (v) => v / 2 - 18)

  return (
    <motion.div
      aria-hidden={stato === 'fermo'}
      role="status"
      aria-label={stato === 'aggiornando' ? 'Aggiornamento dal Drive in corso' : undefined}
      style={{ opacity: opacita, scale: scala, y }}
      className="pointer-events-none absolute left-1/2 top-[var(--testata)] z-10 -ml-[18px] h-9 w-9 rounded-full vetro-spesso border flex items-center justify-center text-teal-700 dark:text-teal-300 shadow-[0_8px_20px_-8px_rgb(13_70_70/0.4)]"
    >
      <motion.span style={{ rotate: stato === 'aggiornando' ? undefined : rotazione }} className={stato === 'aggiornando' ? 'animate-spin' : ''}>
        <RefreshCw size={16} strokeWidth={2.4} className={stato === 'pronto' ? 'text-teal-600' : ''} />
      </motion.span>
    </motion.div>
  )
}
