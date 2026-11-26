import { create } from 'zustand'

/**
 * Stato della sincronizzazione del desktop con Drive (CR §5).
 * `spenta`: non configurata; `accesso`: serve di nuovo l'accesso Google.
 */
export type StatoSync = 'spenta' | 'avvio' | 'allineato' | 'in-corso' | 'offline' | 'errore' | 'accesso'

interface SincronizzazioneState {
  stato: StatoSync
  revisione: number | null
  aggiornatoIl: string | null
  errore: string | null
}

export const useSincronizzazioneStore = create<SincronizzazioneState>(() => ({
  stato: 'spenta',
  revisione: null,
  aggiornatoIl: null,
  errore: null,
}))
