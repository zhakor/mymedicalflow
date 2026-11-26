/**
 * Pagina d'errore dell'app: intercetta gli errori di disegno di qualunque
 * schermata (error boundary) e al loro posto mostra una pagina curata, invece
 * di lasciare lo schermo bianco.
 *
 * Usa il meno possibile del resto dell'app (niente store, niente servizi):
 * deve funzionare proprio quando qualcosa si è rotto.
 */

import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw, Home, ChevronDown, Copy, Check } from 'lucide-react'
import { iconaBlue, iconaWhite } from '@desktop/assets/logos'
import { VERSIONE } from '../versione'

/** La posizione ricordata (scheda e cartella): azzerarla rompe un eventuale ciclo di errori. */
const CHIAVE_POSIZIONE = 'mmf.mobile.posizione'

declare global {
  interface Window {
    /** Segnala alla schermata d'emergenza di index.html che l'app è partita. */
    __mmfAvviata?: boolean
  }
}

function SchermataErrore({ errore }: { errore: Error }) {
  const [dettagliAperti, setDettagliAperti] = useState(false)
  const [copiato, setCopiato] = useState(false)

  // Chrome mette già il messaggio in testa alla traccia, Safari no: mai due volte
  const traccia = errore.stack?.split('\n').slice(0, 8).join('\n') ?? ''
  const dettagli = [
    traccia.includes(errore.message) ? '' : `${errore.name}: ${errore.message}`,
    traccia,
    `Versione: ${VERSIONE}`,
    `Pagina: ${location.href}`,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join('\n\n')

  async function copia() {
    try {
      await navigator.clipboard.writeText(dettagli)
      setCopiato(true)
      setTimeout(() => setCopiato(false), 2000)
    } catch {
      // Senza permesso agli appunti l'utente può selezionare il testo a mano
      setDettagliAperti(true)
    }
  }

  function tornaAllaHome() {
    try {
      localStorage.removeItem(CHIAVE_POSIZIONE)
    } catch {
      // Niente da fare: si ricarica comunque
    }
    location.replace(location.origin + location.pathname)
  }

  return (
    <div
      role="alert"
      className="h-full overflow-y-auto bg-[#eef4f4] dark:bg-[#050a0b] px-5 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2.5">
          <img src={iconaBlue} alt="" className="h-8 w-8 object-contain dark:hidden" />
          <img src={iconaWhite} alt="" className="hidden h-8 w-8 object-contain dark:block" />
          <span className="text-[15px] font-semibold text-gray-900 dark:text-white">MyMedicalFlow</span>
        </div>

        <div className="card mt-8 p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30">
            <AlertTriangle size={24} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Si è verificato un problema</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">
            Questa schermata ha incontrato un errore imprevisto e non è stato possibile mostrarla. I dati già salvati non sono
            stati toccati.
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => location.reload()}
              className="tocco flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 font-medium text-white active:bg-teal-700"
            >
              <RotateCw size={18} /> Ricarica l'app
            </button>
            <button
              onClick={tornaAllaHome}
              className="btn-secondary tocco flex w-full items-center justify-center gap-2 py-3"
            >
              <Home size={18} /> Torna alla Home
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Se l'errore si ripete, «Torna alla Home» riapre l'app dalla schermata iniziale.
          </p>
        </div>

        <div className="card mt-4 p-0 overflow-hidden">
          <button
            onClick={() => setDettagliAperti((v) => !v)}
            aria-expanded={dettagliAperti}
            className="tocco flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Dettagli tecnici
            <ChevronDown size={18} className={dettagliAperti ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {dettagliAperti && (
            <div className="border-t border-white/60 px-5 pb-5 pt-3 dark:border-white/10">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gray-900/[0.05] p-3 font-mono text-[11px] leading-relaxed text-gray-700 select-text dark:bg-white/[0.06] dark:text-gray-300">
                {dettagli}
              </pre>
              <button
                onClick={copia}
                className="mt-3 flex min-h-[40px] items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-400"
              >
                {copiato ? <Check size={16} /> : <Copy size={16} />}
                {copiato ? 'Copiato' : 'Copia i dettagli'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Versione {VERSIONE}</p>
      </div>
    </div>
  )
}

interface Stato {
  errore: Error | null
}

export class ConfineErrori extends Component<{ children: ReactNode }, Stato> {
  state: Stato = { errore: null }

  static getDerivedStateFromError(errore: Error): Stato {
    return { errore }
  }

  componentDidMount() {
    window.__mmfAvviata = true
  }

  componentDidCatch(errore: Error, info: ErrorInfo) {
    console.error('[MyMedicalFlow] errore di disegno', errore, info.componentStack)
  }

  render() {
    return this.state.errore ? <SchermataErrore errore={this.state.errore} /> : this.props.children
  }
}
