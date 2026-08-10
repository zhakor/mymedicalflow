import { create } from 'zustand'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  cercaAggiornamento,
  installaAggiornamento,
  riavvia,
  ErroreAggiornamento,
} from '../lib/updaterService'
import type { AvanzamentoDownload, InfoAggiornamento } from '../lib/updaterService'

export type StatoAggiornamento =
  | 'inattivo'
  | 'controllo'
  | 'disponibile'
  | 'download'
  | 'installazione'
  | 'daRiavviare'
  | 'aggiornato'
  | 'errore'

export interface AggiornamentoStore {
  stato: StatoAggiornamento
  info: InfoAggiornamento | null
  avanzamento: AvanzamentoDownload | null
  errore: string | null
  /** Il controllo automatico avviene una sola volta per sessione. */
  controllatoInSessione: boolean
  /** Vero se il controllo è stato chiesto dall'utente: cambia solo cosa si mostra. */
  richiestoDaUtente: boolean

  controlla: (opzioni?: { manuale?: boolean }) => Promise<void>
  installa: () => Promise<void>
  riavviaApp: () => Promise<void>
  chiudi: () => void
}

/** Riferimento all'oggetto del plugin: fuori dallo store perché non serializzabile. */
let updateCorrente: Update | null = null

export const useAggiornamentoStore = create<AggiornamentoStore>((set, get) => ({
  stato: 'inattivo',
  info: null,
  avanzamento: null,
  errore: null,
  controllatoInSessione: false,
  richiestoDaUtente: false,

  controlla: async ({ manuale = false } = {}) => {
    const { stato, controllatoInSessione } = get()

    // Un controllo automatico già fatto non si ripete a ogni render o navigazione
    if (!manuale && controllatoInSessione) return
    if (stato === 'controllo' || stato === 'download' || stato === 'installazione') return

    set({ stato: 'controllo', errore: null, richiestoDaUtente: manuale })
    try {
      const esito = await cercaAggiornamento()
      updateCorrente = esito?.update ?? null
      set({
        controllatoInSessione: true,
        info: esito?.info ?? null,
        stato: esito ? 'disponibile' : 'aggiornato',
      })
    } catch (err) {
      updateCorrente = null
      const messaggio =
        err instanceof ErroreAggiornamento ? err.message : 'Controllo degli aggiornamenti non riuscito.'
      // Offline è la condizione normale per un gestionale locale: si registra
      // che il controllo è avvenuto, per non riprovare a ogni navigazione.
      set({ controllatoInSessione: true, stato: 'errore', errore: messaggio })
    }
  },

  installa: async () => {
    if (!updateCorrente) return
    if (get().stato === 'download' || get().stato === 'installazione') return

    set({ stato: 'download', errore: null, avanzamento: { scaricati: 0, totale: null } })
    try {
      await installaAggiornamento(updateCorrente, (avanzamento) => {
        const completo = avanzamento.totale !== null && avanzamento.scaricati >= avanzamento.totale
        set({ avanzamento, stato: completo ? 'installazione' : 'download' })
      })
      set({ stato: 'daRiavviare' })
    } catch (err) {
      const messaggio =
        err instanceof ErroreAggiornamento
          ? err.message
          : "Impossibile completare l'aggiornamento."
      set({ stato: 'errore', errore: messaggio })
    }
  },

  riavviaApp: async () => {
    try {
      await riavvia()
    } catch (err) {
      console.error('[updater] riavvio non riuscito:', err)
      set({
        stato: 'errore',
        errore: "Riavvio non riuscito. Chiudi e riapri l'app per completare l'aggiornamento.",
      })
    }
  },

  chiudi: () => {
    // A installazione conclusa la finestra non si chiude: il riavvio è necessario
    if (get().stato === 'daRiavviare') return
    set({ stato: 'inattivo', errore: null, avanzamento: null, richiestoDaUtente: false })
  },
}))
