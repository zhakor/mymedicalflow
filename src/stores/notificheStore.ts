import { create } from 'zustand'
import type { Novita } from '../sync/novita'
import { suonaNotifica } from '../lib/suonoNotifica'

/** Quanto resta a schermo una notifica, se non la si chiude prima. */
const DURATA_MS = 10_000

export interface Notifica extends Novita {
  id: number
}

interface NotificheState {
  notifiche: Notifica[]
  aggiungi: (novita: Novita[]) => void
  chiudi: (id: number) => void
}

let contatore = 0

/** Notifiche in basso a destra per ciò che arriva dal telefono (pazienti, appuntamenti, fatture). */
export const useNotificheStore = create<NotificheState>((set, get) => ({
  notifiche: [],
  aggiungi: (novita) => {
    const nuove = novita.map((n) => ({ ...n, id: ++contatore }))
    if (nuove.length === 0) return
    set({ notifiche: [...get().notifiche, ...nuove] })
    // Un suono solo anche se ne arrivano più insieme
    suonaNotifica()
    for (const n of nuove) setTimeout(() => get().chiudi(n.id), DURATA_MS)
  },
  chiudi: (id) => set({ notifiche: get().notifiche.filter((n) => n.id !== id) }),
}))
