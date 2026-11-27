/**
 * Linguaggio di movimento dell'app: pochi gesti, sempre gli stessi.
 * Curve e durate dalla guida di stile (nessun rimbalzo, uscite più brevi
 * delle entrate). Con "riduci movimento" attivo restano solo le dissolvenze.
 */

import { motion, type Transition } from 'motion/react'
import type { ReactNode } from 'react'

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const EASE_EXIT = [0.55, 0.055, 0.675, 0.19] as const

export const UI: Transition = { duration: 0.24, ease: EASE_OUT }
/** Pagina che entra da destra (cartella), foglio che sale dal basso (moduli). */
export const SPINTA: Transition = { duration: 0.38, ease: EASE_OUT }
export const USCITA: Transition = { duration: 0.24, ease: EASE_EXIT }

/** Comparsa di un elemento di un elenco: opacità e 10 px di salita, a scalare per i primi sei. */
export function Comparsa({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...UI, delay: Math.min(i, 5) * 0.05 }}
    >
      {children}
    </motion.div>
  )
}

/** Sfondo con luci tenui nei colori dell'app: dà al vetro qualcosa da sfocare. */
export function Sfondo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--fondo-app)]">
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-teal-300/35 blur-3xl dark:bg-teal-700/25" />
      <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-900/25" />
      <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-900/20" />
    </div>
  )
}
