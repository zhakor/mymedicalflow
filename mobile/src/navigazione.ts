/**
 * Navigazione dell'app: la scheda corrente e le schermate aperte sopra le
 * schede (cartella, moduli), in una pila: si apre una cartella, da lì un nuovo
 * appuntamento, e "indietro" torna alla cartella.
 *
 * Ogni apertura aggiunge una voce alla cronologia del browser con il suo
 * livello, così il tasto o il gesto "indietro" del telefono chiude la
 * schermata invece di uscire dall'app.
 *
 * Scheda e cartella aperta si ricordano: riaprendo l'app si riparte da lì.
 */

import { create } from 'zustand'
import type { Scheda } from './componenti/Layout'

export type Vista =
  | { tipo: 'cartella'; id: string }
  | { tipo: 'paziente'; id?: string }
  | { tipo: 'appuntamento'; id?: string; data?: string; ora?: string; pazienteId?: string }
  | { tipo: 'fattura'; id?: string; pazienteId?: string }

// ─── Stato ────────────────────────────────────────────────────────────────────

interface Navigazione {
  scheda: Scheda
  pila: Vista[]
  vaiA: (s: Scheda) => void
  apri: (v: Vista) => void
  /** Chiude la schermata in cima, passando dalla cronologia. */
  chiudi: () => void
}

const CHIAVE = 'mmf.mobile.posizione'

/** Solo riferimenti di navigazione (scheda, id della cartella): mai dati sanitari. */
function posizioneSalvata(): { scheda: Scheda; pila: Vista[] } {
  try {
    const letta = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as { scheda?: Scheda; pila?: Vista[] } | null
    return { scheda: letta?.scheda ?? 'home', pila: Array.isArray(letta?.pila) ? letta!.pila : [] }
  } catch {
    return { scheda: 'home', pila: [] }
  }
}

/** Livello della voce di cronologia corrente: quante schermate erano aperte. */
const livelloCorrente = (): number => {
  const st = history.state as { mmf?: unknown } | null
  return typeof st?.mmf === 'number' ? st.mmf : 0
}

const iniziale = posizioneSalvata()

// Ricaricando la pagina la voce corrente conserva il livello di prima, ma i
// moduli aperti non si riaprono: il livello torna a quello che si ripristina
// davvero (la cartella, o nulla). Altrimenti "indietro" da una schermata
// aperta dopo il ricaricamento tornerebbe a una voce di livello più alto e
// non chiuderebbe niente.
const livelloRipristinabile = iniziale.pila.some((v) => v.tipo === 'cartella') ? 1 : 0
if (livelloCorrente() > livelloRipristinabile) history.replaceState({ mmf: livelloRipristinabile }, '')

export const useNavigazione = create<Navigazione>((set, get) => ({
  scheda: iniziale.scheda,
  pila: [],
  vaiA: (scheda) => set({ scheda }),
  apri: (v) => {
    const livello = get().pila.length + 1
    history.pushState({ mmf: livello }, '')
    set((s) => ({ pila: [...s.pila, v] }))
  },
  chiudi: () => history.back(),
}))

window.addEventListener('popstate', () => {
  // La pila si accorcia fino al livello della voce raggiunta: robusto anche se
  // la cronologia ha voci in più (per esempio dopo un ricaricamento).
  useNavigazione.setState((s) => ({ pila: s.pila.slice(0, livelloCorrente()) }))
})

/**
 * Ripristina la cartella aperta all'ultima uscita. Va chiamata quando i dati
 * sono pronti. I moduli non si ripristinano: riaprirli vuoti ingannerebbe.
 */
export function ripristinaPosizione(): void {
  const pila = iniziale.pila.filter((v) => v.tipo === 'cartella').slice(0, 1)
  if (pila.length === 0) return
  // Se la voce corrente è già quella della cartella non se ne aggiunge un'altra
  if (livelloCorrente() < 1) history.pushState({ mmf: 1 }, '')
  useNavigazione.setState({ pila })
}

useNavigazione.subscribe((s) => {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ scheda: s.scheda, pila: s.pila.filter((v) => v.tipo === 'cartella') }))
  } catch {
    // Spazio pieno o navigazione privata: si riparte dalla Home, nient'altro
  }
})

export const apri = (v: Vista) => useNavigazione.getState().apri(v)
export const chiudi = () => useNavigazione.getState().chiudi()

// ─── Avvisi brevi ─────────────────────────────────────────────────────────────

export type TipoAvviso = 'successo' | 'errore' | 'info'

interface Avvisi {
  avviso: { testo: string; tipo: TipoAvviso; id: number } | null
}

export const useAvvisi = create<Avvisi>(() => ({ avviso: null }))

let contatore = 0

/** Messaggio in basso per qualche secondo, come il riquadro di esito del desktop. */
export function avvisa(testo: string, tipo: TipoAvviso = 'successo'): void {
  useAvvisi.setState({ avviso: { testo, tipo, id: ++contatore } })
}
