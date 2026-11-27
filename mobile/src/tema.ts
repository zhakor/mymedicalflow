/**
 * Tema chiaro o scuro: una scelta di QUESTO telefono (localStorage), non
 * dell'archivio. Il PC ha la sua.
 *
 * iOS 26 colora la zona della barra di stato e dell'isola solo all'apertura
 * della pagina, in Safari e nell'app dalla Home (barra di stato "default",
 * colorata con theme-color: provato su iPhone 17, cambia solo riaprendo).
 * Cambiato il tema, quindi, si ricarica: index.html applica tema e
 * theme-color prima del primo disegno.
 */

import { useSincronizzazione } from './dati/sincronizzazione'

const CHIAVE = 'mmf.mobile.tema'
/** Colore di fondo dell'app (--fondo-app in index.css): testata e barra di stato. */
const COLORE = { chiaro: '#eef4f4', scuro: '#050a0b' }
/** Durata della dissolvenza del velo (#velo in index.html). */
const DISSOLVENZA_VELO = 280
/**
 * Attesa massima delle modifiche in corso prima di ricaricare. Con Drive vero
 * una richiesta può restare appesa: il velo non deve coprire l'app per sempre.
 */
const ATTESA_MASSIMA_SALVATAGGIO = 12_000

export const temaScuro = (): boolean => document.documentElement.classList.contains('dark')

export function cambiaTema(scuro: boolean): void {
  let ricordato = false
  try {
    localStorage.setItem(CHIAVE, scuro ? 'dark' : 'light')
    ricordato = localStorage.getItem(CHIAVE) === (scuro ? 'dark' : 'light')
  } catch {
    // Senza spazio vale fino alla chiusura dell'app
  }
  document.documentElement.classList.toggle('dark', scuro)
  // Un tag nuovo al posto del vecchio: Safari non sempre segue la sola modifica
  const nuovo = document.createElement('meta')
  nuovo.name = 'theme-color'
  nuovo.content = scuro ? COLORE.scuro : COLORE.chiaro
  const vecchio = document.querySelector('meta[name="theme-color"]')
  if (vecchio) vecchio.replaceWith(nuovo)
  else document.head.appendChild(nuovo)
  // Senza il tema ricordato la pagina ricaricata tornerebbe al vecchio
  if (ricordato) ricaricaQuandoSalvato()
}

/**
 * Ricarica quando non ci sono modifiche in corso di pubblicazione: andrebbero
 * perse, perché sul telefono i dati stanno solo in memoria. Il tema non è
 * nell'archivio, quindi di solito si ricarica subito. Con errore od offline
 * non ricarica: il tema vale già, la barra di stato si aggiorna alla
 * prossima apertura.
 *
 * Tutto avviene sotto il velo nel colore del nuovo tema: la schermata ci
 * sfuma dentro, si ricarica, e ne riemerge (vedi App).
 */
function ricaricaQuandoSalvato(): void {
  const inizio = Date.now()
  document.documentElement.classList.add('velo')
  let smetti = () => {}
  const scadenza = setTimeout(() => {
    smetti()
    document.documentElement.classList.remove('velo')
  }, ATTESA_MASSIMA_SALVATAGGIO)
  const valuta = (sync: string): boolean => {
    if (sync === 'in-corso') return false
    clearTimeout(scadenza)
    if (sync === 'allineato') {
      try {
        // Il velo resta anche sulla pagina ricaricata, dal primo disegno
        sessionStorage.setItem('mmf.velo', '1')
      } catch {
        // Senza: si ricarica comunque, solo senza velo all'avvio
      }
      // Solo a velo del tutto coprente
      setTimeout(() => location.reload(), Math.max(0, DISSOLVENZA_VELO - (Date.now() - inizio)))
    } else {
      document.documentElement.classList.remove('velo')
    }
    return true
  }
  if (valuta(useSincronizzazione.getState().sync)) return
  smetti = useSincronizzazione.subscribe((s) => {
    if (valuta(s.sync)) smetti()
  })
}
